<?php
require_once __DIR__ . '/../models/Membership.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/LoyaltyHistory.php';
require_once __DIR__ . '/../models/UserVoucher.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class MembershipController {
    private $membershipModel;
    private $userModel;

    public function __construct() {
        $this->membershipModel = new Membership();
        $this->userModel = new User();
    }

    public function index() {
        return Response::success(['memberships' => $this->membershipModel->getAll()]);
    }

    public function show($id) {
        $m = $this->membershipModel->getById($id);
        if (!$m) return Response::error('Membership not found', 404);
        return Response::success(['membership' => $m]);
    }

    public function getUserTier($userId) {
        $user = $this->userModel->findById($userId);
        if (!$user) return Response::error('User not found', 404);
        require_once __DIR__ . '/../models/UserProfile.php';
        $profileModel = new UserProfile();
        $profile = $profileModel->getByUserId($userId);
        $tierId = $profile['membership_id'] ?? 1;
        $tier = $this->membershipModel->getById($tierId);

        // Calculate total spent from paid bookings
        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare("SELECT COALESCE(SUM(final_price), 0) as total_spent FROM bookings WHERE user_id = :uid AND status = 'Paid'");
        $stmt->bindParam(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $tier['total_spent'] = (int)($row['total_spent'] ?? 0);

        // Auto-assign birthday voucher if today is user's birthday
        $this->checkBirthdayVoucher($userId, $db);

        return Response::success(['tier' => $tier]);
    }

    private function checkBirthdayVoucher($userId, $db) {
        try {
            // Check if today matches user's birthday (month + day)
            $stmt = $db->prepare("SELECT dob FROM user_profiles WHERE user_id = :uid");
            $stmt->bindParam(':uid', $userId, PDO::PARAM_INT);
            $stmt->execute();
            $userData = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$userData || empty($userData['dob'])) return;

            $dob = $userData['dob'];
            if (date('m-d', strtotime($dob)) !== date('m-d')) return;

            // Find active birthday promo specifically
            $today = date('Y-m-d');
            $stmt = $db->prepare("SELECT id FROM promotions WHERE code = 'BIRTHDAY' AND start_date <= :today1 AND end_date >= :today2");
            $stmt->bindValue(':today1', $today);
            $stmt->bindValue(':today2', $today);
            $stmt->execute();
            $promos = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (empty($promos)) return;

            $voucherModel = new UserVoucher();
            foreach ($promos as $promo) {
                // Check if already assigned this year
                $year = date('Y');
                $stmt2 = $db->prepare("SELECT id FROM user_vouchers WHERE user_id = :uid AND promotion_id = :pid AND YEAR(assigned_at) = :yr LIMIT 1");
                $stmt2->bindParam(':uid', $userId, PDO::PARAM_INT);
                $stmt2->bindParam(':pid', $promo['id'], PDO::PARAM_INT);
                $stmt2->bindParam(':yr', $year, PDO::PARAM_STR);
                $stmt2->execute();
                if (!$stmt2->fetch()) {
                    $voucherModel->assignToUser($userId, (int)$promo['id']);
                }
            }
        } catch (\Exception $e) {
            // Non-blocking
            error_log('Birthday voucher check error: ' . $e->getMessage());
        }
    }

    public function checkUpgrade($userId) {
        try {
            $user = $this->userModel->findById($userId);
            if (!$user) throw new Exception('User not found');
            $points = max(0, (int)($user['current_points'] ?? 0));
            $eligibleTier = $this->membershipModel->getTierByPoints($points);

            // Get next tier info
            $allTiers = $this->membershipModel->getAll();
            $nextTier = null;
            if ($eligibleTier) {
                foreach ($allTiers as $t) {
                    if ((int)$t['min_points_required'] > (int)$eligibleTier['min_points_required']) {
                        $nextTier = $t;
                        break;
                    }
                }
            }

            // Auto upgrade/downgrade if eligible tier differs from current
            $upgraded = false;
            $downgraded = false;
            if ($eligibleTier) {
                require_once __DIR__ . '/../models/UserProfile.php';
                $profileModel = new UserProfile();
                $profile = $profileModel->getByUserId($userId);
                $currentTierId = $profile['membership_id'] ?? 1;
                if ((int)$eligibleTier['id'] !== (int)$currentTierId) {
                    $profileModel->update($userId, ['membership_id' => $eligibleTier['id']]);

                    if ((int)$eligibleTier['id'] > (int)$currentTierId) {
                        $upgraded = true;

                        // Auto-assign tier upgrade voucher
                        $tierMap = [
                            'silver'   => 'TIER_SILVER',
                            'gold'     => 'TIER_GOLD',
                            'platinum' => 'TIER_PLATINUM',
                        ];
                        $tierName = strtolower($eligibleTier['rank_name'] ?? '');
                        $promoCode = $tierMap[$tierName] ?? null;
                        if ($promoCode) {
                            try {
                                $db = Database::getInstance()->getConnection();
                                $stmt = $db->prepare("SELECT id FROM promotions WHERE code = :code LIMIT 1");
                                $stmt->bindParam(':code', $promoCode);
                                $stmt->execute();
                                $promo = $stmt->fetch(PDO::FETCH_ASSOC);
                                if ($promo) {
                                    $voucherModel = new UserVoucher();
                                    $voucherModel->assignToUser($userId, (int)$promo['id']);
                                }
                            } catch (Exception $ignore) {}
                        }
                    } else {
                        $downgraded = true;
                    }
                }
            }

            return Response::success([
                'current_points' => $points,
                'eligible_tier' => $eligibleTier,
                'upgraded' => $upgraded,
                'downgraded' => $downgraded,
                'next_tier' => $nextTier,
                'points_to_next' => $nextTier ? max(0, (int)$nextTier['min_points_required'] - $points) : 0
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi: '.$e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/memberships
     * Bulk update membership tiers (min_points_required, discount_rate)
     */
    public function update() {
        try {
            AuthMiddleware::requirePermission('system.settings');

            $input = json_decode(file_get_contents('php://input'), true);
            $tiers = $input['tiers'] ?? null;

            if (!$tiers || !is_array($tiers)) {
                return Response::error('Dữ liệu không hợp lệ. Cần truyền mảng tiers.', 400);
            }

            $ok = $this->membershipModel->updateAll($tiers);
            if (!$ok) {
                return Response::error('Không thể cập nhật hạng thành viên', 500);
            }

            return Response::success([
                'message'     => 'Cập nhật hạng thành viên thành công',
                'memberships' => $this->membershipModel->getAll(),
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi: ' . $e->getMessage(), 500);
        }
    }
}

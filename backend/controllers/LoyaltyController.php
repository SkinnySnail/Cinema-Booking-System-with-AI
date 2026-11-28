<?php
require_once __DIR__ . '/../models/LoyaltyHistory.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../config/Database.php';

class LoyaltyController {
    private $historyModel;
    private $userModel;

    public function __construct() {
        $this->historyModel = new LoyaltyHistory();
        $this->userModel = new User();
    }

    private function isAdminOrManager(): bool {
        $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        $roleName = strtolower(trim((string)($_REQUEST['auth_user_role'] ?? '')));
        return in_array($roleId, [4, 5], true) || in_array($roleName, ['admin', 'manager'], true);
    }

    private function authorizeOwnerOrManager(int $targetUserId): int {
        AuthMiddleware::authenticate();
        $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
        if ($authUserId <= 0) {
            Response::unauthorized('Vui lòng đăng nhập');
        }
        if ($authUserId !== $targetUserId && !$this->isAdminOrManager()) {
            Response::forbidden('Bạn không có quyền truy cập điểm thưởng của tài khoản khác');
        }
        return $authUserId;
    }

    /**
     * Đồng bộ users.current_points sau khi chèn loyalty_history:
     * Trigger after_loyalty_insert đã tự cộng/trừ điểm; chỉ fallback UPDATE nếu DB không có trigger.
     */
    private function resolvePointsAfterHistoryInsert(PDO $db, int $userId, int $beforePoints, int $expectedTotal): int {
        $stmt = $db->prepare("SELECT current_points FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
        $afterPoints = (int)$stmt->fetchColumn();

        if ($afterPoints === $beforePoints && $expectedTotal !== $beforePoints) {
            $updateStmt = $db->prepare("UPDATE users SET current_points = :points WHERE id = :id");
            if (!$updateStmt->execute([':points' => $expectedTotal, ':id' => $userId])) {
                throw new RuntimeException('Could not update point balance');
            }
            return $expectedTotal;
        }

        return $afterPoints;
    }

    public function getHistory($userId) {
        try {
            $targetUserId = (int)$userId;
            if ($targetUserId <= 0) {
                return Response::error('User ID required', 400);
            }
            $this->authorizeOwnerOrManager($targetUserId);

            $history = $this->historyModel->getByUser($targetUserId);
            return Response::success(['history' => $history]);
        } catch (Exception $e) {
            return Response::error('Lỗi: '.$e->getMessage(), 500);
        }
    }

    public function getCurrentPoints($userId = null) {
        try {
            $targetUserId = (int)$userId;
            if ($targetUserId <= 0) {
                return Response::error('User ID required', 400);
            }
            $this->authorizeOwnerOrManager($targetUserId);

            $user = $this->userModel->findById($targetUserId);
            if (!$user) return Response::error('User not found', 404);
            return Response::success(['current_points' => (int)$user['current_points']]);
        } catch (Exception $e) {
            return Response::error('Lỗi: '.$e->getMessage(), 500);
        }
    }

    public function earnPoints()
    {
        try {
            AuthMiddleware::authenticate();
            $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);

            $data = json_decode(file_get_contents("php://input"), true) ?: [];

            $userId = isset($data['user_id']) ? (int)$data['user_id'] : $authUserId;
            $relatedBookingId = isset($data['booking_id']) ? (int)$data['booking_id'] : 0;

            if ($userId <= 0 || $relatedBookingId <= 0) {
                return Response::error('Missing user_id or booking_id', 400);
            }

            if ($userId !== $authUserId && !$this->isAdminOrManager()) {
                return Response::forbidden('Bạn không có quyền cộng điểm cho tài khoản khác');
            }

            // Prevent double earning: check if points already awarded for this booking
            $db = Database::getInstance()->getConnection();
            $checkStmt = $db->prepare(
                "SELECT id FROM loyalty_history WHERE user_id = :uid AND related_booking_id = :bid AND type = 'PURCHASE' LIMIT 1"
            );
            $checkStmt->execute([':uid' => $userId, ':bid' => $relatedBookingId]);
            if ($checkStmt->fetch()) {
                // Already awarded — return current totals without error
                $user = $this->userModel->findById($userId);
                $newTotal = (int)($user['current_points'] ?? 0);
                return Response::success(['earned_points' => 0, 'current_points' => $newTotal, 'already_awarded' => true]);
            }

            // Use final_price from the paid booking record (authoritative server-side amount)
            $bookingStmt = $db->prepare("SELECT final_price, status FROM bookings WHERE id = :bid AND user_id = :uid");
            $bookingStmt->execute([':bid' => $relatedBookingId, ':uid' => $userId]);
            $booking = $bookingStmt->fetch(PDO::FETCH_ASSOC);
            if (!$booking) {
                return Response::error('Booking not found', 404);
            }
            if (($booking['status'] ?? '') !== 'Paid') {
                return Response::error('Chỉ đơn hàng đã thanh toán mới được tích điểm', 400);
            }

            $amount = (float)$booking['final_price'];
            $points = LoyaltyHistory::calculatePoints($amount);

            if ($points <= 0) {
                $user = $this->userModel->findById($userId);
                return Response::success(['earned_points' => 0, 'current_points' => (int)($user['current_points'] ?? 0)]);
            }

            $desc = "Tích điểm từ đơn hàng #$relatedBookingId";

            $db->beginTransaction();

            $userLockStmt = $db->prepare("SELECT id, current_points FROM users WHERE id = :id FOR UPDATE");
            $userLockStmt->execute([':id' => $userId]);
            $user = $userLockStmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                $db->rollBack();
                return Response::error('User not found', 404);
            }

            $beforePoints = (int)$user['current_points'];
            $ok = $this->historyModel->create(
                $userId,
                $points,
                'PURCHASE',
                $desc,
                $relatedBookingId
            );

            if (!$ok) {
                $db->rollBack();
                return Response::error('Could not record points', 500);
            }

            $newTotal = $this->resolvePointsAfterHistoryInsert($db, $userId, $beforePoints, $beforePoints + $points);

            $db->commit();

            return Response::success(['earned_points' => $points, 'current_points' => $newTotal]);

        } catch (Exception $e) {
            if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
                $db->rollBack();
            }
            return Response::error('Lỗi: ' . $e->getMessage(), 500);
        }
    }

    public function redeemPoints() {
        try {
            AuthMiddleware::authenticate();
            $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);

            $data = json_decode(file_get_contents('php://input'), true) ?: [];
            $userId = isset($data['user_id']) ? (int)$data['user_id'] : $authUserId;
            $points = isset($data['points']) ? (int)$data['points'] : 0;
            $voucherId = $data['voucher_id'] ?? null;

            if ($userId <= 0 || $points <= 0) return Response::error('Missing user_id or invalid points', 400);

            if ($userId !== $authUserId && !$this->isAdminOrManager()) {
                return Response::forbidden('Bạn không có quyền trừ điểm của tài khoản khác');
            }

            $db = Database::getInstance()->getConnection();
            $db->beginTransaction();

            $userStmt = $db->prepare("SELECT id, current_points FROM users WHERE id = :id FOR UPDATE");
            $userStmt->execute([':id' => $userId]);
            $user = $userStmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                $db->rollBack();
                return Response::error('User not found', 404);
            }

            $currentPoints = (int)$user['current_points'];
            if ($currentPoints < $points) {
                $db->rollBack();
                return Response::error('Not enough points', 400);
            }

            $neg = -1 * abs($points);
            $ok = $this->historyModel->create($userId, $neg, 'REDEEM', 'Redeemed for voucher ID: '.($voucherId ?: 'N/A'));
            if (!$ok) {
                $db->rollBack();
                return Response::error('Could not redeem points', 500);
            }

            $newTotal = $this->resolvePointsAfterHistoryInsert($db, $userId, $currentPoints, $currentPoints - abs($points));

            $db->commit();

            // Recalculate membership tier after point deduction
            try {
                require_once __DIR__ . '/../models/Membership.php';
                require_once __DIR__ . '/../models/UserProfile.php';
                $membershipModel = new Membership();
                $profileModel = new UserProfile();
                $eligibleTier = $membershipModel->getTierByPoints($newTotal);
                if ($eligibleTier) {
                    $profile = $profileModel->getByUserId($userId);
                    $currentTierId = $profile['membership_id'] ?? 1;
                    if ((int)$eligibleTier['id'] !== (int)$currentTierId) {
                        $profileModel->update($userId, ['membership_id' => $eligibleTier['id']]);
                    }
                }
            } catch (Exception $ignore) {}

            return Response::success(['redeemed_points' => $points, 'current_points' => $newTotal]);
        } catch (Exception $e) {
            if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
                $db->rollBack();
            }
            return Response::error('Lỗi: '.$e->getMessage(), 500);
        }
    }
}

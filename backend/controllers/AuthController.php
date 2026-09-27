<?php
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/UserProfile.php';
require_once __DIR__ . '/../utils/EmailService.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../config/Config.php';

require_once __DIR__ . '/../models/UserVoucher.php';
require_once __DIR__ . '/../config/Database.php';

class AuthController {
    private $userModel;
    private $userProfileModel;
    private $emailService;
    
    // File path để lưu verification codes
    private $codesFilePath;
    
    public function __construct() {
        $this->userModel = new User();
        $this->userProfileModel = new UserProfile();
        $this->emailService = new EmailService();
        $this->codesFilePath = __DIR__ . '/../uploads/verification_codes.json';
        
        // Tạo thư mục uploads nếu chưa có
        if (!file_exists(__DIR__ . '/../uploads')) {
            mkdir(__DIR__ . '/../uploads', 0777, true);
        }
    }
    
    /**
     * Đọc verification codes từ file
     */
    private function getVerificationCodes() {
        if (!file_exists($this->codesFilePath)) {
            return [];
        }
        $content = file_get_contents($this->codesFilePath);
        return json_decode($content, true) ?: [];
    }
    
    /**
     * Lưu verification codes vào file
     */
    private function saveVerificationCodes($codes) {
        file_put_contents($this->codesFilePath, json_encode($codes, JSON_PRETTY_PRINT));
    }
    
    /**
     * Xóa codes đã hết hạn
     */
    private function cleanExpiredCodes() {
        $codes = $this->getVerificationCodes();
        $now = time();
        $codes = array_filter($codes, function($item) use ($now) {
            return $item['expires_at'] > $now;
        });
        $this->saveVerificationCodes($codes);
    }
    
    /**
     * POST /api/auth/send-verification
     * Gửi mã xác minh email
     */
    public function sendVerification() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate input
            $required = ['email', 'fullName', 'phone', 'dob', 'password'];
            foreach ($required as $field) {
                if (empty($data[$field])) {
                    return Response::error("Thiếu thông tin: $field", 400);
                }
            }
            
            $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
            $phone = preg_replace('/\D+/', '', (string)$data['phone']);
            $fullName = trim((string)$data['fullName']);
            
            // Validate email format
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return Response::error('Email không hợp lệ', 400);
            }

            if ($fullName === '') {
                return Response::error('Họ tên không được để trống', 400);
            }
            
            // Kiểm tra email đã tồn tại chưa
            if ($this->userModel->findByEmail($email)) {
                return Response::error('Email đã được sử dụng', 409);
            }
            
            // Validate phone
            if (!preg_match('/^0\d{9,10}$/', $phone)) {
                return Response::error('Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)', 400);
            }

            if ($this->userProfileModel->existsByPhone($phone)) {
                return Response::error('Số điện thoại đã được sử dụng', 409);
            }
            
            // Validate phone uniqueness
            if ($this->userProfileModel->findByPhone($data['phone'])) {
                return Response::error('Số điện thoại đã được sử dụng', 409);
            }
            
            // Validate DOB
            $dob = new DateTime($data['dob']);
            
            // Validate password
            if (strlen($data['password']) < 6) {
                return Response::error('Mật khẩu phải có ít nhất 6 ký tự', 400);
            }
            
            // Generate 6-digit verification code
            $verificationCode = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);

            $data['phone'] = $phone;
            $data['fullName'] = $fullName;
            
            // Lưu code vào file (expire sau 5 phút)
            $codes = $this->getVerificationCodes();
            $codes[$email] = [
                'code' => $verificationCode,
                'data' => $data,
                'expires_at' => time() + 300 // 5 minutes
            ];
            $this->saveVerificationCodes($codes);
            $this->cleanExpiredCodes(); // Dọn dẹp codes cũ
            
            // Gửi email
            $sent = $this->emailService->sendVerificationCode($email, $data['fullName'], $verificationCode);
            
            if (!$sent) {
                return Response::error('Không thể gửi email. Vui lòng thử lại', 500);
            }
            
            return Response::success([
                'message' => 'Mã xác minh đã được gửi đến email của bạn',
                'expiresIn' => 300
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * POST /api/auth/verify-email
     * Xác minh mã và tạo tài khoản
     */
    public function verifyEmail() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            if (empty($data['email']) || empty($data['code'])) {
                return Response::error('Email và mã xác minh không được để trống', 400);
            }
            
            $email = $data['email'];
            $code = $data['code'];
            
            // Đọc codes từ file
            $codes = $this->getVerificationCodes();
            
            // Kiểm tra code có tồn tại không
            if (!isset($codes[$email])) {
                return Response::error('Mã xác minh không tồn tại hoặc đã hết hạn', 400);
            }
            
            $verification = $codes[$email];
            
            // Kiểm tra code đã hết hạn chưa
            if (time() > $verification['expires_at']) {
                unset($codes[$email]);
                $this->saveVerificationCodes($codes);
                return Response::error('Mã xác minh đã hết hạn', 400);
            }
            
            // Kiểm tra code có đúng không
            if ($code !== $verification['code']) {
                return Response::error('Mã xác minh không đúng', 400);
            }
            
            // Code hợp lệ - Tạo tài khoản
            $userData = $verification['data'];
            $phone = preg_replace('/\D+/', '', (string)($userData['phone'] ?? ''));
            
            // Hash password
            $passwordHash = password_hash($userData['password'], PASSWORD_BCRYPT, ['cost' => 10]);

            if (!preg_match('/^0\d{9,10}$/', $phone)) {
                return Response::error('Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)', 400);
            }

            if ($this->userProfileModel->existsByPhone($phone)) {
                return Response::error('Số điện thoại đã được sử dụng', 409);
            }
            
            // Tạo user
            $userId = $this->userModel->create([
                'email' => $email,
                'password_hash' => $passwordHash,
                'role_id' => 2, // Member (default)
                'status' => 'Active'
            ]);
            
            if (!$userId) {
                return Response::error('Không thể tạo tài khoản', 500);
            }
            
            // Tạo user profile
            $profileCreated = $this->userProfileModel->create([
                'user_id' => $userId,
                'full_name' => $userData['fullName'],
                'phone' => $phone,
                'dob' => $userData['dob'],
                'membership_id' => 1 // Bronze (default)
            ]);
            
            if (!$profileCreated) {
                // Rollback user creation nếu tạo profile thất bại
                $this->userModel->delete($userId);
                return Response::error('Không thể tạo hồ sơ người dùng', 500);
            }
            
            // Xóa verification code khỏi file
            $codes = $this->getVerificationCodes();
            unset($codes[$email]);
            $this->saveVerificationCodes($codes);

            // Auto-assign welcome voucher
            try {
                $db = Database::getInstance()->getConnection();
                $stmt = $db->prepare("SELECT id FROM promotions WHERE code = 'WELCOME_NEW' LIMIT 1");
                $stmt->execute();
                $welcomePromo = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($welcomePromo) {
                    $voucherModel = new UserVoucher();
                    $voucherModel->assignToUser($userId, (int)$welcomePromo['id']);
                }
            } catch (Exception $ignore) {
                // Non-blocking: welcome voucher is a bonus
            }

            return Response::success([
                'message' => 'Đăng ký tài khoản thành công!',
                'userId' => $userId
            ], 201);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * POST /api/auth/login
     * Đăng nhập
     */
    public function login() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            if (empty($data['email']) || empty($data['password'])) {
                return Response::error('Email và mật khẩu không được để trống', 400);
            }
            
            $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
            
            // Tìm user theo email
            $user = $this->userModel->findByEmail($email);
            
            if (!$user) {
                return Response::error('Email hoặc mật khẩu không đúng', 401);
            }
            
            // Kiểm tra status
            if ($user['status'] !== 'Active') {
                return Response::error('Tài khoản đã bị khóa', 403);
            }
            
            // Verify password
            if (!password_verify($data['password'], $user['password_hash'])) {
                return Response::error('Email hoặc mật khẩu không đúng', 401);
            }
            
            // Phân giải vai trò thực tế (hỗ trợ phân quyền động và đa vai trò)
            $roleInfo = $this->resolveUserRolesAndCinema($user);
            $roleName = $roleInfo['roleName'];
            $baseRole = $roleInfo['baseRole'];
            $cinemaId = $roleInfo['cinemaId'];
            $cinemaName = $roleInfo['cinemaName'];
            $userRoles = $roleInfo['userRoles'];
            $permissions = $roleInfo['permissionCodes'];

            // Generate JWT token (include base_role, cinema_id)
            $jwtPayload = [
                'user_id'   => $user['id'],
                'email'     => $user['email'],
                'role_id'   => $user['role_id'],
                'role'      => $roleName,
                'base_role' => $baseRole,
                'exp'       => time() + Config::$jwt_expiration,
            ];
            if ($cinemaId !== null) {
                $jwtPayload['cinema_id'] = $cinemaId;
            }
            $token = JWT::encode($jwtPayload, Config::$jwt_secret);
            
            // Lấy thông tin profile
            $profile = $this->userProfileModel->getByUserId($user['id']);
            
            return Response::success([
                'message' => 'Đăng nhập thành công',
                'token' => $token,
                'user' => [
                    'id'             => $user['id'],
                    'email'          => $user['email'],
                    'role_id'        => $user['role_id'],
                    'role'           => $roleName,
                    'base_role'      => $baseRole,
                    'full_name'      => $profile['full_name'] ?? '',
                    'avatar'         => $profile['avatar'] ?? null,
                    'current_points' => $user['current_points'],
                    'cinema_id'      => $cinemaId,
                    'cinema_name'    => $cinemaName,
                    'roles'          => $userRoles,
                    'permissions'    => $permissions,
                ]
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Helper phân giải vai trò thực tế (base_role, roleName, cinema, permissions, roles)
     * Dựa trên các vai trò động đã gán cho user
     */
    private function resolveUserRolesAndCinema($user) {
        $userId = (int)$user['id'];
        $userRoles = [];
        $baseRole = null;
        $roleName = null;
        $db = Database::getInstance()->getConnection();

        try {
            // 1. Lấy tất cả vai trò đang gán từ user_roles
            $stmtRoles = $db->prepare("
                SELECT r.id, r.name, r.code, r.display_name, r.base_role, ur.is_primary
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = :uid AND r.is_active = 1
                ORDER BY ur.is_primary DESC, r.id ASC
            ");
            $stmtRoles->execute([':uid' => $userId]);
            $userRoles = $stmtRoles->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            error_log("AuthController resolveUserRoles Error: " . $e->getMessage());
        }

        // 2. Nếu trong user_roles chưa có, fallback đọc từ roles theo role_id chính của user
        if (empty($userRoles) && !empty($user['role_id'])) {
            try {
                $stmtSingle = $db->prepare("SELECT id, name, code, display_name, base_role FROM roles WHERE id = :rid LIMIT 1");
                $stmtSingle->execute([':rid' => (int)$user['role_id']]);
                $rRow = $stmtSingle->fetch(PDO::FETCH_ASSOC);
                if ($rRow) {
                    $userRoles = [$rRow];
                }
            } catch (Exception $e) {}
        }

        // 3. Xác định base_role theo mức độ ưu tiên cao nhất: admin > manager > staff > member > guest
        if (!empty($userRoles)) {
            $baseRolesList = array_map(function($r) {
                return strtolower($r['base_role'] ?? '');
            }, $userRoles);

            if (in_array('admin', $baseRolesList)) {
                $baseRole = 'admin';
                $roleName = 'Admin';
            } elseif (in_array('manager', $baseRolesList)) {
                $baseRole = 'manager';
                $roleName = 'Manager';
            } elseif (in_array('staff', $baseRolesList)) {
                $baseRole = 'staff';
                $roleName = 'Staff';
            } elseif (in_array('member', $baseRolesList)) {
                $baseRole = 'member';
                $roleName = 'Member';
            } else {
                $baseRole = 'guest';
                $roleName = 'Guest';
            }
        } else {
            // Fallback tuyệt đối với role_id cũ
            $roleMap = [
                1 => ['role' => 'Guest', 'base' => 'guest'],
                2 => ['role' => 'Member', 'base' => 'member'],
                3 => ['role' => 'Staff', 'base' => 'staff'],
                4 => ['role' => 'Manager', 'base' => 'manager'],
                5 => ['role' => 'Admin', 'base' => 'admin'],
            ];
            $mapped = $roleMap[(int)$user['role_id']] ?? ['role' => 'Member', 'base' => 'member'];
            $roleName = $mapped['role'];
            $baseRole = $mapped['base'];
        }

        // 4. Lấy cinema_id cho Manager hoặc Staff
        $cinemaId = null;
        $cinemaName = null;
        try {
            if ($baseRole === 'manager') {
                $cinemaStmt = $db->prepare("
                    SELECT COALESCE(c2.id, c.id) as id, COALESCE(c2.name, c.name) as name
                    FROM users u
                    LEFT JOIN cinema_staff cs ON cs.user_id = u.id
                    LEFT JOIN cinemas c2 ON c2.id = cs.cinema_id
                    LEFT JOIN cinemas c ON c.manager_id = u.id
                    WHERE u.id = :uid LIMIT 1
                ");
                $cinemaStmt->execute([':uid' => $userId]);
                $cinemaRow = $cinemaStmt->fetch(PDO::FETCH_ASSOC);
                if ($cinemaRow && $cinemaRow['id']) {
                    $cinemaId   = (int)$cinemaRow['id'];
                    $cinemaName = $cinemaRow['name'];
                }
            } elseif ($baseRole === 'staff') {
                $cinemaStmt = $db->prepare("
                    SELECT c.id, c.name
                    FROM cinema_staff cs
                    JOIN cinemas c ON c.id = cs.cinema_id
                    WHERE cs.user_id = :uid
                    LIMIT 1
                ");
                $cinemaStmt->execute([':uid' => $userId]);
                $cinemaRow = $cinemaStmt->fetch(PDO::FETCH_ASSOC);
                if ($cinemaRow) {
                    $cinemaId   = (int)$cinemaRow['id'];
                    $cinemaName = $cinemaRow['name'];
                }
            }
        } catch (Exception $ignore) {}

        // 5. Lấy danh sách permission codes hiệu lực (kế thừa các quyền công khai của Guest + các quyền ngầm định)
        $permissionCodes = [];
        try {
            if (!empty($userRoles)) {
                $roleIds = array_column($userRoles, 'id');
                $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
                $permStmt = $db->prepare("
                    SELECT DISTINCT p.name
                    FROM role_permissions rp
                    JOIN permissions p ON p.id = rp.permission_id
                    WHERE (rp.role_id IN ($placeholders) OR rp.role_id = 1) AND p.is_active = 1
                ");
                $permStmt->execute($roleIds);
                $permissionCodes = $permStmt->fetchAll(PDO::FETCH_COLUMN);

                // Nếu có quyền bookings.pos (bán vé POS tại quầy) thì ngầm định có bookings.create
                if (in_array('bookings.pos', $permissionCodes, true) && !in_array('bookings.create', $permissionCodes, true)) {
                    $permissionCodes[] = 'bookings.create';
                }
            }
        } catch (Exception $e) {}

        return [
            'roleName' => $roleName,
            'baseRole' => $baseRole,
            'cinemaId' => $cinemaId,
            'cinemaName' => $cinemaName,
            'userRoles' => $userRoles,
            'permissionCodes' => $permissionCodes
        ];
    }
    
    /**
     * POST /api/auth/logout
     * Đăng xuất (invalidate token - client side)
     */
    public function logout() {
        return Response::success([
            'message' => 'Đăng xuất thành công'
        ]);
    }
    
    /**
     * GET /api/auth/me
     * Lấy thông tin user hiện tại (cần JWT token)
     */
    public function getCurrentUser() {
        try {
            // Get token from header
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? '';
            
            if (empty($authHeader)) {
                return Response::error('Không tìm thấy token xác thực', 401);
            }
            
            // Extract token
            $token = str_replace('Bearer ', '', $authHeader);
            
            // Decode JWT
            try {
                $payload = JWT::decode($token, Config::$jwt_secret);
            } catch (Exception $e) {
                return Response::error('Token không hợp lệ hoặc đã hết hạn', 401);
            }
            
            if (!$payload) {
                return Response::error('Token không hợp lệ', 401);
            }
            
            // Get user info
            $user = $this->userModel->findById($payload['user_id']);
            
            if (!$user) {
                return Response::error('Người dùng không tồn tại', 404);
            }
            
            $profile = $this->userProfileModel->getByUserId($user['id']);
            
            // Phân giải vai trò thực tế
            $roleInfo = $this->resolveUserRolesAndCinema($user);
            $roleName = $roleInfo['roleName'];
            $baseRole = $roleInfo['baseRole'];
            $cinemaId = $roleInfo['cinemaId'];
            $cinemaName = $roleInfo['cinemaName'];
            $userRoles = $roleInfo['userRoles'];
            $permissions = $roleInfo['permissionCodes'];

            // Generate refreshed JWT token
            $jwtPayload = [
                'user_id'   => $user['id'],
                'email'     => $user['email'],
                'role_id'   => $user['role_id'],
                'role'      => $roleName,
                'base_role' => $baseRole,
                'exp'       => time() + Config::$jwt_expiration,
            ];
            if ($cinemaId !== null) {
                $jwtPayload['cinema_id'] = $cinemaId;
            }
            $refreshedToken = JWT::encode($jwtPayload, Config::$jwt_secret);

            return Response::success([
                'token' => $refreshedToken,
                'user' => [
                    'id'             => $user['id'],
                    'email'          => $user['email'],
                    'role_id'        => $user['role_id'],
                    'role'           => $roleName,
                    'base_role'      => $baseRole,
                    'full_name'      => $profile['full_name'] ?? '',
                    'phone'          => $profile['phone'] ?? '',
                    'dob'            => $profile['dob'] ?? null,
                    'avatar'         => $profile['avatar'] ?? null,
                    'current_points' => $user['current_points'],
                    'membership_id'  => $profile['membership_id'] ?? 1,
                    'cinema_id'      => $cinemaId,
                    'cinema_name'    => $cinemaName,
                    'roles'          => $userRoles,
                    'permissions'    => $permissions,
                ]
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * POST /api/auth/refresh-token
     * Refresh JWT token khi hết hạn
     */
    public function refreshToken() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            if (empty($data['token'])) {
                return Response::error('Token không được để trống', 400);
            }
            
            // Decode token (không verify expiration để có thể refresh token đã hết hạn)
            // Note: Trong production nên có cơ chế refresh token riêng (refresh token & access token)
            $token = str_replace('Bearer ', '', $data['token']);
            
            // Try to decode without expiration check
            $parts = explode('.', $token);
            if (count($parts) !== 3) {
                return Response::error('Token không hợp lệ', 401);
            }
            
            $payload = json_decode(base64_decode($parts[1]), true);
            
            if (!$payload || !isset($payload['user_id'])) {
                return Response::error('Token không hợp lệ', 401);
            }
            
            // Check user vẫn còn active
            $user = $this->userModel->findById($payload['user_id']);
            
            if (!$user) {
                return Response::error('Người dùng không tồn tại', 404);
            }
            
            if ($user['status'] !== 'Active') {
                return Response::error('Tài khoản đã bị khóa', 403);
            }
            
            // Phân giải vai trò thực tế
            $roleInfo = $this->resolveUserRolesAndCinema($user);
            $jwtPayload = [
                'user_id'   => $user['id'],
                'email'     => $user['email'],
                'role_id'   => $user['role_id'],
                'role'      => $roleInfo['roleName'],
                'base_role' => $roleInfo['baseRole'],
                'exp'       => time() + Config::$jwt_expiration
            ];
            if ($roleInfo['cinemaId'] !== null) {
                $jwtPayload['cinema_id'] = $roleInfo['cinemaId'];
            }

            // Generate new token
            $newToken = JWT::encode($jwtPayload, Config::$jwt_secret);
            
            return Response::success([
                'token' => $newToken,
                'message' => 'Token đã được làm mới'
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * Gửi mã reset password qua email
     * POST /api/auth/forgot-password
     */
    public function forgotPassword() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate
            if (empty($data['email'])) {
                return Response::error('Email không được để trống', 400);
            }
            
            $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
            
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return Response::error('Email không hợp lệ', 400);
            }
            
            // Kiểm tra email có tồn tại không
            $user = $this->userModel->findByEmail($email);
            
            if (!$user) {
                // Vẫn trả về success để tránh leak thông tin email có tồn tại hay không
                return Response::success([
                    'message' => 'Nếu email tồn tại trong hệ thống, mã xác nhận đã được gửi đến email của bạn'
                ]);
            }
            
            // Kiểm tra user có active không
            if ($user['status'] !== 'Active') {
                return Response::error('Tài khoản đã bị khóa', 403);
            }
            
            // Tạo mã reset 6 số
            $resetCode = sprintf('%06d', rand(0, 999999));
            
            // Lưu mã reset (expire sau 15 phút)
            $codes = $this->getVerificationCodes();
            $codes[$email] = [
                'type' => 'reset_password',
                'code' => $resetCode,
                'user_id' => $user['id'],
                'expires_at' => time() + (15 * 60) // 15 minutes
            ];
            $this->saveVerificationCodes($codes);
            
            // Gửi email
            $result = $this->emailService->sendPasswordResetCode($email, $resetCode, $user['full_name'] ?? 'Người dùng');
            
            if (!$result) {
                return Response::error('Không thể gửi email. Vui lòng thử lại sau', 500);
            }
            
            return Response::success([
                'message' => 'Mã xác nhận đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư'
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * Reset password với mã xác nhận
     * POST /api/auth/reset-password
     */
    public function resetPassword() {
        try {
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Validate
            if (empty($data['email']) || empty($data['code']) || empty($data['new_password'])) {
                return Response::error('Vui lòng điền đầy đủ thông tin', 400);
            }
            
            $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
            $code = $data['code'];
            $newPassword = $data['new_password'];
            
            // Validate password
            if (strlen($newPassword) < 6) {
                return Response::error('Mật khẩu phải có ít nhất 6 ký tự', 400);
            }
            
            // Đọc codes
            $codes = $this->getVerificationCodes();
            
            // Kiểm tra code có tồn tại không
            if (!isset($codes[$email])) {
                return Response::error('Mã xác nhận không hợp lệ hoặc đã hết hạn', 400);
            }
            
            $savedData = $codes[$email];
            
            // Kiểm tra type
            if ($savedData['type'] !== 'reset_password') {
                return Response::error('Mã xác nhận không hợp lệ', 400);
            }
            
            // Kiểm tra code có đúng không
            if ($savedData['code'] !== $code) {
                return Response::error('Mã xác nhận không đúng', 400);
            }
            
            // Kiểm tra hết hạn chưa
            if (time() > $savedData['expires_at']) {
                // Xóa code đã hết hạn
                unset($codes[$email]);
                $this->saveVerificationCodes($codes);
                return Response::error('Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới', 400);
            }
            
            // Update password
            $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);
            $result = $this->userModel->update($savedData['user_id'], [
                'password_hash' => $hashedPassword,
                'updated_at' => date('Y-m-d H:i:s')
            ]);
            
            if (!$result) {
                return Response::error('Không thể cập nhật mật khẩu', 500);
            }
            
            // Xóa code đã sử dụng
            unset($codes[$email]);
            $this->saveVerificationCodes($codes);
            
            return Response::success([
                'message' => 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới'
            ]);
            
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
}

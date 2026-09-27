<?php
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/UserProfile.php';
require_once __DIR__ . '/../models/Role.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../utils/EmailService.php';
require_once __DIR__ . '/../utils/CloudinaryUploader.php';
require_once __DIR__ . '/../config/Config.php';

/**
 * UserController
 * Quản lý người dùng - Admin & User functions
 * Phụ trách: THỊNH
 */
class UserController
{
    private $userModel;
    private $userProfileModel;
    private $roleModel;

    public function __construct()
    {
        $this->userModel = new User();
        $this->userProfileModel = new UserProfile();
        $this->roleModel = new Role();
    }

    /**
     * Helper: Get current user from JWT token
     */
    private function getCurrentUserId()
    {
        try {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? '';

            if (empty($authHeader)) {
                return null;
            }

            $token = str_replace('Bearer ', '', $authHeader);
            $payload = JWT::decode($token, Config::$jwt_secret);

            return $payload ? $payload['user_id'] : null;
        } catch (Exception $e) {
            error_log("JWT decode error in getCurrentUserId: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Helper: Check if user is admin
     */
    private function isAdmin()
    {
        try {
            $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
            $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            if (strtolower($roleName) === 'admin' || $roleId === 5) {
                return true;
            }

            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

            if (empty($authHeader)) {
                return false;
            }

            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
            } else {
                $token = str_replace('Bearer ', '', $authHeader);
            }

            $payload = JWT::decode($token, Config::$jwt_secret);
            if (!$payload) return false;

            $tokenRoleId = (int)($payload['role_id'] ?? 0);
            $tokenRole = (string)($payload['role'] ?? '');

            return $tokenRoleId === 5 || strtolower($tokenRole) === 'admin';
        } catch (Exception $e) {
            error_log("JWT decode error in isAdmin: " . $e->getMessage());
            return false;
        }
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /**
     * GET /api/users
     * List tất cả users với pagination, filter, search
     * Authorization: Admin only
     */
    public function index()
    {
        try {
            // Check admin permission
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            // Get query parameters
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            $search = $_GET['search'] ?? '';
            $roleId = isset($_GET['role_id']) ? (int)$_GET['role_id'] : null;
            $status = $_GET['status'] ?? '';
            $sortBy = $_GET['sort_by'] ?? 'created_at';
            $sortOrder = $_GET['sort_order'] ?? 'DESC';

            // Build filters
            $filters = [];
            if ($roleId) $filters['role_id'] = $roleId;
            if ($status) $filters['status'] = $status;
            if ($search) $filters['search'] = $search;
            $filters['sort_by'] = $sortBy;
            $filters['sort_order'] = $sortOrder;

            // Get users
            $users = $this->userModel->getAll($filters, $page, $limit);
            $total = $this->userModel->count($filters);
            $tierCounts = $this->userModel->getTierCounts();
            $statusCounts = $this->userModel->getStatusCounts();

            return Response::success([
                'users' => $users,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => ceil($total / $limit)
                ],
                'tier_counts' => $tierCounts,
                'status_counts' => $statusCounts
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/users/:id
     * Lấy chi tiết thông tin user
     * Authorization: Admin hoặc chính user đó
     */
    public function show($id)
    {
        try {
            $currentUserId = $this->getCurrentUserId();

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            // Check permission: Admin hoặc chính user đó
            if (!$this->isAdmin() && $currentUserId != $id) {
                return Response::error('Không có quyền truy cập', 403);
            }

            // Get user info
            $user = $this->userModel->findById($id);

            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            // Get profile
            $profile = $this->userProfileModel->getByUserId($id);

            // Get role
            $role = $this->roleModel->getById($user['role_id']);

            // Combine data
            $userData = [
                'id' => $user['id'],
                'email' => $user['email'],
                'role_id' => $user['role_id'],
                'role_name' => $role['name'] ?? 'Unknown',
                'status' => $user['status'],
                'current_points' => $user['current_points'],
                'created_at' => $user['created_at'],
                'profile' => $profile
            ];

            return Response::success(['user' => $userData]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/users
     * Admin tạo user mới (không cần email verification)
     * Authorization: Admin only
     */
    public function create()
    {
        try {
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $data = json_decode(file_get_contents('php://input'), true);

            // Validate required fields
            $required = ['email', 'full_name', 'phone', 'dob', 'role_id'];
            foreach ($required as $field) {
                if (empty($data[$field])) {
                    return Response::error("Thiếu thông tin: $field", 400);
                }
            }

            // Validate email
            $email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
            $fullName = trim((string)($data['full_name'] ?? ''));
            $phone = preg_replace('/\D+/', '', (string)($data['phone'] ?? ''));

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return Response::error('Email không hợp lệ', 400);
            }

            if ($fullName === '') {
                return Response::error('Họ và tên không được để trống', 400);
            }

            // Check email exists
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

            // Default password = DOB in ddmmyyyy format
            try {
                $dob = new DateTime($data['dob']);
                $defaultPassword = $dob->format('dmY');
            } catch (Exception $e) {
                return Response::error('Ngày sinh không hợp lệ', 400);
            }

            $passwordHash = password_hash($defaultPassword, PASSWORD_BCRYPT, ['cost' => 10]);

            // Create user
            $userId = $this->userModel->create([
                'email' => $email,
                'password_hash' => $passwordHash,
                'role_id' => $data['role_id'],
                'status' => $data['status'] ?? 'Active'
            ]);

            if (!$userId) {
                return Response::error('Không thể tạo tài khoản', 500);
            }

            // Create profile
            $profileCreated = $this->userProfileModel->create([
                'user_id' => $userId,
                'full_name' => $fullName,
                'phone' => $phone,
                'dob' => $data['dob'] ?? null,
                'membership_id' => 1 // Bronze default
            ]);

            if (!$profileCreated) {
                $this->userModel->delete($userId);
                return Response::error('Không thể tạo hồ sơ người dùng', 500);
            }

            // Assign cinema if applicable
            if (!empty($data['cinema_id']) && isset($data['role_id'])) {
                $role = $this->roleModel->getById($data['role_id']);
                if ($role) {
                    $baseRole = strtolower($role['base_role'] ?? $role['name']);
                    if ($baseRole === 'staff') {
                        $this->userModel->assignStaffToCinema($userId, (int)$data['cinema_id']);
                    } else if ($baseRole === 'manager') {
                        $this->userModel->assignManagerToCinema($userId, (int)$data['cinema_id']);
                    }
                }
            }

            return Response::success([
                'message' => 'Tạo người dùng thành công',
                'user_id' => $userId
            ], 201);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/users/:id
     * Update thông tin user
     * Authorization: Admin (full access) hoặc chính user (limited fields)
     */
    public function update($id)
    {
        try {
            $currentUserId = $this->getCurrentUserId();

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            $isAdmin = $this->isAdmin();
            $isSelf = ($currentUserId == $id);

            if (!$isAdmin && !$isSelf) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data)) {
                return Response::error('Không có dữ liệu để cập nhật', 400);
            }

            // Check user exists
            $user = $this->userModel->findById($id);
            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            // Admin có thể update: status, role_id
            // User thường chỉ có thể update profile (xử lý ở updateProfile)
            if ($isAdmin) {
                $updateData = [];

                // Không cho admin đổi mật khẩu tại màn quản lý người dùng
                if (isset($data['password'])) {
                    return Response::error('Admin không được đổi mật khẩu người dùng tại màn này', 400);
                }

                if (isset($data['status'])) {
                    if ($currentUserId == $id) {
                        return Response::error('Admin không thể tự khóa/mở khóa tài khoản của chính mình', 400);
                    }
                    $updateData['status'] = $data['status'];
                }

                if (isset($data['role_id'])) {
                    $updateData['role_id'] = $data['role_id'];
                }

                if (isset($data['current_points'])) {
                    $updateData['current_points'] = $data['current_points'];
                }

                if (!empty($updateData)) {
                    $updated = $this->userModel->update($id, $updateData);

                    if (!$updated) {
                        return Response::error('Cập nhật thất bại', 500);
                    }
                }

                // Handle Cinema Assignment if provided (Admin only update)
                // We use $user['role_id'] if role isn't updated, or $data['role_id'] if it is.
                if (!empty($data['cinema_id'])) {
                    $currentRoleId = $data['role_id'] ?? $user['role_id'];
                    $role = $this->roleModel->getById($currentRoleId);
                    if ($role) {
                        $baseRole = strtolower($role['base_role'] ?? $role['name']);
                        if ($baseRole === 'staff') {
                            $this->userModel->assignStaffToCinema($id, (int)$data['cinema_id']);
                        } else if ($baseRole === 'manager') {
                            $this->userModel->assignManagerToCinema($id, (int)$data['cinema_id']);
                        }
                    }
                }
            }

            return Response::success(['message' => 'Cập nhật thành công']);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * DELETE /api/users/:id
        * Xóa user khi chưa có phát sinh; nếu đã có booking/giao dịch thì khóa tài khoản
     * Authorization: Admin only
     */
    public function delete($id)
    {
        try {
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $currentUserId = $this->getCurrentUserId();

            // Không cho xóa chính mình
            if ($currentUserId == $id) {
                return Response::error('Không thể xóa tài khoản của chính mình', 400);
            }

            // Check user exists
            $user = $this->userModel->findById($id);
            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            $hasActivities = $this->userModel->hasBookingsOrTransactions($id);

            if ($hasActivities) {
                $locked = $this->userModel->lockAccount($id);

                if (!$locked) {
                    return Response::error('Không thể khóa tài khoản', 500);
                }

                return Response::success([
                    'message' => 'Tài khoản đã có giao dịch/đặt vé nên hệ thống chuyển sang khóa tài khoản',
                    'action' => 'locked',
                ]);
            }

            // Chỉ xóa cứng khi user chưa phát sinh dữ liệu nghiệp vụ
            $deleted = $this->userModel->hardDelete($id);

            if (!$deleted) {
                return Response::error('Xóa thất bại', 500);
            }

            return Response::success([
                'message' => 'Xóa người dùng thành công',
                'action' => 'deleted',
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/users/:id/role
     * Đổi role của user
     * Authorization: Admin only
     */
    public function updateRole($id)
    {
        try {
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data['role_id'])) {
                return Response::error('Thiếu role_id', 400);
            }

            $roleId = (int)$data['role_id'];

            // Validate role exists
            $role = $this->roleModel->getById($roleId);
            if (!$role) {
                return Response::error('Role không tồn tại', 404);
            }

            // Check user exists
            $user = $this->userModel->findById($id);
            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            // Update role
            $updated = $this->userModel->updateRole($id, $roleId);

            if (!$updated) {
                return Response::error('Cập nhật role thất bại', 500);
            }

            return Response::success([
                'message' => 'Đổi role thành công',
                'new_role' => $role['name']
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
    
    // ============================================
    // USER FUNCTIONS
    // ============================================

    /**
     * GET /api/users/:id/profile
     * Lấy profile của user (chi tiết đầy đủ)
     * Authorization: Chính user đó
     */
    public function getProfile($id)
    {
        try {
            AuthMiddleware::requirePermission('users.view_own');
            $currentUserId = $_REQUEST['auth_user_id'] ?? null;

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            // Chỉ được xem profile của mình (trừ admin)
            $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
            $isAdmin = ($roleId === 5 || strtolower($roleName) === 'admin' || $this->isAdmin());
            if (!$isAdmin && $currentUserId != $id) {
                return Response::error('Không có quyền truy cập', 403);
            }

            // Get user
            $user = $this->userModel->findById($id);
            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            // Get profile
            $profile = $this->userProfileModel->getFullProfile($id);

            if (!$profile) {
                return Response::error('Không tìm thấy thông tin profile', 404);
            }

            return Response::success(['profile' => $profile]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/users/:id/profile
     * Update profile của user
     * Authorization: Chính user đó
     */
    public function updateProfile($id)
    {
        try {
            AuthMiddleware::requirePermission('users.view_own');
            $currentUserId = $_REQUEST['auth_user_id'] ?? null;

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            // Chỉ được update profile của mình (trừ khi là admin)
            $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
            $isAdmin = ($roleId === 5 || strtolower($roleName) === 'admin' || $this->isAdmin());
            if (!$isAdmin && $currentUserId != $id) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $data = json_decode(file_get_contents('php://input'), true);

            if (empty($data)) {
                return Response::error('Không có dữ liệu để cập nhật', 400);
            }

            if (isset($data['full_name'])) {
                $data['full_name'] = trim((string)$data['full_name']);
                if ($data['full_name'] === '') {
                    return Response::error('Họ và tên không được để trống', 400);
                }
            }

            if (isset($data['phone'])) {
                $data['phone'] = preg_replace('/\D+/', '', (string)$data['phone']);
            }

            // Validate phone nếu có
            if (isset($data['phone']) && $data['phone'] !== '' && !preg_match('/^0\d{9,10}$/', $data['phone'])) {
                return Response::error('Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)', 400);
            }

            if (isset($data['phone']) && $data['phone'] !== '' && $this->userProfileModel->existsByPhone($data['phone'], $id)) {
                return Response::error('Số điện thoại đã được sử dụng', 409);
            }

            // Validate DOB nếu có
            if (isset($data['dob']) && !empty($data['dob'])) {
                try {
                    new DateTime($data['dob']);
                } catch (Exception $e) {
                    return Response::error('Ngày sinh không hợp lệ', 400);
                }
            }

            // Ensure profile row exists before update (tránh báo thành công nhưng không ghi dữ liệu)
            $existingProfile = $this->userProfileModel->getByUserId($id);
            if (!$existingProfile) {
                $created = $this->userProfileModel->create([
                    'user_id' => (int)$id,
                    'full_name' => $data['full_name'] ?? ('User #' . $id),
                    'phone' => $data['phone'] ?? '',
                    'dob' => !empty($data['dob']) ? $data['dob'] : null,
                    'membership_id' => 1,
                ]);

                if (!$created) {
                    return Response::error('Không thể khởi tạo hồ sơ người dùng', 500);
                }
            }

            // Update profile
            $updated = $this->userProfileModel->update($id, $data);

            if (!$updated) {
                return Response::error('Cập nhật thất bại', 500);
            }

            return Response::success(['message' => 'Cập nhật profile thành công']);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/users/:id/change-password
     * Đổi mật khẩu
     * Authorization: Chính user đó
     */
    public function changePassword($id)
    {
        try {
            AuthMiddleware::requirePermission('users.view_own');
            $currentUserId = $_REQUEST['auth_user_id'] ?? null;

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            // Chỉ được đổi mật khẩu của mình
            if ($currentUserId != $id) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $data = json_decode(file_get_contents('php://input'), true);

            // Validate input
            if (empty($data['old_password']) || empty($data['new_password'])) {
                return Response::error('Thiếu thông tin mật khẩu', 400);
            }

            // Validate new password
            if (strlen($data['new_password']) < 6) {
                return Response::error('Mật khẩu mới phải có ít nhất 6 ký tự', 400);
            }

            // Get user
            $user = $this->userModel->findById($id);
            if (!$user) {
                return Response::error('Không tìm thấy người dùng', 404);
            }

            // Verify old password
            if (!password_verify($data['old_password'], $user['password_hash'])) {
                return Response::error('Mật khẩu cũ không đúng', 400);
            }

            // Hash new password
            $newPasswordHash = password_hash($data['new_password'], PASSWORD_BCRYPT, ['cost' => 10]);

            // Update password
            $updated = $this->userModel->changePassword($id, $newPasswordHash);

            if (!$updated) {
                return Response::error('Đổi mật khẩu thất bại', 500);
            }

            // Gửi email thông báo đổi mật khẩu thành công
            try {
                $emailService = new EmailService();
                $emailService->sendPasswordChangedNotification($user['email'], $user['full_name']);
                error_log("✓ Password changed notification email sent to: " . $user['email']);
            } catch (Exception $emailError) {
                // Log lỗi nhưng vẫn trả về success vì mật khẩu đã đổi thành công
                error_log("✗ Failed to send password change notification: " . $emailError->getMessage());
            }

            return Response::success(['message' => 'Đổi mật khẩu thành công']);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/users/:id/upload-avatar
     * Upload avatar
     * Authorization: Chính user đó
     */
    public function uploadAvatar($id)
    {
        try {
            AuthMiddleware::requirePermission('users.view_own');
            $currentUserId = $_REQUEST['auth_user_id'] ?? null;

            if (!$currentUserId) {
                return Response::error('Chưa đăng nhập', 401);
            }

            if (!$this->isAdmin() && $currentUserId != $id) {
                return Response::error('Không có quyền truy cập', 403);
            }

            // Check if file was uploaded
            if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
                return Response::error('Không có file được upload', 400);
            }

            $file = $_FILES['avatar'];

            // Validate file type
            $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (!in_array($file['type'], $allowedTypes)) {
                return Response::error('File phải là ảnh (JPG, PNG, GIF)', 400);
            }

            // Validate file size (max 2MB)
            if ($file['size'] > 2 * 1024 * 1024) {
                return Response::error('File không được vượt quá 2MB', 400);
            }

            $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $filename = 'avatar_' . $id . '_' . time() . '.' . $extension;

            // Try Cloudinary first, then fallback to local uploads.
            $avatarUrl = CloudinaryUploader::uploadImage(
                $file['tmp_name'],
                'avatar_' . $id . '_' . time(),
                'users/avatars'
            );

            if (empty($avatarUrl)) {
                $uploadDir = __DIR__ . '/../uploads/avatars/';
                if (!file_exists($uploadDir)) {
                    mkdir($uploadDir, 0777, true);
                }

                $filePath = $uploadDir . $filename;
                if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                    return Response::error('Không thể lưu file', 500);
                }

                $avatarUrl = '/uploads/avatars/' . $filename;
            }

            $updated = $this->userProfileModel->uploadAvatar($id, $avatarUrl);

            if (!$updated) {
                return Response::error('Cập nhật avatar thất bại', 500);
            }

            return Response::success([
                'message' => 'Upload avatar thành công',
                'avatar_url' => $avatarUrl
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi hệ thống: ' . $e->getMessage(), 500);
        }
    }
}

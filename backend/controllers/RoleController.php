<?php
require_once __DIR__ . '/../models/Role.php';
require_once __DIR__ . '/../models/RolePermission.php';
require_once __DIR__ . '/../models/Permission.php';
require_once __DIR__ . '/../models/AuditLog.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../core/Response.php';

/**
 * RoleController - Quản lý Vai Trò & Phân Quyền Động (Dynamic RBAC)
 */
class RoleController {
    private $roleModel;
    private $rolePermissionModel;
    private $permissionModel;
    private $auditLogModel;
    private $db;
    
    public function __construct() {
        $this->roleModel = new Role();
        $this->rolePermissionModel = new RolePermission();
        $this->permissionModel = new Permission();
        $this->auditLogModel = new AuditLog();
        $this->db = Database::getInstance()->getConnection();
    }

    private function getActorInfo(): array {
        $actorId = (int)($_REQUEST['auth_user_id'] ?? 0);
        $actorName = (string)($_REQUEST['auth_user_role'] ?? 'Admin');

        if ($actorId > 0) {
            $stmt = $this->db->prepare("SELECT email FROM users WHERE id = :id");
            $stmt->execute([':id' => $actorId]);
            $email = $stmt->fetchColumn();
            if ($email) {
                $actorName = $email;
            }
        }

        return [$actorId, $actorName];
    }

    /**
     * Định nghĩa các quyền nhạy cảm / vượt thẩm quyền cho từng base_role
     */
    public static function getScopeRestrictions(string $baseRole): array {
        // Danh sách tiền tố hoặc permission names BỊ CẤM / NHẠY CẢM với từng base_role
        $restrictions = [
            'guest' => [
                'disallowed_modules' => ['system', 'reports', 'halls', 'cinemas', 'users', 'tickets', 'concessions', 'bookings'],
                'disallowed_prefixes' => [
                    'movies.create', 'movies.update', 'movies.delete', 'movies.upload_poster', 'movies.import',
                    'showtimes.create', 'showtimes.update', 'showtimes.delete', 'showtimes.auto_generate',
                    'promotions.create', 'promotions.update', 'promotions.delete',
                    'reviews.create', 'reviews.update_own', 'reviews.delete_own', 'reviews.delete_any', 'reviews.approve', 'reviews.reject', 'reviews.report', 'reviews.view_all',
                    'transactions.'
                ]
            ],
            'member' => [
                'disallowed_modules' => ['system', 'reports', 'halls', 'cinemas', 'users', 'tickets', 'concessions'],
                'disallowed_prefixes' => [
                    'movies.create', 'movies.update', 'movies.delete', 'movies.upload_poster', 'movies.import',
                    'showtimes.create', 'showtimes.update', 'showtimes.delete', 'showtimes.auto_generate',
                    'promotions.create', 'promotions.update', 'promotions.delete',
                    'bookings.pos', 'bookings.view_all', 'bookings.refund', 'bookings.update',
                    'reviews.view_all', 'reviews.delete_any', 'reviews.approve', 'reviews.reject',
                    'transactions.view_all', 'transactions.process'
                ]
            ],
            'staff' => [
                'disallowed_modules' => ['system', 'reports'],
                'disallowed_prefixes' => [
                    'cinemas.create', 'cinemas.update', 'cinemas.delete',
                    'halls.create', 'halls.update', 'halls.delete', 'halls.manage_layout',
                    'movies.create', 'movies.update', 'movies.delete', 'movies.upload_poster', 'movies.import',
                    'showtimes.create', 'showtimes.update', 'showtimes.delete', 'showtimes.auto_generate',
                    'users.create', 'users.update_all', 'users.delete', 'users.change_role', 'users.view_all',
                    'promotions.create', 'promotions.update', 'promotions.delete',
                    'concessions.create', 'concessions.update', 'concessions.delete', 'concessions.import',
                    'reviews.view_all', 'reviews.delete_any', 'reviews.approve', 'reviews.reject',
                    'bookings.refund'
                ]
            ],
            'manager' => [
                'disallowed_modules' => ['system'],
                'disallowed_prefixes' => [
                    'cinemas.create', 'cinemas.delete',
                    'movies.delete',
                    'users.create', 'users.update_all', 'users.delete', 'users.change_role',
                    'concessions.create', 'concessions.delete', 'concessions.import',
                    'promotions.delete',
                    'tickets.scan', 'tickets.approve_entry'
                ]
            ],
            'admin' => [
                'disallowed_modules' => [],
                'disallowed_prefixes' => []
            ]
        ];

        return $restrictions[$baseRole] ?? $restrictions['staff'];
    }
    
    /**
     * GET /api/roles
     * Lấy tất cả roles kèm số lượng user và permission
     */
    public function index() {
        try {
            AuthMiddleware::requireAdmin();
            AuthMiddleware::requirePermission('system.roles');

            $filters = [
                'base_role' => $_GET['base_role'] ?? null,
                'search' => $_GET['search'] ?? null,
                'is_active' => isset($_GET['is_active']) ? (int)$_GET['is_active'] : null
            ];

            $roles = $this->roleModel->getAll($filters);

            // Bổ sung danh sách permission_ids của từng role
            foreach ($roles as &$role) {
                $role['id'] = (int)$role['id'];
                $role['is_system'] = (int)$role['is_system'];
                $role['is_active'] = (int)$role['is_active'];
                $permRows = $this->rolePermissionModel->getPermissionsByRole($role['id']);
                $role['permission_ids'] = array_map(function($p) { return (int)$p['id']; }, $permRows);
            }

            return Response::success([
                'roles' => $roles,
                'total' => count($roles)
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi lấy danh sách vai trò: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/roles/:id
     * Lấy chi tiết một vai trò kèm permissions và users
     */
    public function show($id) {
        try {
            AuthMiddleware::requireAdmin();

            $role = $this->roleModel->getById($id);
            if (!$role) {
                return Response::notFound('Không tìm thấy vai trò');
            }

            $role['id'] = (int)$role['id'];
            $role['is_system'] = (int)$role['is_system'];
            $role['is_active'] = (int)$role['is_active'];

            $permissions = $this->rolePermissionModel->getPermissionsByRole($id);
            $users = $this->roleModel->getUsersByRoleId($id);

            return Response::success([
                'role' => $role,
                'permissions' => $permissions,
                'users' => $users
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/roles
     * Tạo vai trò mới (Custom Role)
     */
    public function create() {
        try {
            AuthMiddleware::requireAdmin();
            AuthMiddleware::requirePermission('system.roles');

            $input = json_decode(file_get_contents('php://input'), true) ?: [];

            if (empty($input['name'])) {
                return Response::error('Tên vai trò không được để trống', 400);
            }

            $baseRole = $input['base_role'] ?? 'staff';
            if (!in_array($baseRole, ['admin', 'manager', 'staff', 'member'])) {
                return Response::error('Loại tài khoản áp dụng không hợp lệ', 400);
            }

            // Check duplicate name
            if ($this->roleModel->getByCodeOrName(trim($input['name']))) {
                return Response::error('Tên vai trò đã tồn tại', 409);
            }

            $roleId = $this->roleModel->create([
                'name' => trim($input['name']),
                'code' => $input['code'] ?? null,
                'display_name' => $input['display_name'] ?? $input['name'],
                'description' => $input['description'] ?? '',
                'base_role' => $baseRole,
                'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1
            ]);

            if (!$roleId) {
                return Response::error('Không thể tạo vai trò mới', 500);
            }

            // Gán permissions nếu có, lọc bỏ các quyền nhạy cảm vượt thẩm quyền
            $requestedPerms = isset($input['permission_ids']) && is_array($input['permission_ids']) 
                ? array_map('intval', $input['permission_ids']) 
                : [];

            if (!empty($requestedPerms)) {
                $filteredPerms = $this->filterPermsByBaseRole($requestedPerms, $baseRole);
                $this->rolePermissionModel->syncPermissions($roleId, $filteredPerms);
            }

            // Ghi audit log
            list($actorId, $actorName) = $this->getActorInfo();
            $this->auditLogModel->log(
                $actorId,
                $actorName,
                'ROLE_CREATE',
                'ROLE',
                $roleId,
                $input['name'],
                $input['reason'] ?? 'Tạo vai trò tùy chỉnh mới',
                null,
                ['base_role' => $baseRole, 'perms_count' => count($requestedPerms)]
            );

            $newRole = $this->roleModel->getById($roleId);
            return Response::success([
                'message' => 'Tạo vai trò thành công',
                'role' => $newRole
            ], 201);
        } catch (Exception $e) {
            return Response::error('Lỗi tạo vai trò: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/roles/:id
     * Cập nhật vai trò tùy chỉnh
     */
    public function update($id) {
        try {
            AuthMiddleware::requireAdmin();
            AuthMiddleware::requirePermission('system.roles');

            $role = $this->roleModel->getById($id);
            if (!$role) {
                return Response::notFound('Không tìm thấy vai trò');
            }

            $input = json_decode(file_get_contents('php://input'), true) ?: [];

            // NẾU LÀ ROLE HỆ THỐNG: KHÔNG ĐƯỢC PHÉP THAY ĐỔI QUYỀN HẠN
            if ((int)$role['is_system'] === 1) {
                if (isset($input['permission_ids'])) {
                    return Response::error('Vai trò hệ thống mặc định là chỉ đọc và không thể chỉnh sửa quyền hạn.', 400);
                }
                // Chỉ cho phép cập nhật mô tả nếu cần
                $this->roleModel->update($id, [
                    'description' => $input['description'] ?? $role['description']
                ]);

                return Response::success([
                    'message' => 'Cập nhật thông tin vai trò hệ thống thành công',
                    'role' => $this->roleModel->getById($id)
                ]);
            }

            // Role tùy chỉnh: Cập nhật đầy đủ
            $baseRole = $input['base_role'] ?? $role['base_role'];
            $this->roleModel->update($id, [
                'name' => $input['name'] ?? $role['name'],
                'display_name' => $input['display_name'] ?? $role['display_name'],
                'description' => $input['description'] ?? $role['description'],
                'base_role' => $baseRole,
                'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : $role['is_active']
            ]);

            // Sync permissions nếu có
            if (isset($input['permission_ids']) && is_array($input['permission_ids'])) {
                $requestedPerms = array_map('intval', $input['permission_ids']);
                $filteredPerms = $this->filterPermsByBaseRole($requestedPerms, $baseRole);
                $this->rolePermissionModel->syncPermissions($id, $filteredPerms);
            }

            // Ghi audit log
            list($actorId, $actorName) = $this->getActorInfo();
            $this->auditLogModel->log(
                $actorId,
                $actorName,
                'ROLE_UPDATE',
                'ROLE',
                $id,
                $role['name'],
                $input['reason'] ?? 'Cập nhật vai trò tùy chỉnh',
                $role,
                $input
            );

            return Response::success([
                'message' => 'Cập nhật vai trò thành công',
                'role' => $this->roleModel->getById($id)
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi cập nhật vai trò: ' . $e->getMessage(), 500);
        }
    }

    /**
     * DELETE /api/roles/:id
     * Xóa vai trò tùy chỉnh
     */
    public function delete($id) {
        try {
            AuthMiddleware::requireAdmin();
            AuthMiddleware::requirePermission('system.roles');

            $role = $this->roleModel->getById($id);
            if (!$role) {
                return Response::notFound('Không tìm thấy vai trò');
            }

            if ((int)$role['is_system'] === 1) {
                return Response::error('Không thể xóa vai trò hệ thống mặc định.', 400);
            }

            $deleted = $this->roleModel->delete($id);
            if (!$deleted) {
                return Response::error('Không thể xóa vai trò này.', 500);
            }

            // Ghi audit log
            list($actorId, $actorName) = $this->getActorInfo();
            $this->auditLogModel->log(
                $actorId,
                $actorName,
                'ROLE_DELETE',
                'ROLE',
                $id,
                $role['name'],
                $_GET['reason'] ?? 'Xóa vai trò tùy chỉnh',
                $role,
                null
            );

            return Response::success([
                'message' => "Đã xóa vai trò '{$role['display_name']}' thành công"
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi xóa vai trò: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/users-with-roles
     * Lấy danh sách users kèm các vai trò đã gán
     */
    public function getUsersWithRoles() {
        try {
            AuthMiddleware::requireAdmin();

            $sql = "SELECT u.id, u.email, u.status, u.role_id, u.created_at,
                           p.full_name, p.phone, p.avatar AS avatar_url
                    FROM users u
                    LEFT JOIN user_profiles p ON p.user_id = u.id
                    ORDER BY u.id ASC";
            $users = $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            // Gắn danh sách roles cho từng user
            foreach ($users as &$user) {
                $uid = (int)$user['id'];
                $user['roles'] = $this->roleModel->getUserRoles($uid);
                $user['is_root_admin'] = ($uid === 1 || $user['email'] === 'admin@galaxy.vn');
            }

            return Response::success([
                'users' => $users,
                'total' => count($users)
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/users/:id/roles
     * Lấy danh sách vai trò và quyền hạn hiệu lực của một user
     */
    public function getUserRolesDetail($id) {
        try {
            AuthMiddleware::requireAdmin();

            $userId = (int)$id;
            $stmt = $this->db->prepare("SELECT u.id, u.email, u.status, u.role_id, p.full_name, p.phone, p.avatar AS avatar_url FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                return Response::notFound('Không tìm thấy người dùng');
            }

            $user['is_root_admin'] = ((int)$user['id'] === 1 || $user['email'] === 'admin@galaxy.vn');
            $roles = $this->roleModel->getUserRoles($userId);
            $effectivePerms = $this->roleModel->getUserEffectivePermissions($userId);

            return Response::success([
                'user' => $user,
                'roles' => $roles,
                'effective_permissions' => $effectivePerms,
                'total_permissions' => count($effectivePerms)
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/users/:id/roles
     * Gán hoặc cập nhật nhiều vai trò cho một user
     */
    public function assignUserRoles($id) {
        try {
            AuthMiddleware::requireAdmin();
            AuthMiddleware::requirePermission('users.change_role');

            $userId = (int)$id;
            $targetUserId = (int)$userId;
            $actorId = (int)($_REQUEST['auth_user_id'] ?? 0);
            list($actorId, $actorName) = $this->getActorInfo();

            // 1. Kiểm tra tài khoản đích có tồn tại không
            $stmt = $this->db->prepare("SELECT u.id, u.email, u.role_id, p.full_name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = :id");
            $stmt->execute([':id' => $targetUserId]);
            $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$targetUser) {
                return Response::notFound('Không tìm thấy người dùng');
            }

            $isTargetRootAdmin = ($targetUserId === 1 || $targetUser['email'] === 'admin@galaxy.vn');

            // 2. BẢO VỆ ADMIN CHÍNH: KHÔNG AI CÓ THỂ CAN THIỆP ADMIN CHÍNH (TRỪ CHÍNH ADMIN CHÍNH ĐÓNG VAI TRÒ ROOT)
            if ($isTargetRootAdmin && $actorId !== 1) {
                return Response::forbidden('Tài khoản Quản Trị Viên Tối Cao (Super Admin) được bảo vệ tuyệt đối. Bạn không có thẩm quyền thay đổi vai trò tài khoản này.');
            }

            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $requestedRoleIds = isset($input['role_ids']) && is_array($input['role_ids']) 
                ? array_map('intval', $input['role_ids']) 
                : [];
            
            $reason = trim((string)($input['reason'] ?? ''));
            if ($reason === '') {
                return Response::error('Vui lòng nhập lý do thay đổi vai trò người dùng (Bắt buộc để lưu nhật ký kiểm toán).', 400);
            }

            // Nếu là Root Admin, luôn bắt buộc phải giữ vai trò SYSTEM_ADMIN (ID = 5)
            if ($isTargetRootAdmin && !in_array(5, $requestedRoleIds)) {
                $requestedRoleIds[] = 5;
            }

            if (empty($requestedRoleIds)) {
                return Response::error('Tài khoản người dùng phải có ít nhất 1 vai trò được gán.', 400);
            }

            // 3. Kiểm tra tính tương thích: Không thể gán vai trò Staff cho tài khoản Member hay ngược lại
            // Xác định base_role chuẩn từ primary role của user
            $primaryRoleId = (int)$targetUser['role_id'];
            $primaryRole = $this->roleModel->getById($primaryRoleId);
            $targetBaseRole = $primaryRole['base_role'] ?? 'member';

            // Kiểm tra các role được gán có đúng với base_role tương thích không
            foreach ($requestedRoleIds as $rid) {
                if ($rid === 1) {
                    return Response::error('Khách vãng lai không phải là tài khoản người dùng và không thể gán vai trò này.', 400);
                }
                $checkRole = $this->roleModel->getById($rid);
                if ($checkRole && $checkRole['base_role'] === 'guest') {
                    return Response::error('Không thể gán vai trò Khách vãng lai cho tài khoản người dùng.', 400);
                }
                if ($checkRole && $checkRole['base_role'] !== $targetBaseRole) {
                    return Response::error("Vai trò '{$checkRole['display_name']}' chỉ áp dụng cho nhóm tài khoản {$checkRole['base_role']}, không thể gán cho người dùng thuộc nhóm $targetBaseRole.", 400);
                }
            }

            // Lấy danh sách roles cũ để ghi log
            $oldRoles = $this->roleModel->getUserRoles($targetUserId);

            // Đồng bộ roles cho user
            $synced = $this->roleModel->syncUserRoles($targetUserId, $requestedRoleIds, $actorId, $reason);
            if (!$synced) {
                return Response::error('Không thể cập nhật vai trò người dùng', 500);
            }

            $newRoles = $this->roleModel->getUserRoles($targetUserId);

            // Ghi audit log
            $this->auditLogModel->log(
                $actorId,
                $actorName,
                'USER_ROLES_ASSIGN',
                'USER',
                $targetUserId,
                $targetUser['full_name'] ? "{$targetUser['full_name']} ({$targetUser['email']})" : $targetUser['email'],
                $reason,
                array_column($oldRoles, 'id'),
                array_column($newRoles, 'id')
            );

            return Response::success([
                'message' => 'Cập nhật vai trò người dùng thành công',
                'roles' => $newRoles,
                'effective_permissions' => $this->roleModel->getUserEffectivePermissions($targetUserId)
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi gán vai trò: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/audit-logs/permissions
     * Lấy nhật ký kiểm toán phân quyền
     */
    public function getAuditLogs() {
        try {
            AuthMiddleware::requireAdmin();

            $filters = [
                'action' => $_GET['action'] ?? null,
                'actor_id' => $_GET['actor_id'] ?? null,
                'target_type' => $_GET['target_type'] ?? null,
                'from_date' => $_GET['from_date'] ?? null,
                'to_date' => $_GET['to_date'] ?? null,
                'search' => $_GET['search'] ?? null
            ];

            $limit = isset($_GET['limit']) ? min(100, max(1, (int)$_GET['limit'])) : 50;
            $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
            $offset = ($page - 1) * $limit;

            $logs = $this->auditLogModel->getAll($filters, $limit, $offset);
            $total = $this->auditLogModel->count($filters);

            return Response::success([
                'logs' => $logs,
                'total' => $total,
                'page' => $page,
                'limit' => $limit
            ]);
        } catch (Exception $e) {
            return Response::error('Lỗi lấy nhật ký kiểm toán: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Lọc danh sách permission_ids theo thẩm quyền của base_role
     */
    private function filterPermsByBaseRole(array $permIds, string $baseRole): array {
        if ($baseRole === 'admin' || empty($permIds)) {
            return $permIds;
        }

        $restrictions = self::getScopeRestrictions($baseRole);
        $disallowedModules = $restrictions['disallowed_modules'] ?? [];
        $disallowedPrefixes = $restrictions['disallowed_prefixes'] ?? [];

        $allPerms = $this->permissionModel->getAll();
        $permMap = [];
        foreach ($allPerms as $p) {
            $permMap[(int)$p['id']] = $p;
        }

        $filtered = [];
        foreach ($permIds as $pid) {
            if (!isset($permMap[$pid])) continue;
            $p = $permMap[$pid];

            // Nếu thuộc module bị cấm
            if (in_array($p['module'], $disallowedModules)) {
                continue;
            }

            // Nếu thuộc tiền tố bị cấm
            $isDisallowed = false;
            foreach ($disallowedPrefixes as $prefix) {
                if (str_starts_with($p['name'], $prefix)) {
                    $isDisallowed = true;
                    break;
                }
            }

            if (!$isDisallowed) {
                $filtered[] = $pid;
            }
        }

        return $filtered;
    }
}

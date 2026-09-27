<?php
/**
 * Authentication Middleware
 */
class AuthMiddleware {
    private static function resolveRoleName($roleValue, $roleId) {
        if (is_string($roleValue)) {
            $valLower = strtolower($roleValue);
            if ($valLower === 'admin') return 'Admin';
            if ($valLower === 'manager') return 'Manager';
            if ($valLower === 'staff') return 'Staff';
            if ($valLower === 'member') return 'Member';
            if ($valLower === 'guest') return 'Guest';
        }

        $roleIdInt = (int)$roleId;
        if ($roleIdInt === 5) return 'Admin';
        if ($roleIdInt === 4) return 'Manager';
        if ($roleIdInt === 3) return 'Staff';
        if ($roleIdInt === 2) return 'Member';
        if ($roleIdInt === 1) return 'Guest';

        if ($roleIdInt > 0) {
            try {
                $db = Database::getInstance()->getConnection();
                $stmt = $db->prepare("SELECT base_role FROM roles WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $roleIdInt]);
                $base = $stmt->fetchColumn();
                if ($base) {
                    $bLower = strtolower($base);
                    if ($bLower === 'admin') return 'Admin';
                    if ($bLower === 'manager') return 'Manager';
                    if ($bLower === 'staff') return 'Staff';
                    if ($bLower === 'member') return 'Member';
                    if ($bLower === 'guest') return 'Guest';
                }
            } catch (Exception $e) {}
        }

        if (is_string($roleValue) && $roleValue !== '') {
            return ucfirst($roleValue);
        }

        return 'Guest';
    }

    public static function authenticate() {
        $headers = getallheaders();
        $token = null;
        
        error_log('AuthMiddleware::authenticate - checking headers');
        error_log('AuthMiddleware::authenticate - headers keys: ' . json_encode(array_keys($headers)));
        
        // Get token from Authorization header (case-insensitive)
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        if ($authHeader) {
            error_log('AuthMiddleware::authenticate - Authorization header found: ' . substr($authHeader, 0, 20) . '...');
            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
                error_log('AuthMiddleware::authenticate - token extracted');
            }
        }
        
        if (!$token) {
            error_log('AuthMiddleware::authenticate - TOKEN NOT FOUND');
            Response::unauthorized('Token not provided');
        }
        
        error_log('AuthMiddleware::authenticate - decoding token');
        try {
            $decoded = JWT::decode($token, Config::$jwt_secret);

            $userId = is_array($decoded) ? ($decoded['user_id'] ?? null) : ($decoded->user_id ?? null);
            $role = is_array($decoded) ? ($decoded['role'] ?? null) : ($decoded->role ?? null);
            $baseRole = is_array($decoded) ? ($decoded['base_role'] ?? null) : ($decoded->base_role ?? null);
            $roleId = is_array($decoded) ? ($decoded['role_id'] ?? null) : ($decoded->role_id ?? null);

            // Đồng bộ vai trò thời gian thực từ database nếu có userId
            if ($userId) {
                try {
                    $db = Database::getInstance()->getConnection();
                    $stmtU = $db->prepare("
                        SELECT u.role_id, r.base_role, r.name as role_name
                        FROM users u
                        LEFT JOIN roles r ON r.id = u.role_id
                        WHERE u.id = :uid LIMIT 1
                    ");
                    $stmtU->execute([':uid' => (int)$userId]);
                    $dbUser = $stmtU->fetch(PDO::FETCH_ASSOC);
                    if ($dbUser) {
                        $roleId = (int)$dbUser['role_id'];
                        $baseRole = $dbUser['base_role'];
                        $role = $dbUser['role_name'];
                    }
                } catch (Exception $e) {}
            }

            error_log('AuthMiddleware::authenticate - decoded userId: ' . $userId . ', role: ' . $role . ', baseRole: ' . $baseRole . ', roleId: ' . $roleId);
            
            $roleName = self::resolveRoleName($baseRole ?: $role, $roleId);
            error_log('AuthMiddleware::authenticate - resolved roleName: ' . $roleName);

            if (!$userId) {
                error_log('AuthMiddleware::authenticate - INVALID: userId not in token');
                Response::unauthorized('Invalid token payload');
            }
            
            // Attach user info to request
            $_REQUEST['auth_user_id'] = (int)$userId;
            $_REQUEST['auth_user_role'] = $roleName;
            $_REQUEST['auth_user_role_id'] = $roleId ? (int)$roleId : null;
            $_REQUEST['auth_role_id'] = $roleId ? (int)$roleId : null;
            
            // Update decoded payload with real-time database values
            if (is_array($decoded)) {
                $decoded['role_id'] = $roleId ? (int)$roleId : ($decoded['role_id'] ?? null);
                $decoded['role'] = $roleName;
                $decoded['base_role'] = $baseRole;
            } else if (is_object($decoded)) {
                $decoded->role_id = $roleId ? (int)$roleId : ($decoded->role_id ?? null);
                $decoded->role = $roleName;
                $decoded->base_role = $baseRole;
            }
            
            error_log('AuthMiddleware::authenticate - SUCCESS: set auth_user_role to ' . $roleName);
            return $decoded;
        } catch (Exception $e) {
            error_log('AuthMiddleware::authenticate - JWT DECODE ERROR: ' . $e->getMessage());
            Response::unauthorized('Invalid or expired token');
        }
    }
    
    public static function requireRole($roles) {
        error_log('AuthMiddleware::requireRole - required roles: ' . json_encode($roles));
        
        self::authenticate();
        
        $userRole = $_REQUEST['auth_user_role'] ?? null;
        $userRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        error_log('AuthMiddleware::requireRole - userRole: ' . $userRole);
        
        // ADMIN LUÔN CÓ TẤT CẢ QUYỀN TRÊN TOÀN BỘ HỆ THỐNG
        if ($userRole === 'Admin' || $userRoleId === 5) {
            error_log('AuthMiddleware::requireRole - PASSED (Super Admin)');
            return;
        }

        if (!in_array($userRole, $roles)) {
            // Kiểm tra các vai trò phụ trong bảng user_roles
            $userId = (int)($_REQUEST['auth_user_id'] ?? 0);
            $hasMatchingRole = false;

            if ($userId > 0) {
                try {
                    $db = Database::getInstance()->getConnection();
                    $stmt = $db->prepare("
                        SELECT r.name, r.base_role 
                        FROM roles r
                        JOIN user_roles ur ON ur.role_id = r.id
                        WHERE ur.user_id = :uid AND r.is_active = 1
                    ");
                    $stmt->execute([':uid' => $userId]);
                    $assignedRoles = $stmt->fetchAll(PDO::FETCH_ASSOC);

                    $rolesLower = array_map('strtolower', $roles);
                    foreach ($assignedRoles as $ar) {
                        if (in_array(strtolower($ar['name']), $rolesLower) || in_array(strtolower($ar['base_role']), $rolesLower)) {
                            $hasMatchingRole = true;
                            break;
                        }
                    }
                } catch (Exception $e) {
                    error_log("AuthMiddleware check user_roles error: " . $e->getMessage());
                }
            }

            if (!$hasMatchingRole) {
                error_log('AuthMiddleware::requireRole - DENIED! userRole ' . $userRole . ' not in ' . json_encode($roles));
                Response::forbidden('Insufficient permissions');
            }
        }
        
        error_log('AuthMiddleware::requireRole - PASSED');
    }
    
    public static function requireAdmin() {
        self::requireRole(['Admin']);
    }
    
    public static function requireManager() {
        self::requireRole(['Admin', 'Manager']);
    }
    
    public static function requireStaff() {
        self::requireRole(['Admin', 'Manager', 'Staff']);
    }

    /**
     * Kiểm tra permission động dựa trên bảng role_permissions
     * Nếu user chưa đăng nhập → mặc định là Guest (role_id=1)
     * Nếu đã đăng nhập → kiểm tra tất cả roles của user trong user_roles
     * ADMIN LUÔN CÓ TẤT CẢ QUYỀN
     */
    public static function requirePermission($permissionName) {
        $roleId = 1; // Default: Guest
        $userId = 0;

        // Thử lấy token, nếu có thì lấy role_id
        $headers = getallheaders();
        $token = null;
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        if ($authHeader) {
            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
            }
        }

        if ($token) {
            try {
                $decoded = JWT::decode($token, Config::$jwt_secret);
                $roleId = is_array($decoded)
                    ? (int)($decoded['role_id'] ?? 1)
                    : (int)($decoded->role_id ?? 1);
                $userId = is_array($decoded) ? (int)($decoded['user_id'] ?? 0) : (int)($decoded->user_id ?? 0);
                $role = is_array($decoded) ? ($decoded['role'] ?? null) : ($decoded->role ?? null);
                $baseRole = is_array($decoded) ? ($decoded['base_role'] ?? null) : ($decoded->base_role ?? null);

                // Đồng bộ vai trò thời gian thực từ database
                if ($userId > 0) {
                    try {
                        $db = Database::getInstance()->getConnection();
                        $stmtU = $db->prepare("
                            SELECT u.role_id, r.base_role, r.name as role_name
                            FROM users u
                            LEFT JOIN roles r ON r.id = u.role_id
                            WHERE u.id = :uid LIMIT 1
                        ");
                        $stmtU->execute([':uid' => $userId]);
                        $dbUser = $stmtU->fetch(PDO::FETCH_ASSOC);
                        if ($dbUser) {
                            $roleId = (int)$dbUser['role_id'];
                            $baseRole = $dbUser['base_role'];
                            $role = $dbUser['role_name'];
                        }
                    } catch (Exception $e) {}
                }

                $_REQUEST['auth_user_id'] = $userId ?: null;
                $_REQUEST['auth_user_role_id'] = $roleId;
                $_REQUEST['auth_role_id'] = $roleId;
                $_REQUEST['auth_user_role'] = self::resolveRoleName($baseRole ?: $role, $roleId);
            } catch (Exception $e) {
                // Token không hợp lệ → coi là Guest
                $roleId = 1;
            }
        }

        // SUPER ADMIN (Tài khoản gốc ID=1 hoặc vai trò SYSTEM_ADMIN ID=5)
        // luôn có đặc quyền tối cao bỏ qua ma trận phân quyền.
        // Các tài khoản Admin Cấp 2 / Vai trò tùy chỉnh (Role ID != 5) vẫn phải tuân thủ ma trận phân quyền.
        $isSuperAdmin = ((int)$userId === 1 || (int)$roleId === 5);
        if (!$isSuperAdmin && $userId > 0) {
            try {
                $db = Database::getInstance()->getConnection();
                $stmtCheckSuper = $db->prepare("SELECT COUNT(*) FROM user_roles WHERE user_id = :uid AND role_id = 5");
                $stmtCheckSuper->execute([':uid' => $userId]);
                if ((int)$stmtCheckSuper->fetchColumn() > 0) {
                    $isSuperAdmin = true;
                }
            } catch (Exception $e) {}
        }

        if ($isSuperAdmin) {
            return;
        }

        // Danh sách quyền tương đương / bao hàm (Permission inheritance & aliases)
        $permList = [$permissionName];
        if ($permissionName === 'bookings.create') {
            $permList[] = 'bookings.pos';
        }
        if ($permissionName === 'bookings.view_own') {
            $permList[] = 'bookings.view_all';
            $permList[] = 'bookings.pos';
        }
        if ($permissionName === 'tickets.view_own') {
            $permList[] = 'tickets.view_all';
        }
        if ($permissionName === 'transactions.view_own') {
            $permList[] = 'transactions.view_all';
            $permList[] = 'transactions.manage';
        }
        if ($permissionName === 'showtimes.view') {
            $permList[] = 'bookings.pos';
            $permList[] = 'tickets.scan';
        }
        if ($permissionName === 'concessions.view') {
            $permList[] = 'bookings.pos';
        }

        // Query bảng role_permissions kiểm tra trên tất cả vai trò của user
        // + vai trò Guest (role_id = 1) để bảo đảm mọi tài khoản đăng nhập đều có các quyền xem công khai cơ bản
        try {
            $db = Database::getInstance()->getConnection();
            $inPlaceholders = implode(',', array_fill(0, count($permList), '?'));
            $sql = "SELECT COUNT(*) FROM role_permissions rp
                 INNER JOIN permissions p ON rp.permission_id = p.id
                 WHERE (rp.role_id = ? 
                    OR (? > 0 AND rp.role_id IN (SELECT role_id FROM user_roles WHERE user_id = ?))
                    OR rp.role_id = 1
                 ) AND p.name IN ($inPlaceholders) AND p.is_active = 1";

            $stmt = $db->prepare($sql);
            $params = array_merge([$roleId, $userId, $userId], $permList);
            $stmt->execute($params);

            if ((int)$stmt->fetchColumn() === 0) {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'message' => "Bạn không có quyền thực hiện hành động này ($permissionName)"
                ]);
                exit;
            }
        } catch (PDOException $e) {
            error_log("requirePermission Error: " . $e->getMessage());
            // Nếu lỗi DB thì cho qua để không block hoàn toàn
        }
    }
}

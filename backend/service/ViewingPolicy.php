<?php
/**
 * Quy định xem phim theo Luật Điện ảnh 2022:
 * - Phân loại tuổi P / K / T13 / T16 / T18 / C.
 * - Giờ giới nghiêm: dưới 13 tuổi và dưới 16 tuổi không xem suất kết thúc sau mốc cấu hình.
 * - Giới hạn số ghế mỗi đơn đặt vé.
 * Các mốc lấy từ bảng system_configs, thiếu thì dùng Config.
 */
class ViewingPolicy {
    const DEFAULT_MAX_SEATS = 8;
    const T18_RESTRICTED_MESSAGE = 'Phim phân loại T18 không khả dụng cho khán giả dưới 18 tuổi.';

    private $db;
    private $cache = [];

    public function __construct($db) {
        $this->db = $db;
    }

    /** Kiểm tra nhãn phim có phải T18 không. */
    public static function isT18Rating($ageRating): bool {
        return strtoupper(trim((string)$ageRating)) === 'T18';
    }

    /** Kiểm tra ngày sinh có nhỏ hơn độ tuổi tối thiểu hay không. */
    public static function isUnderAgeFromDob($dob, int $minAge = 18, ?DateTimeInterface $referenceDate = null): bool {
        if (empty($dob)) {
            return false;
        }
        try {
            $birthDate = new DateTimeImmutable((string)$dob);
            $now = $referenceDate ? DateTimeImmutable::createFromInterface($referenceDate) : new DateTimeImmutable();
            if ($birthDate > $now) {
                return false;
            }
            return $now->diff($birthDate)->y < $minAge;
        } catch (Exception $e) {
            return false;
        }
    }

    /**
     * Xác định người xem hiện tại có phải khách hàng dưới 18 tuổi cần ẩn phim T18 không.
     * - Guest (chưa đăng nhập / chưa xác thực ngày sinh): không ẩn.
     * - Admin / Manager / Staff (vai trò chính hoặc vai trò phụ trong user_roles): luôn thấy T18 để quản trị & bán vé.
     * - Khách hàng (Member) đã đăng nhập có dob < 18 tuổi: trả về true (ẩn phim T18).
     */
    public static function shouldHideT18ForViewer($db, ?array $user = null): bool {
        $userId = 0;
        $roleId = 0;
        $roleName = '';
        $baseRole = '';

        if (is_array($user)) {
            $userId = (int)($user['user_id'] ?? $user['id'] ?? 0);
            $roleId = (int)($user['role_id'] ?? 0);
            $roleName = strtolower(trim((string)($user['role'] ?? '')));
            $baseRole = strtolower(trim((string)($user['base_role'] ?? '')));
        }

        if ($userId <= 0 && !empty($_REQUEST['auth_user_id'])) {
            $userId = (int)$_REQUEST['auth_user_id'];
            $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            $roleName = strtolower(trim((string)($_REQUEST['auth_user_role'] ?? '')));
        }

        if ($userId <= 0 && function_exists('getallheaders') && class_exists('JWT') && class_exists('Config')) {
            try {
                $headers = getallheaders();
                $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
                if (!empty($authHeader) && preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                    $decoded = JWT::decode($matches[1], Config::$jwt_secret);
                    $userId = is_array($decoded) ? (int)($decoded['user_id'] ?? 0) : (int)($decoded->user_id ?? 0);
                    $roleId = is_array($decoded) ? (int)($decoded['role_id'] ?? 0) : (int)($decoded->role_id ?? 0);
                    $roleName = strtolower(trim((string)(is_array($decoded) ? ($decoded['role'] ?? '') : ($decoded->role ?? ''))));
                    $baseRole = strtolower(trim((string)(is_array($decoded) ? ($decoded['base_role'] ?? '') : ($decoded->base_role ?? ''))));
                }
            } catch (Exception $e) {
                return false;
            }
        }

        if ($userId <= 0) {
            return false;
        }

        $privilegedRoles = ['admin', 'manager', 'staff'];
        if (
            $userId === 1
            || in_array($roleId, [3, 4, 5], true)
            || in_array($roleName, $privilegedRoles, true)
            || in_array($baseRole, $privilegedRoles, true)
        ) {
            return false;
        }

        if (!$db) {
            return false;
        }

        try {
            // Kiểm tra vai trò chính từ DB
            $stmtRole = $db->prepare("
                SELECT u.role_id, r.name AS role_name, r.base_role
                FROM users u
                LEFT JOIN roles r ON r.id = u.role_id
                WHERE u.id = :uid
                LIMIT 1
            ");
            $stmtRole->execute([':uid' => $userId]);
            $dbRole = $stmtRole->fetch(PDO::FETCH_ASSOC);
            if ($dbRole) {
                $dbRoleId = (int)($dbRole['role_id'] ?? 0);
                $dbRoleName = strtolower(trim((string)($dbRole['role_name'] ?? '')));
                $dbBaseRole = strtolower(trim((string)($dbRole['base_role'] ?? '')));
                if (
                    in_array($dbRoleId, [3, 4, 5], true)
                    || in_array($dbRoleName, $privilegedRoles, true)
                    || in_array($dbBaseRole, $privilegedRoles, true)
                ) {
                    return false;
                }
            }

            // Kiểm tra các vai trò phụ trong user_roles
            try {
                $stmtAssigned = $db->prepare("
                    SELECT r.id, r.name, r.base_role
                    FROM user_roles ur
                    INNER JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = :uid AND r.is_active = 1
                ");
                $stmtAssigned->execute([':uid' => $userId]);
                foreach ($stmtAssigned->fetchAll(PDO::FETCH_ASSOC) as $assigned) {
                    $assignedId = (int)($assigned['id'] ?? 0);
                    $assignedName = strtolower(trim((string)($assigned['name'] ?? '')));
                    $assignedBase = strtolower(trim((string)($assigned['base_role'] ?? '')));
                    if (
                        in_array($assignedId, [3, 4, 5], true)
                        || in_array($assignedName, $privilegedRoles, true)
                        || in_array($assignedBase, $privilegedRoles, true)
                    ) {
                        return false;
                    }
                }
            } catch (Exception $e) {
                // Bảng user_roles có thể không tồn tại ở môi trường test tối giản
            }

            $stmtDob = $db->prepare("SELECT dob FROM user_profiles WHERE user_id = :uid LIMIT 1");
            $stmtDob->execute([':uid' => $userId]);
            $dob = $stmtDob->fetchColumn();
            return self::isUnderAgeFromDob($dob, 18);
        } catch (Exception $e) {
            return false;
        }
    }

    /** Tuổi tối thiểu theo nhãn phim; null nghĩa là cấm phổ biến (C). */
    public static function minimumAge($ageRating) {
        $ratings = ['P' => 0, 'K' => 0, 'T13' => 13, 'T16' => 16, 'T18' => 18];
        $rating = strtoupper(trim((string)$ageRating));
        if ($rating === 'C') {
            return null;
        }
        return $ratings[$rating] ?? 0;
    }

    public function maxSeatsPerBooking() {
        $value = (int)$this->config('max_seats_per_booking', self::DEFAULT_MAX_SEATS);
        return $value > 0 ? $value : self::DEFAULT_MAX_SEATS;
    }

    /** Mốc giới nghiêm (phút tính từ 00:00) cho dưới 13 và dưới 16 tuổi. */
    public function curfewMinutes() {
        return [
            13 => self::toMinutes($this->config('curfew_u13', Config::$curfew_u13 ?? '22:00:00'), 22 * 60),
            16 => self::toMinutes($this->config('curfew_u16', Config::$curfew_u16 ?? '23:00:00'), 23 * 60),
        ];
    }

    /**
     * Kiểm tra một khán giả có được xem suất chiếu không.
     * @return string|null Thông báo lỗi, hoặc null nếu hợp lệ.
     */
    public function viewerViolation($dob, $ageRating, $startTime, $durationMinutes) {
        $minimumAge = self::minimumAge($ageRating);
        if ($minimumAge === null) {
            return 'Phim phân loại C bị cấm phổ biến, không thể đặt vé.';
        }
        if (empty($dob)) {
            return null;
        }

        $start = new DateTime($startTime);
        $age = $start->diff(new DateTime($dob))->y;

        if ($age < $minimumAge) {
            return "Phim phân loại {$ageRating} dành cho khán giả từ {$minimumAge} tuổi trở lên. "
                . "Theo ngày sinh trong hồ sơ, bạn chưa đủ tuổi xem phim này.";
        }

        $endMinutes = self::endMinutes($startTime, $durationMinutes);
        foreach ($this->curfewMinutes() as $ageLimit => $curfew) {
            if ($age < $ageLimit && $endMinutes > $curfew) {
                return "Theo quy định, người dưới {$ageLimit} tuổi không được xem suất chiếu kết thúc sau "
                    . self::formatMinutes($curfew) . '.';
            }
        }
        return null;
    }

    /**
     * Giờ kết thúc muộn nhất khi xếp lịch tự động cho một nhãn phim.
     * Phim K dành cho khán giả dưới 13 tuổi (có người giám hộ) nên phải kết thúc trước giờ giới nghiêm dưới 13.
     * @return int|null Phút tính từ 00:00, hoặc null nếu không giới hạn.
     */
    public function schedulingCurfewMinutes($ageRating) {
        if (strtoupper(trim((string)$ageRating)) === 'K') {
            return $this->curfewMinutes()[13];
        }
        return null;
    }

    /** Phút kết thúc tính từ 00:00 của ngày chiếu; suất qua nửa đêm được cộng 24h. */
    public static function endMinutes($startTime, $durationMinutes) {
        $start = new DateTime($startTime);
        $end = (clone $start)->modify('+' . (int)$durationMinutes . ' minutes');
        $dayStart = (clone $start)->setTime(0, 0);
        return intdiv($end->getTimestamp() - $dayStart->getTimestamp(), 60);
    }

    private static function toMinutes($time, $fallback) {
        if (!preg_match('/^(\d{1,2}):(\d{2})/', (string)$time, $m)) {
            return $fallback;
        }
        return (int)$m[1] * 60 + (int)$m[2];
    }

    private static function formatMinutes($minutes) {
        return sprintf('%02d:%02d', intdiv($minutes, 60) % 24, $minutes % 60);
    }

    private function config($key, $default) {
        if (!array_key_exists($key, $this->cache)) {
            try {
                $stmt = $this->db->prepare("SELECT config_value FROM system_configs WHERE config_key = :key LIMIT 1");
                $stmt->execute([':key' => $key]);
                $value = $stmt->fetchColumn();
                $this->cache[$key] = ($value === false || $value === null || $value === '') ? $default : $value;
            } catch (Exception $e) {
                $this->cache[$key] = $default;
            }
        }
        return $this->cache[$key];
    }
}

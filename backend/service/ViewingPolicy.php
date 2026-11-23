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

    private $db;
    private $cache = [];

    public function __construct($db) {
        $this->db = $db;
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

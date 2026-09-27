<?php
/**
 * ManagerController
 * Quản lý tất cả chức năng của Cinema Manager
 * Scoped theo cinema_id được gán qua cinemas.manager_id
 *
 * API Routes:
 *   GET    /api/manager/dashboard/stats
 *   GET    /api/manager/dashboard/revenue
 *   GET    /api/manager/dashboard/upcoming-shows
 *   GET    /api/manager/cinema/info
 *   GET    /api/manager/cinema/halls
 *   GET    /api/manager/movies/available
 *   GET    /api/manager/showtimes
 *   POST   /api/manager/showtimes
 *   PUT    /api/manager/showtimes/:id
 *   DELETE /api/manager/showtimes/:id
 *   GET    /api/manager/staff
 *   POST   /api/manager/staff
 *   PUT    /api/manager/staff/:id
 *   PATCH  /api/manager/staff/:id/toggle-status
 *   GET    /api/manager/reports/revenue
 *   GET    /api/manager/reports/occupancy
 *   GET    /api/manager/reports/export
 */
class ManagerController extends BaseController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    // ============================================
    // PRIVATE HELPERS
    // ============================================

    private function getCurrentUserId(): int
    {
        return (int) ($_REQUEST['auth_user_id'] ?? 0);
    }

    /**
     * Lấy cinema_id của manager hiện tại
     * Tìm theo cinemas.manager_id = current user_id
     */
    private function getManagerCinemaId(): ?int
    {
        $userId = $this->getCurrentUserId();
        if (!$userId) return null;

        $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
        $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        $isAdmin = ($roleId === 5 || strtolower($roleName) === 'admin');

        if ($isAdmin) {
            $cinemaIdParam = $_GET['cinema_id'] ?? $_POST['cinema_id'] ?? $_REQUEST['cinema_id'] ?? null;
            if ($cinemaIdParam && is_numeric($cinemaIdParam)) {
                return (int)$cinemaIdParam;
            }
            $stmt = $this->db->prepare("SELECT id FROM cinemas WHERE manager_id = :uid LIMIT 1");
            $stmt->execute([':uid' => $userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) return (int)$row['id'];

            $first = $this->db->query("SELECT id FROM cinemas ORDER BY id ASC LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
            return $first ? (int)$first['id'] : null;
        }

        $stmt = $this->db->prepare("
            SELECT COALESCE(cs.cinema_id, c.id) as id 
            FROM users u
            LEFT JOIN cinema_staff cs ON cs.user_id = u.id
            LEFT JOIN cinemas c ON c.manager_id = u.id
            WHERE u.id = :uid LIMIT 1
        ");
        $stmt->execute([':uid' => $userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ? (int) $row['id'] : null;
    }

    /**
     * Require auth + cinema assignment, return cinema_id
     */
    private function requireManagerCinema(): int
    {
        AuthMiddleware::requireManager();
        $cinemaId = $this->getManagerCinemaId();
        if (!$cinemaId) {
            Response::forbidden('Tài khoản manager chưa được gán cho rạp nào. Vui lòng liên hệ Admin.');
        }
        return $cinemaId;
    }

    // ============================================
    // DASHBOARD
    // ============================================

    public function getDashboardStats(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.dashboard');
        $today = date('Y-m-d');

        try {
            $revStmt = $this->db->prepare("
                SELECT COALESCE(SUM(t.amount), 0) AS today_revenue
                FROM transactions t
                INNER JOIN bookings b ON b.id = t.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND t.status = 'Success' AND DATE(t.created_at) = :today
            ");
            $revStmt->execute([':cid' => $cinemaId, ':today' => $today]);
            $todayRevenue = (float) $revStmt->fetchColumn();

            $ticketStmt = $this->db->prepare("
                SELECT COUNT(*) AS today_tickets
                FROM tickets tk
                INNER JOIN bookings b ON b.id = tk.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND tk.status IN ('SOLD','USED') AND DATE(tk.created_at) = :today
            ");
            $ticketStmt->execute([':cid' => $cinemaId, ':today' => $today]);
            $todayTickets = (int) $ticketStmt->fetchColumn();

            $showStmt = $this->db->prepare("
                SELECT COUNT(*) FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND DATE(s.start_time) = :today
            ");
            $showStmt->execute([':cid' => $cinemaId, ':today' => $today]);
            $todayShows = (int) $showStmt->fetchColumn();

            // Occupancy rate hôm nay
            $capStmt = $this->db->prepare("
                SELECT COALESCE(SUM(h.total_seats),0) AS capacity
                FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND DATE(s.start_time) = :today
            ");
            $capStmt->execute([':cid' => $cinemaId, ':today' => $today]);
            $capacity = (int) $capStmt->fetchColumn();

            $soldStmt = $this->db->prepare("
                SELECT COUNT(*) FROM tickets tk
                INNER JOIN bookings b ON b.id = tk.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND tk.status IN ('SOLD','USED') AND DATE(s.start_time) = :today
            ");
            $soldStmt->execute([':cid' => $cinemaId, ':today' => $today]);
            $sold = (int) $soldStmt->fetchColumn();
            $occupancyRate = $capacity > 0 ? round(($sold / $capacity) * 100, 1) : 0.0;

            // So sánh hôm qua
            $yesterday = date('Y-m-d', strtotime('-1 day'));
            $prevRevStmt = $this->db->prepare("
                SELECT COALESCE(SUM(t.amount),0) FROM transactions t
                INNER JOIN bookings b ON b.id = t.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND t.status = 'Success' AND DATE(t.created_at) = :d
            ");
            $prevRevStmt->execute([':cid' => $cinemaId, ':d' => $yesterday]);
            $yesterdayRevenue = (float) $prevRevStmt->fetchColumn();
            $revenueChange = $yesterdayRevenue > 0
                ? round((($todayRevenue - $yesterdayRevenue) / $yesterdayRevenue) * 100, 1)
                : ($todayRevenue > 0 ? 100.0 : 0.0);

            $cinemaStmt = $this->db->prepare("SELECT name FROM cinemas WHERE id = :cid");
            $cinemaStmt->execute([':cid' => $cinemaId]);
            $cinemaName = $cinemaStmt->fetchColumn() ?: '';

            Response::success([
                'cinema_id'      => $cinemaId,
                'cinema_name'    => $cinemaName,
                'today_revenue'  => $todayRevenue,
                'today_tickets'  => $todayTickets,
                'today_shows'    => $todayShows,
                'occupancy_rate' => $occupancyRate,
                'changes'        => ['revenue' => $revenueChange],
            ]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi lấy thống kê: ' . $e->getMessage());
        }
    }

    public function getDashboardRevenue(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.dashboard');
        try {
            $stmt = $this->db->prepare("
                SELECT DATE(t.created_at) AS revenue_date,
                       COALESCE(SUM(t.amount),0) AS revenue
                FROM transactions t
                INNER JOIN bookings b ON b.id = t.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE h.cinema_id = :cid AND t.status = 'Success'
                  AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                GROUP BY DATE(t.created_at)
                ORDER BY DATE(t.created_at) ASC
            ");
            $stmt->execute([':cid' => $cinemaId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $result = [];
            for ($i = 6; $i >= 0; $i--) {
                $date  = date('Y-m-d', strtotime("-$i days"));
                $found = array_filter($rows, fn($r) => $r['revenue_date'] === $date);
                $found = reset($found);
                $d     = new \DateTime($date);
                $day   = ['CN','T2','T3','T4','T5','T6','T7'][(int)$d->format('w')];
                $result[] = [
                    'date'    => $date,
                    'day'     => $day,
                    'revenue' => $found ? round((float)$found['revenue'], 2) : 0,
                ];
            }
            Response::success(['items' => $result]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi lấy doanh thu: ' . $e->getMessage());
        }
    }

    public function getUpcomingShows(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.dashboard');
        try {
            $stmt = $this->db->prepare("
                SELECT s.id, m.title AS movie_title, h.name AS hall_name,
                       s.start_time, s.end_time, h.total_seats,
                       COUNT(DISTINCT CASE WHEN tk.status IN ('SOLD','USED') THEN tk.id END) AS sold_seats
                FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN movies m ON m.id = s.movie_id
                LEFT JOIN bookings b ON b.showtime_id = s.id
                LEFT JOIN tickets tk ON tk.booking_id = b.id
                WHERE h.cinema_id = :cid AND DATE(s.start_time) = CURDATE() AND s.start_time >= NOW()
                GROUP BY s.id ORDER BY s.start_time ASC LIMIT 10
            ");
            $stmt->execute([':cid' => $cinemaId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            Response::success(['upcoming_shows' => array_map(fn($r) => [
                'id'          => (int)$r['id'],
                'movie_title' => $r['movie_title'],
                'hall_name'   => $r['hall_name'],
                'start_time'  => $r['start_time'],
                'total_seats' => (int)$r['total_seats'],
                'sold_seats'  => (int)$r['sold_seats'],
            ], $rows)]);
        } catch (\Exception $e) {
            Response::serverError($e->getMessage());
        }
    }

    public function getCinemaInfo(): void
    {
        $cinemaId = $this->requireManagerCinema();
        // No granular permission needed — scoped to manager's own cinema
        try {
            $stmt = $this->db->prepare("
                SELECT c.*, COUNT(h.id) AS hall_count
                FROM cinemas c LEFT JOIN cinema_halls h ON h.cinema_id = c.id
                WHERE c.id = :cid GROUP BY c.id
            ");
            $stmt->execute([':cid' => $cinemaId]);
            $cinema = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$cinema) Response::notFound('Không tìm thấy thông tin rạp');
            Response::success(['cinema' => $cinema]);
        } catch (\Exception $e) {
            Response::serverError($e->getMessage());
        }
    }

    /**
     * PUT /api/manager/cinema/info
     * Cập nhật thông tin rạp mà manager đang quản lý
     */
    public function updateCinemaInfo(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('cinemas.update');

        try {
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) {
                Response::badRequest('Dữ liệu không hợp lệ');
                return;
            }

            $allowed = ['name', 'address', 'street', 'district', 'city', 'hotline', 'lat', 'lng'];
            $fields = [];
            $params = [':cid' => $cinemaId];

            foreach ($allowed as $field) {
                if (array_key_exists($field, $data)) {
                    $fields[] = "$field = :$field";
                    $params[":$field"] = $data[$field];
                }
            }

            if (empty($fields)) {
                Response::badRequest('Không có trường nào để cập nhật');
                return;
            }

            $sql = "UPDATE cinemas SET " . implode(', ', $fields) . " WHERE id = :cid";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);

            // Return updated cinema info
            $stmt = $this->db->prepare("
                SELECT c.*, COUNT(h.id) AS hall_count
                FROM cinemas c LEFT JOIN cinema_halls h ON h.cinema_id = c.id
                WHERE c.id = :cid GROUP BY c.id
            ");
            $stmt->execute([':cid' => $cinemaId]);
            $cinema = $stmt->fetch(\PDO::FETCH_ASSOC);

            Response::success(['cinema' => $cinema], 'Cập nhật thông tin rạp thành công');
        } catch (\Exception $e) {
            Response::serverError($e->getMessage());
        }
    }

    public function getCinemaHalls(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('halls.view');
        try {
            $stmt = $this->db->prepare("
                SELECT h.*, COUNT(s.id) AS seat_count
                FROM cinema_halls h
                LEFT JOIN seats s ON s.cinema_hall_id = h.id AND s.status = 'Active'
                WHERE h.cinema_id = :cid
                GROUP BY h.id ORDER BY h.name ASC
            ");
            $stmt->execute([':cid' => $cinemaId]);
            Response::success(['halls' => $stmt->fetchAll(\PDO::FETCH_ASSOC)]);
        } catch (\Exception $e) {
            Response::serverError($e->getMessage());
        }
    }

    public function getAvailableMovies(): void
    {
        AuthMiddleware::requireManager();
        AuthMiddleware::requirePermission('movies.view');
        try {
            $stmt = $this->db->query("
                SELECT id, title, duration_minutes AS duration, age_rating, poster_url, status, release_date
                FROM movies
                WHERE status IN ('Now Showing','Coming Soon') AND age_rating != 'C' AND duration_minutes > 0
                ORDER BY status ASC, title ASC
            ");
            Response::success(['movies' => $stmt->fetchAll(\PDO::FETCH_ASSOC)]);
        } catch (\Exception $e) {
            Response::serverError($e->getMessage());
        }
    }

    // ============================================
    // SHOWTIME MANAGEMENT
    // ============================================

    public function getShowtimes(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('showtimes.view');
        try {
            $date     = trim($_GET['date'] ?? '');
            $hallId   = isset($_GET['hall_id']) ? (int)$_GET['hall_id'] : 0;
            $movieId  = isset($_GET['movie_id']) ? (int)$_GET['movie_id'] : 0;
            $dateFrom = trim($_GET['date_from'] ?? '');
            $dateTo   = trim($_GET['date_to'] ?? '');

            $where  = ['h.cinema_id = :cid'];
            $params = [':cid' => $cinemaId];

            if ($date)     { $where[] = 'DATE(s.start_time) = :date';       $params[':date']      = $date; }
            if ($dateFrom) { $where[] = 'DATE(s.start_time) >= :date_from'; $params[':date_from'] = $dateFrom; }
            if ($dateTo)   { $where[] = 'DATE(s.start_time) <= :date_to';   $params[':date_to']   = $dateTo; }
            if ($hallId)   { $where[] = 's.cinema_hall_id = :hall_id';      $params[':hall_id']   = $hallId; }
            if ($movieId)  { $where[] = 's.movie_id = :movie_id';           $params[':movie_id']  = $movieId; }

            $whereSql = 'WHERE ' . implode(' AND ', $where);

            $stmt = $this->db->prepare("
                SELECT s.id, s.movie_id, m.title AS movie_title, m.poster_url, m.duration_minutes AS duration,
                       s.cinema_hall_id, h.name AS hall_name, s.start_time, s.end_time, s.base_price,
                       COALESCE(h.total_seats,0) AS total_seats,
                       COUNT(DISTINCT CASE WHEN tk.status IN ('SOLD','USED') THEN tk.id END) AS sold_seats,
                       s.created_at
                FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN movies m ON m.id = s.movie_id
                LEFT JOIN bookings b ON b.showtime_id = s.id
                LEFT JOIN tickets tk ON tk.booking_id = b.id
                $whereSql
                GROUP BY s.id ORDER BY s.start_time ASC
            ");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $items = array_map(function ($r) {
                $total     = (int)$r['total_seats'];
                $sold      = (int)$r['sold_seats'];
                $occupancy = $total > 0 ? round(($sold / $total) * 100, 1) : 0;
                return [
                    'id'          => (int)$r['id'],
                    'movie_id'    => (int)$r['movie_id'],
                    'movie_title' => $r['movie_title'],
                    'poster_url'  => $r['poster_url'],
                    'duration'    => (int)$r['duration'],
                    'hall_id'     => (int)$r['cinema_hall_id'],
                    'hall_name'   => $r['hall_name'],
                    'start_time'  => $r['start_time'],
                    'end_time'    => $r['end_time'],
                    'base_price'  => (float)$r['base_price'],
                    'total_seats' => $total,
                    'sold_seats'  => $sold,
                    'occupancy'   => $occupancy,
                    'created_at'  => $r['created_at'],
                ];
            }, $rows);

            Response::success(['showtimes' => $items, 'total' => count($items)]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi lấy lịch chiếu: ' . $e->getMessage());
        }
    }

    public function createShowtime(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('showtimes.create');
        try {
            $input = json_decode(file_get_contents('php://input'), true) ?: [];

            foreach (['movie_id','cinema_hall_id','start_time','base_price'] as $f) {
                if (empty($input[$f])) Response::error("Thiếu trường bắt buộc: $f", 400);
            }

            $hallId    = (int)$input['cinema_hall_id'];
            $movieId   = (int)$input['movie_id'];
            $startTime = $input['start_time'];
            $basePrice = (float)$input['base_price'];

            // Hall phải thuộc rạp của manager
            $hallCheck = $this->db->prepare("SELECT id FROM cinema_halls WHERE id = :id AND cinema_id = :cid");
            $hallCheck->execute([':id' => $hallId, ':cid' => $cinemaId]);
            if (!$hallCheck->fetch()) Response::forbidden('Phòng chiếu không thuộc rạp của bạn');

            $movieStmt = $this->db->prepare("SELECT id, duration_minutes, age_rating FROM movies WHERE id = :id");
            $movieStmt->execute([':id' => $movieId]);
            $movie = $movieStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$movie) Response::notFound('Phim không tồn tại');
            if (strtoupper($movie['age_rating']) === 'C') Response::error('Phim phân loại C không được tạo suất chiếu', 400);
            if (strtotime($startTime) < time()) Response::error('Không thể tạo suất chiếu trong quá khứ', 400);

            $duration = (int)$movie['duration_minutes'];
            $endTime  = date('Y-m-d H:i:s', strtotime($startTime) + ($duration + 15) * 60);

            // Conflict check
            $conflictStmt = $this->db->prepare("
                SELECT COUNT(*) FROM showtimes
                WHERE cinema_hall_id = :hall_id AND :start < end_time AND :end > start_time
            ");
            $conflictStmt->execute([':hall_id' => $hallId, ':start' => $startTime, ':end' => $endTime]);
            if ((int)$conflictStmt->fetchColumn() > 0) {
                Response::error('Trùng lịch chiếu! Phòng này đã có suất chiếu trong khung giờ đó', 409);
            }

            $insertStmt = $this->db->prepare("
                INSERT INTO showtimes (movie_id, cinema_hall_id, start_time, end_time, base_price)
                VALUES (:movie_id, :hall_id, :start_time, :end_time, :base_price)
            ");
            $insertStmt->execute([
                ':movie_id'   => $movieId,
                ':hall_id'    => $hallId,
                ':start_time' => $startTime,
                ':end_time'   => $endTime,
                ':base_price' => $basePrice,
            ]);
            $newId = (int)$this->db->lastInsertId();
            Response::success(['message' => 'Tạo suất chiếu thành công', 'showtime_id' => $newId], 201);
        } catch (\Exception $e) {
            Response::serverError('Lỗi tạo suất chiếu: ' . $e->getMessage());
        }
    }

    public function updateShowtime(int $id): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('showtimes.update');
        try {
            $check = $this->db->prepare("
                SELECT s.id, s.start_time, s.end_time, s.cinema_hall_id, s.movie_id
                FROM showtimes s INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE s.id = :id AND h.cinema_id = :cid
            ");
            $check->execute([':id' => $id, ':cid' => $cinemaId]);
            $showtime = $check->fetch(\PDO::FETCH_ASSOC);
            if (!$showtime) Response::notFound('Suất chiếu không tồn tại hoặc không thuộc rạp của bạn');

            $ticketCheck = $this->db->prepare("
                SELECT COUNT(*) FROM tickets tk
                INNER JOIN bookings b ON b.id = tk.booking_id
                WHERE b.showtime_id = :sid AND tk.status IN ('SOLD','USED')
            ");
            $ticketCheck->execute([':sid' => $id]);
            $hasSoldTickets = (int)$ticketCheck->fetchColumn() > 0;

            $input   = json_decode(file_get_contents('php://input'), true) ?: [];
            $updates = [];
            $params  = [];

            if (isset($input['base_price'])) {
                $updates[]           = 'base_price = :base_price';
                $params[':base_price'] = (float)$input['base_price'];
            }

            if (!$hasSoldTickets) {
                if (isset($input['start_time'])) {
                    if (strtotime($input['start_time']) < time()) Response::error('Không thể cập nhật về thời gian trong quá khứ', 400);
                    $hallId    = $input['cinema_hall_id'] ?? $showtime['cinema_hall_id'];
                    $movieId   = $input['movie_id'] ?? $showtime['movie_id'];
                    $startTime = $input['start_time'];
                    $mStmt     = $this->db->prepare("SELECT duration_minutes FROM movies WHERE id = :id");
                    $mStmt->execute([':id' => $movieId]);
                    $mRow     = $mStmt->fetch(\PDO::FETCH_ASSOC);
                    $duration = (int)($mRow['duration_minutes'] ?? 90);
                    $endTime  = date('Y-m-d H:i:s', strtotime($startTime) + ($duration + 15) * 60);

                    $cStmt = $this->db->prepare("
                        SELECT COUNT(*) FROM showtimes
                        WHERE cinema_hall_id = :hall_id AND id != :self_id AND :start < end_time AND :end > start_time
                    ");
                    $cStmt->execute([':hall_id' => $hallId, ':self_id' => $id, ':start' => $startTime, ':end' => $endTime]);
                    if ((int)$cStmt->fetchColumn() > 0) Response::error('Trùng lịch chiếu với suất chiếu khác', 409);

                    $updates[] = 'start_time = :start_time';
                    $updates[] = 'end_time = :end_time';
                    $params[':start_time'] = $startTime;
                    $params[':end_time']   = $endTime;
                }
                if (isset($input['movie_id'])) {
                    $updates[]         = 'movie_id = :movie_id';
                    $params[':movie_id'] = (int)$input['movie_id'];
                }
                if (isset($input['cinema_hall_id'])) {
                    $nhCheck = $this->db->prepare("SELECT id FROM cinema_halls WHERE id = :id AND cinema_id = :cid");
                    $nhCheck->execute([':id' => (int)$input['cinema_hall_id'], ':cid' => $cinemaId]);
                    if (!$nhCheck->fetch()) Response::forbidden('Phòng chiếu không thuộc rạp của bạn');
                    $updates[]       = 'cinema_hall_id = :hall_id';
                    $params[':hall_id'] = (int)$input['cinema_hall_id'];
                }
            }

            if (empty($updates)) Response::error('Không có dữ liệu cập nhật hợp lệ', 400);
            $params[':id'] = $id;
            $stmt = $this->db->prepare("UPDATE showtimes SET " . implode(', ', $updates) . " WHERE id = :id");
            $stmt->execute($params);
            Response::success(['message' => 'Cập nhật suất chiếu thành công']);
        } catch (\Exception $e) {
            Response::serverError('Lỗi cập nhật: ' . $e->getMessage());
        }
    }

    public function deleteShowtime(int $id): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('showtimes.delete');
        try {
            $check = $this->db->prepare("
                SELECT s.id FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                WHERE s.id = :id AND h.cinema_id = :cid
            ");
            $check->execute([':id' => $id, ':cid' => $cinemaId]);
            if (!$check->fetch()) Response::notFound('Suất chiếu không tồn tại hoặc không thuộc rạp của bạn');

            $ticketCheck = $this->db->prepare("
                SELECT COUNT(*) FROM tickets tk
                INNER JOIN bookings b ON b.id = tk.booking_id
                WHERE b.showtime_id = :sid AND tk.status IN ('SOLD','USED')
            ");
            $ticketCheck->execute([':sid' => $id]);
            if ((int)$ticketCheck->fetchColumn() > 0) Response::error('Không thể xóa suất chiếu đã có vé được bán', 409);

            $this->db->prepare("DELETE FROM showtimes WHERE id = :id")->execute([':id' => $id]);
            Response::success(['message' => 'Xóa suất chiếu thành công']);
        } catch (\Exception $e) {
            Response::serverError('Lỗi xóa: ' . $e->getMessage());
        }
    }

    // ============================================
    // STAFF MANAGEMENT
    // ============================================

    public function getStaff(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('users.view_all');
        try {
            $search = trim($_GET['search'] ?? '');
            $status = trim($_GET['status'] ?? '');
            $page   = max(1, (int)($_GET['page'] ?? 1));
            $limit  = min(50, max(1, (int)($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            // Scope by cinema_staff table - only show staff belonging to this cinema
            $where  = ['u.role_id = 3', 'cs.cinema_id = :cinema_id'];
            $params = [':cinema_id' => $cinemaId];

            if ($search) {
                $where[]           = "(up.full_name LIKE :search OR u.email LIKE :search OR up.phone LIKE :search)";
                $params[':search'] = '%' . $search . '%';
            }
            if (in_array($status, ['Active','Banned'])) {
                $where[]           = "u.status = :status";
                $params[':status'] = $status;
            }

            $whereSql = 'WHERE ' . implode(' AND ', $where);

            // Count with cinema_staff join
            $countStmt = $this->db->prepare("
                SELECT COUNT(*)
                FROM users u
                INNER JOIN cinema_staff cs ON cs.user_id = u.id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                $whereSql
            ");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();

            // Bind limit/offset as integers
            $params[':limit']  = $limit;
            $params[':offset'] = $offset;

            $stmt = $this->db->prepare("
                SELECT u.id, u.email, u.status, u.created_at,
                       up.full_name, up.phone, up.dob, up.avatar,
                       cs.cinema_id, cs.created_at AS joined_cinema_at
                FROM users u
                INNER JOIN cinema_staff cs ON cs.user_id = u.id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                $whereSql
                ORDER BY up.full_name ASC
                LIMIT :limit OFFSET :offset
            ");
            foreach ($params as $key => $val) {
                $type = in_array($key, [':limit',':offset']) ? \PDO::PARAM_INT : \PDO::PARAM_STR;
                $stmt->bindValue($key, $val, $type);
            }
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            Response::success([
                'staff'      => $rows,
                'pagination' => [
                    'total'       => $total,
                    'page'        => $page,
                    'limit'       => $limit,
                    'total_pages' => max(1, (int)ceil($total / $limit)),
                ],
            ]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi lấy danh sách nhân viên: ' . $e->getMessage());
        }
    }

    public function createStaff(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('users.create');
        try {
            $input = json_decode(file_get_contents('php://input'), true) ?: [];

            foreach (['email','full_name','phone','dob'] as $f) {
                if (empty($input[$f])) Response::error("Thiếu trường bắt buộc: $f", 400);
            }

            $email = filter_var($input['email'], FILTER_SANITIZE_EMAIL);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) Response::error('Email không hợp lệ', 400);

            $emailCheck = $this->db->prepare("SELECT id FROM users WHERE email = :email");
            $emailCheck->execute([':email' => $email]);
            if ($emailCheck->fetchColumn()) Response::error('Email đã được sử dụng', 409);

            $phone = preg_replace('/\D+/', '', (string)$input['phone']);
            if (!preg_match('/^0\d{9,10}$/', $phone)) Response::error('Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)', 400);

            $phoneCheck = $this->db->prepare("SELECT user_id FROM user_profiles WHERE phone = :phone LIMIT 1");
            $phoneCheck->execute([':phone' => $phone]);
            if ($phoneCheck->fetchColumn()) Response::error('Số điện thoại đã được sử dụng', 409);

            // Default password = DOB in ddmmyyyy format (same as Admin) if password not explicitly provided
            if (!empty($input['password'])) {
                if (strlen($input['password']) < 6) Response::error('Mật khẩu phải có ít nhất 6 ký tự', 400);
                $rawPassword = $input['password'];
            } else {
                try {
                    $dobObj = new \DateTime($input['dob']);
                    $rawPassword = $dobObj->format('dmY');
                } catch (\Exception $e) {
                    Response::error('Ngày sinh không hợp lệ', 400);
                }
            }

            $hash = password_hash($rawPassword, PASSWORD_BCRYPT, ['cost' => 10]);

            $this->db->beginTransaction();

            // Create user account (role_id=3 = Staff)
            $uStmt = $this->db->prepare("INSERT INTO users (email, password_hash, role_id, status, created_at) VALUES (:email,:hash,3,'Active',NOW())");
            $uStmt->execute([':email' => $email, ':hash' => $hash]);
            $userId = (int)$this->db->lastInsertId();

            // Create user profile with dob
            $pStmt = $this->db->prepare("INSERT INTO user_profiles (user_id, full_name, phone, dob, membership_id) VALUES (:uid,:name,:phone,:dob,1)");
            $pStmt->execute([
                ':uid'   => $userId,
                ':name'  => trim((string)$input['full_name']),
                ':phone' => $phone,
                ':dob'   => !empty($input['dob']) ? $input['dob'] : null,
            ]);

            // Link staff to this cinema via cinema_staff
            $csStmt = $this->db->prepare("INSERT IGNORE INTO cinema_staff (cinema_id, user_id, created_at) VALUES (:cid,:uid,NOW())");
            $csStmt->execute([':cid' => $cinemaId, ':uid' => $userId]);

            $this->db->commit();
            Response::success(['message' => 'Tạo tài khoản nhân viên thành công', 'user_id' => $userId], 201);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            Response::serverError('Lỗi tạo nhân viên: ' . $e->getMessage());
        }
    }

    public function updateStaff(int $id): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('users.update_all');
        try {
            // Verify staff belongs to this cinema
            $check = $this->db->prepare("
                SELECT u.id FROM users u
                INNER JOIN cinema_staff cs ON cs.user_id = u.id
                WHERE u.id = :id AND u.role_id = 3 AND cs.cinema_id = :cid
            ");
            $check->execute([':id' => $id, ':cid' => $cinemaId]);
            if (!$check->fetch()) Response::notFound('Nhân viên không tồn tại hoặc không thuộc rạp của bạn');

            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            if (isset($input['phone'])) {
                $normalizedPhone = preg_replace('/\D+/', '', (string)$input['phone']);
                if ($normalizedPhone !== '' && !preg_match('/^0\d{9,10}$/', $normalizedPhone)) {
                    Response::error('Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)', 400);
                }

                if ($normalizedPhone !== '') {
                    $phoneCheck = $this->db->prepare("SELECT user_id FROM user_profiles WHERE phone = :phone AND user_id != :uid LIMIT 1");
                    $phoneCheck->execute([':phone' => $normalizedPhone, ':uid' => $id]);
                    if ($phoneCheck->fetchColumn()) {
                        Response::error('Số điện thoại đã được sử dụng', 409);
                    }
                }

                $input['phone'] = $normalizedPhone;
            }

            if (isset($input['password']) && !empty($input['password'])) {
                if (strlen($input['password']) < 6) {
                    Response::error('Mật khẩu mới phải có ít nhất 6 ký tự', 400);
                }
                $passwordHash = password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 10]);
                $this->db->prepare("UPDATE users SET password_hash = :hash WHERE id = :id")
                         ->execute([':hash' => $passwordHash, ':id' => $id]);
            }

            $updates = [];
            $params  = [':uid' => $id];
            foreach (['full_name','phone','dob'] as $f) {
                if (isset($input[$f])) {
                    $updates[]    = "$f = :$f";
                    $params[":$f"] = $input[$f];
                }
            }

            if (!empty($updates)) {
                $stmt = $this->db->prepare("UPDATE user_profiles SET " . implode(', ', $updates) . " WHERE user_id = :uid");
                $stmt->execute($params);
            }

            if (isset($input['cinema_id']) && (int)$input['cinema_id'] !== $cinemaId) {
                $newCinemaId = (int)$input['cinema_id'];
                // Check if new cinema exists
                $cinemaCheck = $this->db->prepare("SELECT id FROM cinemas WHERE id = :cid");
                $cinemaCheck->execute([':cid' => $newCinemaId]);
                if ($cinemaCheck->fetch()) {
                    $this->db->prepare("UPDATE cinema_staff SET cinema_id = :new_cid WHERE user_id = :uid AND cinema_id = :old_cid")
                             ->execute([':new_cid' => $newCinemaId, ':uid' => $id, ':old_cid' => $cinemaId]);
                }
            }
            Response::success(['message' => 'Cập nhật nhân viên thành công']);
        } catch (\Exception $e) {
            Response::serverError('Lỗi cập nhật nhân viên: ' . $e->getMessage());
        }
    }

    public function toggleStaffStatus(int $id): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('users.update_all');
        try {
            // Verify staff belongs to this cinema via cinema_staff
            $check = $this->db->prepare("
                SELECT u.id, u.status FROM users u
                INNER JOIN cinema_staff cs ON cs.user_id = u.id
                WHERE u.id = :id AND u.role_id = 3 AND cs.cinema_id = :cid
            ");
            $check->execute([':id' => $id, ':cid' => $cinemaId]);
            $user = $check->fetch(\PDO::FETCH_ASSOC);
            if (!$user) Response::notFound('Nhân viên không tồn tại hoặc không thuộc rạp của bạn');

            $newStatus = $user['status'] === 'Active' ? 'Banned' : 'Active';
            $this->db->prepare("UPDATE users SET status = :status WHERE id = :id")
                     ->execute([':status' => $newStatus, ':id' => $id]);

            Response::success([
                'message'    => $newStatus === 'Active' ? 'Kích hoạt tài khoản thành công' : 'Vô hiệu hóa tài khoản thành công',
                'new_status' => $newStatus,
            ]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi: ' . $e->getMessage());
        }
    }

    public function importStaff(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('users.create');
        try {
            $input = json_decode(file_get_contents('php://input'), true);

            if (!is_array($input) || empty($input)) {
                Response::error('Dữ liệu không hợp lệ hoặc rỗng', 400);
            }

            $successCount = 0;
            $errors = [];

            foreach ($input as $index => $item) {
                try {
                    $requiredFields = ['email', 'password', 'full_name', 'phone'];
                    $valid = true;
                    foreach ($requiredFields as $field) {
                        if (empty($item[$field])) {
                            $errors[] = "Dòng " . ($index + 1) . ": Thiếu trường '{$field}'";
                            $valid = false;
                            break;
                        }
                    }
                    if (!$valid) continue;

                    $email = filter_var($item['email'], FILTER_SANITIZE_EMAIL);
                    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                        $errors[] = "Dòng " . ($index + 1) . ": Email không hợp lệ";
                        continue;
                    }

                    $emailCheck = $this->db->prepare("SELECT id FROM users WHERE email = :email");
                    $emailCheck->execute([':email' => $email]);
                    if ($emailCheck->fetchColumn()) {
                        $errors[] = "Dòng " . ($index + 1) . ": Email đã được sử dụng";
                        continue;
                    }

                    $phone = preg_replace('/\D+/', '', (string)$item['phone']);
                    if (!preg_match('/^0\d{9,10}$/', $phone)) {
                        $errors[] = "Dòng " . ($index + 1) . ": Số điện thoại Việt Nam không hợp lệ (bắt đầu bằng 0, gồm 10-11 số)";
                        continue;
                    }

                    $phoneCheck = $this->db->prepare("SELECT user_id FROM user_profiles WHERE phone = :phone LIMIT 1");
                    $phoneCheck->execute([':phone' => $phone]);
                    if ($phoneCheck->fetchColumn()) {
                        $errors[] = "Dòng " . ($index + 1) . ": Số điện thoại đã được sử dụng";
                        continue;
                    }
                    if (strlen($item['password']) < 6) {
                        $errors[] = "Dòng " . ($index + 1) . ": Mật khẩu phải có ít nhất 6 ký tự";
                        continue;
                    }

                    $hash = password_hash($item['password'], PASSWORD_BCRYPT, ['cost' => 10]);

                    $this->db->beginTransaction();

                    $uStmt = $this->db->prepare("INSERT INTO users (email, password_hash, role_id, status, created_at) VALUES (:email,:hash,3,'Active',NOW())");
                    $uStmt->execute([':email' => $email, ':hash' => $hash]);
                    $userId = (int)$this->db->lastInsertId();

                    $pStmt = $this->db->prepare("INSERT INTO user_profiles (user_id, full_name, phone, membership_id) VALUES (:uid,:name,:phone,1)");
                    $pStmt->execute([':uid' => $userId, ':name' => trim((string)$item['full_name']), ':phone' => $phone]);

                    $csStmt = $this->db->prepare("INSERT IGNORE INTO cinema_staff (cinema_id, user_id, created_at) VALUES (:cid,:uid,NOW())");
                    $csStmt->execute([':cid' => $cinemaId, ':uid' => $userId]);

                    $this->db->commit();
                    $successCount++;
                } catch (\Exception $e) {
                    if ($this->db->inTransaction()) $this->db->rollBack();
                    $errors[] = "Dòng " . ($index + 1) . ": " . $e->getMessage();
                }
            }

            Response::success([
                'message' => "Import hoàn tất: Thành công $successCount, Thất bại " . count($errors),
                'success_count' => $successCount,
                'errors' => $errors
            ], 200);

        } catch (\Exception $e) {
            Response::serverError('Lỗi khi import danh sách nhân viên: ' . $e->getMessage());
        }
    }

    // ============================================
    // REPORTS
    // ============================================

    public function getRevenueReport(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.revenue');
        try {
            $from    = trim($_GET['from'] ?? date('Y-m-01'));
            $to      = trim($_GET['to'] ?? date('Y-m-d'));
            $groupBy = trim($_GET['group_by'] ?? 'day');

            $baseWhere  = "h.cinema_id = :cid AND t.status = 'Success' AND DATE(t.created_at) BETWEEN :from AND :to";
            $baseParams = [':cid' => $cinemaId, ':from' => $from, ':to' => $to];
            $baseJoins  = "FROM transactions t
                INNER JOIN bookings b ON b.id = t.booking_id
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN movies m ON m.id = s.movie_id";

            $totalStmt = $this->db->prepare("SELECT COALESCE(SUM(t.amount),0) $baseJoins WHERE $baseWhere");
            $totalStmt->execute($baseParams);
            $totalRevenue = (float)$totalStmt->fetchColumn();

            if ($groupBy === 'movie') {
                $sql = "SELECT m.id AS id, m.title AS label, COALESCE(SUM(t.amount),0) AS revenue, COUNT(DISTINCT b.id) AS booking_count $baseJoins WHERE $baseWhere GROUP BY m.id, m.title ORDER BY revenue DESC";
            } elseif ($groupBy === 'hall') {
                $sql = "SELECT h.id AS id, h.name AS label, COALESCE(SUM(t.amount),0) AS revenue, COUNT(DISTINCT b.id) AS booking_count $baseJoins WHERE $baseWhere GROUP BY h.id, h.name ORDER BY revenue DESC";
            } else {
                $sql = "SELECT DATE(t.created_at) AS label, COALESCE(SUM(t.amount),0) AS revenue, COUNT(DISTINCT b.id) AS booking_count $baseJoins WHERE $baseWhere GROUP BY DATE(t.created_at) ORDER BY DATE(t.created_at) ASC";
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute($baseParams);
            $items = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            Response::success(['total_revenue' => $totalRevenue, 'from' => $from, 'to' => $to, 'group_by' => $groupBy, 'items' => $items]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi báo cáo doanh thu: ' . $e->getMessage());
        }
    }

    public function getOccupancyReport(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.occupancy');
        try {
            $date = trim($_GET['date'] ?? date('Y-m-d'));

            $stmt = $this->db->prepare("
                SELECT s.id AS showtime_id, s.start_time, s.end_time,
                       m.title AS movie_title, h.name AS hall_name, h.total_seats,
                       COUNT(DISTINCT CASE WHEN tk.status IN ('SOLD','USED') THEN tk.id END) AS sold_seats
                FROM showtimes s
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN movies m ON m.id = s.movie_id
                LEFT JOIN bookings b ON b.showtime_id = s.id
                LEFT JOIN tickets tk ON tk.booking_id = b.id
                WHERE h.cinema_id = :cid AND DATE(s.start_time) = :date
                GROUP BY s.id ORDER BY s.start_time ASC
            ");
            $stmt->execute([':cid' => $cinemaId, ':date' => $date]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $items = array_map(function ($r) {
                $total     = (int)$r['total_seats'];
                $sold      = (int)$r['sold_seats'];
                $occupancy = $total > 0 ? round(($sold / $total) * 100, 1) : 0;
                $level     = $occupancy >= 70 ? 'high' : ($occupancy >= 40 ? 'medium' : 'low');
                return [
                    'showtime_id' => (int)$r['showtime_id'],
                    'movie_title' => $r['movie_title'],
                    'hall_name'   => $r['hall_name'],
                    'start_time'  => $r['start_time'],
                    'end_time'    => $r['end_time'],
                    'total_seats' => $total,
                    'sold_seats'  => $sold,
                    'occupancy'   => $occupancy,
                    'level'       => $level,
                ];
            }, $rows);

            // Tóm tắt theo phòng
            $hallStats = [];
            foreach ($items as $item) {
                $n = $item['hall_name'];
                if (!isset($hallStats[$n])) $hallStats[$n] = ['total' => 0, 'sold' => 0, 'shows' => 0];
                $hallStats[$n]['total'] += $item['total_seats'];
                $hallStats[$n]['sold']  += $item['sold_seats'];
                $hallStats[$n]['shows'] += 1;
            }
            $hallSummary = [];
            foreach ($hallStats as $name => $s) {
                $hallSummary[] = [
                    'hall_name'   => $name,
                    'total_shows' => $s['shows'],
                    'occupancy'   => $s['total'] > 0 ? round(($s['sold'] / $s['total']) * 100, 1) : 0,
                ];
            }

            Response::success(['date' => $date, 'showtimes' => $items, 'hall_summary' => $hallSummary]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi báo cáo lấp đầy: ' . $e->getMessage());
        }
    }

    public function getTransactions(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('transactions.view_all');
        try {
            $q = trim((string)($_GET['q'] ?? ''));
            $status = strtolower(trim((string)($_GET['status'] ?? '')));
            $paymentMethod = trim((string)($_GET['payment_method'] ?? ''));
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));
            $limit = isset($_GET['limit']) ? max(1, min(5000, (int)$_GET['limit'])) : 5000;

            $joins = " FROM bookings b
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN movies m ON m.id = s.movie_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN cinemas c ON c.id = h.cinema_id
                LEFT JOIN transactions t ON t.id = (
                    SELECT t2.id FROM transactions t2
                    WHERE t2.booking_id = b.id
                    ORDER BY t2.created_at DESC, t2.id DESC LIMIT 1
                )
                LEFT JOIN users u ON u.id = b.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                LEFT JOIN pos_customers pc ON pc.id = b.guest_customer_id
                LEFT JOIN (
                    SELECT tk.booking_id, COUNT(*) AS seat_count
                    FROM tickets tk GROUP BY tk.booking_id
                ) tkc ON tkc.booking_id = b.id";

            $statusExpr = "CASE
                WHEN t.status = 'Success' THEN 'success'
                WHEN t.status = 'Pending' THEN 'pending'
                WHEN t.status = 'Failed' THEN 'failed'
                WHEN b.status = 'Cancelled' THEN 'refunded'
                ELSE 'pending' END";

            $where = ["h.cinema_id = :cid"];
            $params = [':cid' => $cinemaId];

            if ($q !== '') {
                $where[] = "(LOWER(COALESCE(t.transaction_code, '')) LIKE :q
                    OR LOWER(COALESCE(up.full_name, pc.name, '')) LIKE :q
                    OR LOWER(COALESCE(u.email, '')) LIKE :q
                    OR LOWER(COALESCE(m.title, '')) LIKE :q)";
                $params[':q'] = '%' . mb_strtolower($q, 'UTF-8') . '%';
            }
            if (in_array($status, ['success','pending','failed','refunded'], true)) {
                $where[] = "$statusExpr = :status";
                $params[':status'] = $status;
            }
            if ($paymentMethod !== '') {
                $where[] = "LOWER(COALESCE(t.payment_method, '')) = :pm";
                $params[':pm'] = mb_strtolower($paymentMethod, 'UTF-8');
            }
            if ($dateFrom !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) >= :df";
                $params[':df'] = $dateFrom;
            }
            if ($dateTo !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) <= :dt";
                $params[':dt'] = $dateTo;
            }

            $whereSql = ' WHERE ' . implode(' AND ', $where);

            $dataSql = "SELECT
                    b.id,
                    COALESCE(t.transaction_code, CONCAT('BK-', LPAD(b.id, 6, '0'))) AS booking_display_code,
                    COALESCE(up.full_name, pc.name, CONCAT('User #', COALESCE(b.user_id, 'null'))) AS customer_name,
                    COALESCE(u.email, CASE WHEN pc.phone IS NOT NULL THEN CONCAT(pc.phone, '@guest.local') ELSE '-' END) AS customer_email,
                    m.title AS movie_title,
                    c.name AS cinema_name,
                    s.start_time,
                    COALESCE(tkc.seat_count, 0) AS seat_count,
                    COALESCE(t.amount, b.final_price, b.total_price, 0) AS amount,
                    COALESCE(t.payment_method, 'Cash') AS payment_method,
                    $statusExpr AS display_status,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . $whereSql . "
                ORDER BY COALESCE(t.created_at, b.created_at) DESC, b.id DESC
                LIMIT :lmt";

            $stmt = $this->db->prepare($dataSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':lmt', $limit, \PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $items = array_map(function ($row) {
                $startTime = !empty($row['start_time']) ? new \DateTime($row['start_time']) : null;
                return [
                    'id' => (string)$row['id'],
                    'bookingCode' => $row['booking_display_code'],
                    'customerName' => $row['customer_name'],
                    'customerEmail' => $row['customer_email'],
                    'movieTitle' => $row['movie_title'],
                    'cinemaName' => $row['cinema_name'],
                    'showDate' => $startTime ? $startTime->format('Y-m-d') : '',
                    'showTime' => $startTime ? $startTime->format('H:i') : '-',
                    'seatCount' => (int)$row['seat_count'],
                    'amount' => (float)$row['amount'],
                    'paymentMethod' => $row['payment_method'],
                    'status' => $row['display_status'],
                    'transactionDate' => $row['transaction_date'],
                ];
            }, $rows);

            Response::success(['items' => $items]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi tải giao dịch: ' . $e->getMessage());
        }
    }

    public function getTransactionsExportDetails(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('transactions.view_all');
        try {
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));

            $joins = " FROM bookings b
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN movies m ON m.id = s.movie_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN cinemas c ON c.id = h.cinema_id
                LEFT JOIN transactions t ON t.id = (
                    SELECT t2.id FROM transactions t2
                    WHERE t2.booking_id = b.id
                    ORDER BY t2.created_at DESC, t2.id DESC LIMIT 1
                )
                LEFT JOIN users u ON u.id = b.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                LEFT JOIN pos_customers pc ON pc.id = b.guest_customer_id";

            $where = ["h.cinema_id = :cid"];
            $params = [':cid' => $cinemaId];

            if ($dateFrom !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) >= :df";
                $params[':df'] = $dateFrom;
            }
            if ($dateTo !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) <= :dt";
                $params[':dt'] = $dateTo;
            }

            $whereSql = ' WHERE ' . implode(' AND ', $where);

            // Ticket details
            $ticketWhereSql = $whereSql;
            $concessionWhereSql = $whereSql;
            $finalParams = [];
            foreach ($params as $key => $value) {
                $cleanKey = ltrim($key, ':');
                $tKey = ':t_' . $cleanKey;
                $cKey = ':c_' . $cleanKey;
                $finalParams[$tKey] = $value;
                $finalParams[$cKey] = $value;
                $ticketWhereSql = str_replace($key, $tKey, $ticketWhereSql);
                $concessionWhereSql = str_replace($key, $cKey, $concessionWhereSql);
            }

            $ticketSql = "SELECT
                    b.id AS booking_id, b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Vé' AS item_type,
                    CONCAT('Ghế ', se.row_code, se.number, ' (', st.name, ')') AS item_name,
                    COALESCE(tk.price, 0) AS unit_price, 1 AS quantity,
                    COALESCE(tk.price, 0) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN tickets tk ON tk.booking_id = b.id
                LEFT JOIN seats se ON se.id = tk.seat_id
                LEFT JOIN seat_types st ON st.id = se.seat_type_id
                " . $ticketWhereSql;

            $concessionSql = "SELECT
                    b.id AS booking_id, b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Bắp nước' AS item_type,
                    con.name AS item_name,
                    COALESCE(bc.price, 0) AS unit_price, bc.quantity AS quantity,
                    (COALESCE(bc.price, 0) * bc.quantity) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN booking_concessions bc ON bc.booking_id = b.id
                LEFT JOIN concessions con ON con.id = bc.concession_id
                " . $concessionWhereSql;

            $finalSql = "($ticketSql) UNION ALL ($concessionSql) ORDER BY transaction_date DESC, booking_id DESC";
            $stmtReal = $this->db->prepare($finalSql);
            $stmtReal->execute($finalParams);
            $rows = $stmtReal->fetchAll(\PDO::FETCH_ASSOC);

            $items = array_map(function ($row) {
                $transactionDate = !empty($row['transaction_date']) ? new \DateTime($row['transaction_date']) : null;
                return [
                    'bookingCode' => $row['booking_code'],
                    'customerName' => $row['customer_name'],
                    'itemType' => $row['item_type'],
                    'itemName' => $row['item_name'],
                    'unitPrice' => (float)$row['unit_price'],
                    'quantity' => (int)$row['quantity'],
                    'totalPrice' => (float)$row['total_price'],
                    'transactionDate' => $transactionDate ? $transactionDate->format('Y-m-d H:i:s') : '-',
                ];
            }, $rows);

            Response::success(['items' => $items]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi tải chi tiết: ' . $e->getMessage());
        }
    }

    public function exportReport(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('reports.export');
        try {
            $type = trim($_GET['type'] ?? 'revenue');
            $from = trim($_GET['from'] ?? date('Y-m-01'));
            $to   = trim($_GET['to'] ?? date('Y-m-d'));

            if ($type === 'revenue') {
                $stmt = $this->db->prepare("
                    SELECT DATE(t.created_at) AS Ngay, m.title AS Ten_Phim, h.name AS Phong_Chieu,
                           COUNT(DISTINCT b.id) AS So_Booking, COALESCE(SUM(t.amount),0) AS Doanh_Thu
                    FROM transactions t
                    INNER JOIN bookings b ON b.id = t.booking_id
                    INNER JOIN showtimes s ON s.id = b.showtime_id
                    INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                    INNER JOIN movies m ON m.id = s.movie_id
                    WHERE h.cinema_id = :cid AND t.status = 'Success'
                      AND DATE(t.created_at) BETWEEN :from AND :to
                    GROUP BY DATE(t.created_at), m.id, h.id ORDER BY DATE(t.created_at) ASC
                ");
                $filename = "revenue_{$from}_{$to}.csv";
            } else {
                $stmt = $this->db->prepare("
                    SELECT DATE(s.start_time) AS Ngay, s.start_time AS Gio_Chieu,
                           m.title AS Ten_Phim, h.name AS Phong_Chieu, h.total_seats AS Tong_Ghe,
                           COUNT(DISTINCT CASE WHEN tk.status IN ('SOLD','USED') THEN tk.id END) AS Da_Ban,
                           CONCAT(ROUND(COUNT(DISTINCT CASE WHEN tk.status IN ('SOLD','USED') THEN tk.id END) / NULLIF(h.total_seats,0) * 100, 1),'%') AS Ty_Le_Lap_Day
                    FROM showtimes s
                    INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                    INNER JOIN movies m ON m.id = s.movie_id
                    LEFT JOIN bookings b ON b.showtime_id = s.id
                    LEFT JOIN tickets tk ON tk.booking_id = b.id
                    WHERE h.cinema_id = :cid AND DATE(s.start_time) BETWEEN :from AND :to
                    GROUP BY s.id ORDER BY s.start_time ASC
                ");
                $filename = "occupancy_{$from}_{$to}.csv";
            }
            $stmt->execute([':cid' => $cinemaId, ':from' => $from, ':to' => $to]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            if (ob_get_level()) ob_end_clean();
            header('Content-Type: text/csv; charset=UTF-8');
            header("Content-Disposition: attachment; filename=\"$filename\"");
            header('Cache-Control: no-cache, no-store, must-revalidate');

            echo "\xEF\xBB\xBF"; // BOM for Excel
            $out = fopen('php://output', 'w');
            if (!empty($rows)) {
                fputcsv($out, array_keys($rows[0]));
                foreach ($rows as $row) fputcsv($out, $row);
            }
            fclose($out);
            exit;
        } catch (\Exception $e) {
            Response::serverError('Lỗi export: ' . $e->getMessage());
        }
    }

    // ============================================
    // CONCESSION INVENTORY MANAGEMENT
    // ============================================

    /**
     * GET /api/manager/concessions
     * Danh sách tất cả concessions kèm tồn kho của rạp manager đang quản lý
     */
    public function getConcessions(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('concessions.view');
        try {
            require_once __DIR__ . '/../models/Concession.php';
            $concessionModel = new Concession();
            $items = $concessionModel->getAllWithInventory($cinemaId);
            Response::success(['concessions' => $items, 'cinema_id' => $cinemaId]);
        } catch (\Exception $e) {
            Response::serverError('Lỗi lấy danh sách bắp nước: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/manager/concessions/:id/inventory
     * Cập nhật tồn kho của 1 sản phẩm tại rạp
     * Body: { "quantity": 50 }
     */
    public function updateConcessionInventory(int $id): void
    {
        $concessionId = $id;
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('concessions.update');
        try {
            $input    = json_decode(file_get_contents('php://input'), true) ?: [];
            $quantity = isset($input['quantity']) ? (int)$input['quantity'] : null;

            if ($quantity === null || $quantity < 0) {
                Response::error('Số lượng không hợp lệ (phải >= 0)', 400);
            }

            // Verify concession exists
            $check = $this->db->prepare("SELECT id FROM concessions WHERE id = :id");
            $check->execute([':id' => $concessionId]);
            if (!$check->fetch()) {
                Response::notFound('Sản phẩm không tồn tại');
            }

            require_once __DIR__ . '/../models/Concession.php';
            $concessionModel = new Concession();
            $concessionModel->setInventory($cinemaId, $concessionId, $quantity);

            Response::success([
                'cinema_id'      => $cinemaId,
                'concession_id'  => $concessionId,
                'quantity'       => $quantity,
                'low_stock'      => $quantity < 5,
            ], 'Cập nhật tồn kho thành công');
        } catch (\Exception $e) {
            Response::serverError('Lỗi cập nhật tồn kho: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/manager/concessions/import
     * Nhập hàng hoặc cập nhật tồn kho bắp nước từ Excel
     * Body: {
     *   "items": [
     *     {
     *       "name": "Combo 1",
     *       "quantity": 50,
     *       "mode": "add"|"set",
     *       "price": 75000,
     *       "category": "combo",
     *       "image_url": "..."
     *     }
     *   ],
     *   "default_mode": "set"|"add"
     * }
     */
    public function importConcessions(): void
    {
        $cinemaId = $this->requireManagerCinema();
        AuthMiddleware::requirePermission('concessions.create');
        try {
            $rawInput = json_decode(file_get_contents('php://input'), true);

            if (!is_array($rawInput) || empty($rawInput)) {
                Response::error('Dữ liệu không hợp lệ hoặc rỗng', 400);
            }

            $items = isset($rawInput['items']) && is_array($rawInput['items'])
                ? $rawInput['items']
                : (isset($rawInput[0]) ? $rawInput : []);

            $defaultMode = isset($rawInput['mode'])
                ? (string)$rawInput['mode']
                : (isset($rawInput['default_mode']) ? (string)$rawInput['default_mode'] : 'set');

            if (empty($items)) {
                Response::error('Danh sách sản phẩm trống', 400);
            }

            require_once __DIR__ . '/../models/Concession.php';
            $concessionModel = new Concession();

            $successCount = 0;
            $updatedInventoryCount = 0;
            $createdCount = 0;
            $errors = [];

            // Pre-load all existing concessions
            $existingRows = $this->db->query("SELECT id, name, price, category, image_url FROM concessions")->fetchAll(\PDO::FETCH_ASSOC);
            $concessionMap = [];
            foreach ($existingRows as $row) {
                $cleanName = mb_strtolower(trim($row['name']), 'UTF-8');
                $concessionMap[$cleanName] = $row;
            }

            foreach ($items as $index => $item) {
                $rowNum = $index + 1;
                try {
                    $name = trim((string)($item['name'] ?? ''));
                    if ($name === '') {
                        $errors[] = "Dòng $rowNum: Thiếu tên sản phẩm";
                        continue;
                    }

                    $mode = !empty($item['mode']) ? (string)$item['mode'] : $defaultMode;
                    $rawQty = $item['quantity'] ?? null;
                    $quantity = ($rawQty !== null && $rawQty !== '') ? (int)$rawQty : null;

                    if ($quantity !== null && $quantity < 0) {
                        $errors[] = "Dòng $rowNum: Số lượng không hợp lệ ($quantity < 0)";
                        continue;
                    }

                    $cleanName = mb_strtolower($name, 'UTF-8');
                    $concessionId = null;

                    // Check if concession already exists by name
                    if (isset($concessionMap[$cleanName])) {
                        $concessionId = (int)$concessionMap[$cleanName]['id'];
                    } else if (!empty($item['id']) && is_numeric($item['id'])) {
                        $checkId = (int)$item['id'];
                        $cStmt = $this->db->prepare("SELECT id FROM concessions WHERE id = :id");
                        $cStmt->execute([':id' => $checkId]);
                        if ($cStmt->fetchColumn()) {
                            $concessionId = $checkId;
                        }
                    }

                    // If not found, create new concession if price is provided
                    if (!$concessionId) {
                        $price = isset($item['price']) && is_numeric($item['price']) ? (float)$item['price'] : null;
                        if ($price === null || $price <= 0) {
                            $errors[] = "Dòng $rowNum: Sản phẩm '{$name}' chưa có trong hệ thống và thiếu Giá (VNĐ) hợp lệ để tạo mới";
                            continue;
                        }

                        $category = !empty($item['category']) ? trim((string)$item['category']) : null;
                        $imageUrl = !empty($item['image_url']) ? trim((string)$item['image_url']) : null;

                        $newId = $concessionModel->create([
                            'name'         => $name,
                            'price'        => $price,
                            'category'     => $category,
                            'image_url'    => $imageUrl,
                            'is_available' => true
                        ]);

                        if (!$newId) {
                            $errors[] = "Dòng $rowNum: Không thể tạo sản phẩm '{$name}'";
                            continue;
                        }

                        $concessionId = (int)$newId;
                        $concessionMap[$cleanName] = [
                            'id' => $concessionId,
                            'name' => $name,
                            'price' => $price,
                            'category' => $category,
                            'image_url' => $imageUrl
                        ];
                        $createdCount++;
                    }

                    // Update inventory for manager's cinema
                    if ($quantity !== null) {
                        $targetQty = $quantity;
                        if ($mode === 'add') {
                            $currentStock = $concessionModel->getStock($cinemaId, $concessionId);
                            $targetQty = max(0, $currentStock + $quantity);
                        }

                        $concessionModel->setInventory($cinemaId, $concessionId, $targetQty);
                        $updatedInventoryCount++;
                    }

                    $successCount++;
                } catch (\Exception $e) {
                    $errors[] = "Dòng $rowNum: Lỗi xử lý '{$item['name']}' - " . $e->getMessage();
                }
            }

            Response::success([
                'message' => "Nhập file Excel hoàn tất: $successCount sản phẩm thành công" .
                    ($createdCount > 0 ? " (tạo mới $createdCount món)" : "") .
                    ", cập nhật kho $updatedInventoryCount sản phẩm" .
                    (count($errors) > 0 ? ", " . count($errors) . " dòng lỗi" : ""),
                'success_count' => $successCount,
                'created_count' => $createdCount,
                'updated_inventory_count' => $updatedInventoryCount,
                'errors' => $errors
            ], 200);

        } catch (\Exception $e) {
            Response::serverError('Lỗi khi import danh sách bắp nước: ' . $e->getMessage());
        }
    }
}



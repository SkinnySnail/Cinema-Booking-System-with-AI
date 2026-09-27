<?php

class AdminController extends BaseController {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    private function percentChange($current, $previous) {
        $current = (float)$current;
        $previous = (float)$previous;

        if ($previous == 0.0) {
            return $current > 0 ? 100.0 : 0.0;
        }

        return (($current - $previous) / $previous) * 100.0;
    }

    private function getRevenueByDate($dateYmd) {
        $sql = "SELECT COALESCE(SUM(t.amount), 0) AS total
                FROM transactions t
                WHERE t.status = 'Success'
                  AND DATE(t.created_at) = :d";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':d' => $dateYmd]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (float)($row['total'] ?? 0);
    }

    private function getRevenueForLastDays($days, $offsetDays = 0) {
        $sql = "SELECT COALESCE(SUM(t.amount), 0) AS total
                FROM transactions t
                WHERE t.status = 'Success'
                  AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL :start_days DAY)
                  AND DATE(t.created_at) < DATE_SUB(CURDATE(), INTERVAL :end_days DAY)";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':start_days', (int)($days + $offsetDays), PDO::PARAM_INT);
        $stmt->bindValue(':end_days', (int)$offsetDays, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (float)($row['total'] ?? 0);
    }

    private function getTicketsSoldByDate($dateYmd) {
        $sql = "SELECT COUNT(*) AS total
                FROM tickets tk
                WHERE tk.status IN ('SOLD', 'USED')
                  AND DATE(tk.created_at) = :d";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':d' => $dateYmd]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    }

    private function getTicketsSoldForLastDays($days, $offsetDays = 0) {
        $sql = "SELECT COUNT(*) AS total
                FROM tickets tk
                WHERE tk.status IN ('SOLD', 'USED')
                  AND DATE(tk.created_at) >= DATE_SUB(CURDATE(), INTERVAL :start_days DAY)
                  AND DATE(tk.created_at) < DATE_SUB(CURDATE(), INTERVAL :end_days DAY)";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':start_days', (int)($days + $offsetDays), PDO::PARAM_INT);
        $stmt->bindValue(':end_days', (int)$offsetDays, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    }

    private function getFillRateByShowDate($dateYmd) {
        $capacitySql = "SELECT COALESCE(SUM(h.total_seats), 0) AS capacity
                        FROM showtimes s
                        INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                        WHERE DATE(s.start_time) = :d";

        $capacityStmt = $this->db->prepare($capacitySql);
        $capacityStmt->execute([':d' => $dateYmd]);
        $capacityRow = $capacityStmt->fetch(PDO::FETCH_ASSOC);
        $capacity = (int)($capacityRow['capacity'] ?? 0);

        if ($capacity <= 0) {
            return 0.0;
        }

        $soldSql = "SELECT COUNT(*) AS sold
                    FROM tickets tk
                    INNER JOIN bookings b ON b.id = tk.booking_id
                    INNER JOIN showtimes s ON s.id = b.showtime_id
                    WHERE tk.status IN ('SOLD', 'USED')
                      AND DATE(s.start_time) = :d";

        $soldStmt = $this->db->prepare($soldSql);
        $soldStmt->execute([':d' => $dateYmd]);
        $soldRow = $soldStmt->fetch(PDO::FETCH_ASSOC);
        $sold = (int)($soldRow['sold'] ?? 0);

        return ($sold / $capacity) * 100.0;
    }

    private function getOverallFillRate() {
        $capacitySql = "SELECT COALESCE(SUM(h.total_seats), 0) AS capacity
                        FROM showtimes s
                        INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id";

        $capacityStmt = $this->db->query($capacitySql);
        $capacityRow = $capacityStmt->fetch(PDO::FETCH_ASSOC);
        $capacity = (int)($capacityRow['capacity'] ?? 0);

        if ($capacity <= 0) {
            return 0.0;
        }

        $soldSql = "SELECT COUNT(*) AS sold
                    FROM tickets tk
                    INNER JOIN bookings b ON b.id = tk.booking_id
                    INNER JOIN showtimes s ON s.id = b.showtime_id
                    WHERE tk.status IN ('SOLD', 'USED')";

        $soldStmt = $this->db->query($soldSql);
        $soldRow = $soldStmt->fetch(PDO::FETCH_ASSOC);
        $sold = (int)($soldRow['sold'] ?? 0);

        return ($sold / $capacity) * 100.0;
    }

    public function getDashboardStats() {
        AuthMiddleware::requireManager();

        $totalRevenueSql = "SELECT COALESCE(SUM(t.amount), 0) AS total
                            FROM transactions t
                            WHERE t.status = 'Success'";
        $totalRevenueStmt = $this->db->query($totalRevenueSql);
        $totalRevenueRow = $totalRevenueStmt->fetch(PDO::FETCH_ASSOC);
        $totalRevenue = (float)($totalRevenueRow['total'] ?? 0);

        $totalTicketsSql = "SELECT COUNT(*) AS total
                            FROM tickets tk
                            WHERE tk.status IN ('SOLD', 'USED')";
        $totalTicketsStmt = $this->db->query($totalTicketsSql);
        $totalTicketsRow = $totalTicketsStmt->fetch(PDO::FETCH_ASSOC);
        $totalTickets = (int)($totalTicketsRow['total'] ?? 0);

        $overallFillRate = $this->getOverallFillRate();

        $currentRevenue = $this->getRevenueForLastDays(30, 0);
        $previousRevenue = $this->getRevenueForLastDays(30, 30);

        $currentTickets = $this->getTicketsSoldForLastDays(30, 0);
        $previousTickets = $this->getTicketsSoldForLastDays(30, 30);

        $vnSql = "SELECT
                    SUM(CASE WHEN origin = 'Vietnam' THEN 1 ELSE 0 END) AS vn_count,
                    COUNT(*) AS total_count
                  FROM movies";
        $vnStmt = $this->db->query($vnSql);
        $vnRow = $vnStmt->fetch(PDO::FETCH_ASSOC);
        $vnCount = (int)($vnRow['vn_count'] ?? 0);
        $totalMovies = (int)($vnRow['total_count'] ?? 0);
        $vnRatio = $totalMovies > 0 ? ($vnCount / $totalMovies) * 100.0 : 0.0;

        Response::success([
            // Keep key names for frontend compatibility, but values are now all-time totals.
            'today_revenue' => round($totalRevenue, 2),
            'today_tickets' => $totalTickets,
            'today_fill_rate' => round($overallFillRate, 2),
            'vn_ratio' => round($vnRatio, 2),
            'vn_count' => $vnCount,
            'international_count' => max(0, $totalMovies - $vnCount),
            'changes' => [
                'revenue' => round($this->percentChange($currentRevenue, $previousRevenue), 2),
                'tickets' => round($this->percentChange($currentTickets, $previousTickets), 2),
                'fill_rate' => 0,
            ],
        ]);
    }

    public function getRevenueReport() {
        AuthMiddleware::requireManager();

        $sql = "SELECT DATE(t.created_at) AS revenue_date,
                       COALESCE(SUM(t.amount), 0) AS revenue
                FROM transactions t
                WHERE t.status = 'Success'
                GROUP BY DATE(t.created_at)
                ORDER BY DATE(t.created_at) DESC
                LIMIT 7";

        $stmt = $this->db->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_reverse($rows);

        $days = array_map(function ($r) {
            $d = new DateTime($r['revenue_date']);
            $dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][(int)$d->format('w')];
            return [
                'date' => $d->format('Y-m-d'),
                'day' => $dayLabel,
                'revenue' => round((float)$r['revenue'], 2),
            ];
        }, $rows);

        Response::success(['items' => $days]);
    }

    public function getSeatHeatmap() {
        AuthMiddleware::requireManager();

        $hallId = isset($_GET['hall_id']) ? (int)$_GET['hall_id'] : 0;
        $cinemaId = isset($_GET['cinema_id']) ? (int)$_GET['cinema_id'] : 0;

        $where = [
            "s.status IN ('Active', 'Broken')",
            "s.row_code NOT LIKE '\\_%'",
            "s.number < 1000"
        ];
        $params = [];

        if ($hallId > 0) {
            $where[] = "s.cinema_hall_id = :hall_id";
            $params[':hall_id'] = $hallId;
        } elseif ($cinemaId > 0) {
            $where[] = "h.cinema_id = :cinema_id";
            $params[':cinema_id'] = $cinemaId;
        }

        $whereSql = "WHERE " . implode(' AND ', $where);

        $sql = "SELECT s.row_code AS row_label,
                       s.number AS seat_number,
                       COALESCE(SUM(x.booking_count), 0) AS booking_count
                FROM seats s
                JOIN cinema_halls h ON s.cinema_hall_id = h.id
                LEFT JOIN (
                    SELECT tk.seat_id, COUNT(*) AS booking_count
                    FROM tickets tk
                    INNER JOIN bookings b ON b.id = tk.booking_id
                    WHERE tk.status IN ('SOLD', 'USED')
                    GROUP BY tk.seat_id
                ) x ON x.seat_id = s.id
                $whereSql
                GROUP BY s.row_code, s.number
                ORDER BY s.row_code, s.number";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $max = 0;
        $sum = 0;
        $zero = 0;
        foreach ($rows as $r) {
            $count = (int)$r['booking_count'];
            $sum += $count;
            if ($count === 0) {
                $zero++;
            }
            if ($count > $max) {
                $max = $count;
            }
        }

        $avg = count($rows) > 0 ? ($sum / count($rows)) : 0;

        Response::success([
            'items' => array_map(function ($r) {
                return [
                    'row' => $r['row_label'],
                    'number' => (int)$r['seat_number'],
                    'booking_count' => (int)$r['booking_count'],
                ];
            }, $rows),
            'stats' => [
                'max_booking_count' => $max,
                'zero_booking_seats' => $zero,
                'average_booking_count' => round($avg, 2),
            ],
        ]);
    }

    public function getRecentTransactions() {
        AuthMiddleware::requireManager();

        $sql = "SELECT t.transaction_code,
                       t.payment_method,
                       t.amount,
                       t.status,
                       t.created_at,
                       u.email,
                       COALESCE(up.full_name, u.email) AS customer_name,
                       COALESCE(up.phone, '') AS customer_phone
                FROM transactions t
                INNER JOIN bookings b ON b.id = t.booking_id
                INNER JOIN users u ON u.id = b.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                ORDER BY t.created_at DESC
                LIMIT 10";

        $stmt = $this->db->query($sql);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success(['items' => $items]);
    }

    public function getTransactions() {
        AuthMiddleware::requireManager();

        try {
            // Tự động hết hạn các booking Pending quá 10 phút trước khi hiển thị
            try {
                require_once __DIR__ . '/../models/Booking.php';
                $bookingModel = new Booking($this->db);
                $bookingModel->expireStaleBookings(10);
            } catch (Exception $ex) {
                error_log('Auto-expire stale bookings error: ' . $ex->getMessage());
            }

            $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
            $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
            $offset = ($page - 1) * $limit;

            $q = trim((string)($_GET['q'] ?? ''));
            $status = strtolower(trim((string)($_GET['status'] ?? '')));
            $paymentMethod = trim((string)($_GET['payment_method'] ?? ''));
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));

            $joins = " FROM bookings b
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN movies m ON m.id = s.movie_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN cinemas c ON c.id = h.cinema_id
                LEFT JOIN transactions t ON t.id = (
                    SELECT t2.id
                    FROM transactions t2
                    WHERE t2.booking_id = b.id
                    ORDER BY t2.created_at DESC, t2.id DESC
                    LIMIT 1
                )
                LEFT JOIN users u ON u.id = b.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                LEFT JOIN pos_customers pc ON pc.id = b.guest_customer_id
                LEFT JOIN (
                    SELECT tk.booking_id, COUNT(*) AS seat_count
                    FROM tickets tk
                    GROUP BY tk.booking_id
                ) tkc ON tkc.booking_id = b.id";

            $statusExpr = "CASE
                WHEN t.status = 'Success' THEN 'success'
                WHEN t.status = 'Pending' AND b.status != 'Expired' THEN 'pending'
                WHEN t.status = 'Failed' OR b.status = 'Expired' THEN 'failed'
                WHEN b.status = 'Cancelled' THEN 'refunded'
                ELSE 'pending'
            END";

            $where = [];
            $params = [];

            if ($q !== '') {
                $where[] = "(
                    LOWER(COALESCE(t.transaction_code, '')) LIKE :q1
                    OR LOWER(COALESCE(b.booking_code, '')) LIKE :q2
                    OR LOWER(COALESCE(up.full_name, pc.name, CONCAT('user #', COALESCE(b.user_id, 0)))) LIKE :q3
                    OR LOWER(COALESCE(u.email, '')) LIKE :q4
                    OR LOWER(COALESCE(pc.phone, '')) LIKE :q5
                    OR LOWER(COALESCE(m.title, '')) LIKE :q6
                )";
                $qVal = '%' . mb_strtolower($q, 'UTF-8') . '%';
                $params[':q1'] = $qVal;
                $params[':q2'] = $qVal;
                $params[':q3'] = $qVal;
                $params[':q4'] = $qVal;
                $params[':q5'] = $qVal;
                $params[':q6'] = $qVal;
            }

            if (in_array($status, ['success', 'pending', 'failed', 'refunded'], true)) {
                $where[] = "$statusExpr = :status";
                $params[':status'] = $status;
            }

            if ($paymentMethod !== '') {
                $where[] = "LOWER(COALESCE(t.payment_method, '')) = :payment_method";
                $params[':payment_method'] = mb_strtolower($paymentMethod, 'UTF-8');
            }

            if ($dateFrom !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) >= :date_from";
                $params[':date_from'] = $dateFrom;
            }

            if ($dateTo !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) <= :date_to";
                $params[':date_to'] = $dateTo;
            }

            $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

            $countSql = "SELECT COUNT(*) AS total" . $joins . $whereSql;
            $countStmt = $this->db->prepare($countSql);
            foreach ($params as $key => $value) {
                $countStmt->bindValue($key, $value);
            }
            $countStmt->execute();
            $total = (int)($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

            $dataSql = "SELECT
                    b.id,
                    b.booking_code,
                    b.status AS booking_status,
                    COALESCE(t.transaction_code, CONCAT('BK-', LPAD(b.id, 6, '0'))) AS booking_display_code,
                    COALESCE(up.full_name, pc.name, CONCAT('User #', COALESCE(b.user_id, 'null'))) AS customer_name,
                    COALESCE(u.email, CASE WHEN pc.phone IS NOT NULL THEN CONCAT(pc.phone, '@guest.local') ELSE '-' END) AS customer_email,
                    COALESCE(pc.phone, up.phone, '-') AS customer_phone,
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
                LIMIT :limit OFFSET :offset";

            $stmt = $this->db->prepare($dataSql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $items = array_map(function ($row) {
                $startTime = !empty($row['start_time']) ? new DateTime($row['start_time']) : null;
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

            $summarySql = "SELECT
                    COALESCE(SUM(CASE WHEN $statusExpr = 'success' THEN COALESCE(t.amount, b.final_price, b.total_price, 0) ELSE 0 END), 0) AS total_revenue,
                    SUM(CASE WHEN $statusExpr = 'success' THEN 1 ELSE 0 END) AS success_count,
                    SUM(CASE WHEN $statusExpr = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN $statusExpr IN ('failed', 'refunded') THEN 1 ELSE 0 END) AS failed_or_refunded_count
                " . $joins . $whereSql;
            $summaryStmt = $this->db->prepare($summarySql);
            foreach ($params as $key => $value) {
                $summaryStmt->bindValue($key, $value);
            }
            $summaryStmt->execute();
            $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

            Response::success([
                'items' => $items,
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'totalPages' => max(1, (int)ceil($total / max(1, $limit))),
                    'hasMore' => ($offset + count($items)) < $total,
                ],
                'summary' => [
                    'totalRevenue' => (float)($summary['total_revenue'] ?? 0),
                    'successCount' => (int)($summary['success_count'] ?? 0),
                    'pendingCount' => (int)($summary['pending_count'] ?? 0),
                    'failedOrRefundedCount' => (int)($summary['failed_or_refunded_count'] ?? 0),
                ],
                'filters' => [
                    'q' => $q,
                    'status' => $status,
                    'payment_method' => $paymentMethod,
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo,
                ],
            ]);
        } catch (Exception $e) {
            Response::serverError('Không thể tải danh sách giao dịch: ' . $e->getMessage());
        }
    }

    public function getTransactionsExportDetails() {
        AuthMiddleware::requireManager();

        try {
            $q = trim((string)($_GET['q'] ?? ''));
            $status = strtolower(trim((string)($_GET['status'] ?? '')));
            $paymentMethod = trim((string)($_GET['payment_method'] ?? ''));
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));

            $joins = " FROM bookings b
                INNER JOIN showtimes s ON s.id = b.showtime_id
                INNER JOIN movies m ON m.id = s.movie_id
                INNER JOIN cinema_halls h ON h.id = s.cinema_hall_id
                INNER JOIN cinemas c ON c.id = h.cinema_id
                LEFT JOIN transactions t ON t.id = (
                    SELECT t2.id
                    FROM transactions t2
                    WHERE t2.booking_id = b.id
                    ORDER BY t2.created_at DESC, t2.id DESC
                    LIMIT 1
                )
                LEFT JOIN users u ON u.id = b.user_id
                LEFT JOIN user_profiles up ON up.user_id = u.id
                LEFT JOIN pos_customers pc ON pc.id = b.guest_customer_id";

            $statusExpr = "CASE
                WHEN t.status = 'Success' THEN 'success'
                WHEN t.status = 'Pending' AND b.status != 'Expired' THEN 'pending'
                WHEN t.status = 'Failed' OR b.status = 'Expired' THEN 'failed'
                WHEN b.status = 'Cancelled' THEN 'refunded'
                ELSE 'pending'
            END";

            $where = [];
            $params = [];

            if ($q !== '') {
                $where[] = "(
                    LOWER(COALESCE(t.transaction_code, '')) LIKE :q1
                    OR LOWER(COALESCE(b.booking_code, '')) LIKE :q2
                    OR LOWER(COALESCE(up.full_name, pc.name, CONCAT('user #', COALESCE(b.user_id, 0)))) LIKE :q3
                    OR LOWER(COALESCE(u.email, '')) LIKE :q4
                    OR LOWER(COALESCE(pc.phone, '')) LIKE :q5
                    OR LOWER(COALESCE(m.title, '')) LIKE :q6
                )";
                $qVal = '%' . mb_strtolower($q, 'UTF-8') . '%';
                $params[':q1'] = $qVal;
                $params[':q2'] = $qVal;
                $params[':q3'] = $qVal;
                $params[':q4'] = $qVal;
                $params[':q5'] = $qVal;
                $params[':q6'] = $qVal;
            }

            if (in_array($status, ['success', 'pending', 'failed', 'refunded'], true)) {
                $where[] = "$statusExpr = :status";
                $params[':status'] = $status;
            }

            if ($paymentMethod !== '') {
                $where[] = "LOWER(COALESCE(t.payment_method, '')) = :payment_method";
                $params[':payment_method'] = mb_strtolower($paymentMethod, 'UTF-8');
            }

            if ($dateFrom !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) >= :date_from";
                $params[':date_from'] = $dateFrom;
            }

            if ($dateTo !== '') {
                $where[] = "DATE(COALESCE(t.created_at, b.created_at)) <= :date_to";
                $params[':date_to'] = $dateTo;
            }

            $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

            $ticketSql = "SELECT
                    b.id AS booking_id,
                    b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Vé' AS item_type,
                    CONCAT('Ghế ', se.row_code, se.number, ' (', st.name, ')') AS item_name,
                    COALESCE(tk.price, 0) AS unit_price,
                    1 AS quantity,
                    COALESCE(tk.price, 0) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN tickets tk ON tk.booking_id = b.id
                LEFT JOIN seats se ON se.id = tk.seat_id
                LEFT JOIN seat_types st ON st.id = se.seat_type_id
                " . $whereSql;

            $concessionSql = "SELECT
                    b.id AS booking_id,
                    b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Bắp nước' AS item_type,
                    con.name AS item_name,
                    COALESCE(bc.price, 0) AS unit_price,
                    bc.quantity AS quantity,
                    (COALESCE(bc.price, 0) * bc.quantity) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN booking_concessions bc ON bc.booking_id = b.id
                LEFT JOIN concessions con ON con.id = bc.concession_id
                " . $whereSql;

            $finalSql = "($ticketSql) UNION ALL ($concessionSql) ORDER BY transaction_date DESC, booking_id DESC";

            $stmt = $this->db->prepare($finalSql);
            // We reuse params array since where is duplicated in both UNION branches
            foreach ($params as $key => $value) {
                // Must bind twice if using named parameters in dual queries, but PDO named params can be problematic in UNIONs. 
                // However, PDO accepts parameter passing by overriding with an array on execute. Let's use execute(array) below to avoid binding issues per occurrence.
            }
            // Better to build a single execute array with two sets of params or use positional.
            // Let's use named parameters by executing the statement with an associative array. Wait, PDO allows reusing named parameters multiple times in the query if emulation is on, but fails if emulation is off.
            // To be safe, we will just prepare and bind properly.
            
            // To be thoroughly safe with PDO and UNION, I append `1` and `2` to the parameters or use `?` placeholders.
            // An easier way is to just do a subquery or CTE instead of UNION, or just use `execute` with the param array because MySQL PDO in PHP usually supports it since 5.3+. Wait, no, `execute($params)` fails if a named param appears twice.
            // Let's rewrite the query to avoid named param duplication or just replace values directly since they are bound safely. Wait, I MUST USE PARAMS.
            // I'll dynamically rename keys in $params for ticket and concession.
            
            $finalParams = [];
            $ticketWhereSql = $whereSql;
            $concessionWhereSql = $whereSql;
            
            foreach ($params as $key => $value) {
                $cleanKey = ltrim($key, ':');
                $tKey = ':t_' . $cleanKey;
                $cKey = ':c_' . $cleanKey;
                $finalParams[$tKey] = $value;
                $finalParams[$cKey] = $value;
                $ticketWhereSql = str_replace($key, $tKey, $ticketWhereSql);
                $concessionWhereSql = str_replace($key, $cKey, $concessionWhereSql);
            }

            $ticketSqlReal = "SELECT
                    b.id AS booking_id,
                    b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Vé' AS item_type,
                    CONCAT('Ghế ', se.row_code, se.number, ' (', st.name, ')') AS item_name,
                    COALESCE(tk.price, 0) AS unit_price,
                    1 AS quantity,
                    COALESCE(tk.price, 0) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN tickets tk ON tk.booking_id = b.id
                LEFT JOIN seats se ON se.id = tk.seat_id
                LEFT JOIN seat_types st ON st.id = se.seat_type_id
                " . $ticketWhereSql;

            $concessionSqlReal = "SELECT
                    b.id AS booking_id,
                    b.booking_code,
                    COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                    'Bắp nước' AS item_type,
                    con.name AS item_name,
                    COALESCE(bc.price, 0) AS unit_price,
                    bc.quantity AS quantity,
                    (COALESCE(bc.price, 0) * bc.quantity) AS total_price,
                    COALESCE(t.created_at, b.created_at) AS transaction_date
                " . $joins . "
                INNER JOIN booking_concessions bc ON bc.booking_id = b.id
                LEFT JOIN concessions con ON con.id = bc.concession_id
                " . $concessionWhereSql;

            $finalSqlReal = "($ticketSqlReal) UNION ALL ($concessionSqlReal) ORDER BY transaction_date DESC, booking_id DESC";

            $stmtReal = $this->db->prepare($finalSqlReal);
            $stmtReal->execute($finalParams);
            $rows = $stmtReal->fetchAll(PDO::FETCH_ASSOC);

            // Format rows
            $items = array_map(function ($row) {
                $transactionDate = !empty($row['transaction_date']) ? new DateTime($row['transaction_date']) : null;
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
        } catch (Exception $e) {
            Response::serverError('Không thể tải chi tiết giao dịch export: ' . $e->getMessage());
        }
    }

    /**
     * Admin-only: force-update booking status bypassing normal state checks.
     * Body: { "action": "confirm" | "cancel" | "refund" }
     */
    public function forceUpdateBookingStatus($id) {
        AuthMiddleware::authenticate();
        AuthMiddleware::requireRole(['Admin', 'Manager']);

        $id = (int)$id;
        $body = json_decode(file_get_contents('php://input'), true);
        $action = $body['action'] ?? '';

        if (!in_array($action, ['confirm', 'cancel', 'refund'], true)) {
            Response::error('Action không hợp lệ. Chọn: confirm, cancel, refund', 400);
            return;
        }

        // Verify booking exists
        $stmt = $this->db->prepare("SELECT id, status FROM bookings WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $booking = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$booking) {
            Response::notFound('Booking not found');
            return;
        }

        try {
            require_once __DIR__ . '/../models/Booking.php';
            $bookingModel = new Booking($this->db);

            if ($action === 'confirm') {
                // Use full confirm flow (awards loyalty points, marks tickets SOLD, etc.)
                $bookingModel->confirm($id);
                Response::success(['booking_id' => $id], 'Đã xác nhận thành công');
            } elseif ($action === 'cancel') {
                // Force: update status + tickets + transaction to Failed
                $this->db->beginTransaction();
                $this->db->prepare("UPDATE bookings SET status = 'Cancelled' WHERE id = :id")
                    ->execute([':id' => $id]);
                $this->db->prepare("UPDATE tickets SET status = 'REFUNDED' WHERE booking_id = :id AND status IN ('HOLDING', 'SOLD')")
                    ->execute([':id' => $id]);
                $this->db->prepare("UPDATE transactions SET status = 'Failed' WHERE booking_id = :id AND status = 'Pending'")
                    ->execute([':id' => $id]);
                $this->db->commit();
                Response::success(['booking_id' => $id], 'Đã đánh dấu thất bại');
            } else {
                // refund: bookings→Cancelled, tickets→REFUNDED, transactions→Failed
                // (DB ENUM: bookings: Pending/Paid/Cancelled/Expired, transactions: Pending/Success/Failed)
                $this->db->beginTransaction();
                $this->db->prepare("UPDATE bookings SET status = 'Cancelled' WHERE id = :id")
                    ->execute([':id' => $id]);
                $this->db->prepare("UPDATE tickets SET status = 'REFUNDED' WHERE booking_id = :id AND status IN ('HOLDING', 'SOLD')")
                    ->execute([':id' => $id]);
                $this->db->prepare("UPDATE transactions SET status = 'Failed' WHERE booking_id = :id AND status = 'Pending'")
                    ->execute([':id' => $id]);
                $this->db->commit();
                Response::success(['booking_id' => $id], 'Đã hoàn tiền');
            }
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            Response::serverError('Lỗi cập nhật: ' . $e->getMessage());
        }
    }
}

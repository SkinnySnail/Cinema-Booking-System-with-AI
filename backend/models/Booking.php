<?php
/**
 * Booking Model
 */
class Booking {
    private $db;

    public function __construct($db) {
        $this->db = $db;
    }

    public function create($userId, $showtimeId, $seatIds, $concessions = [], $userVoucherId = null, $guestCustomerId = null) {
        if (empty($seatIds)) {
            throw new Exception('Danh sách ghế không được để trống');
        }

        // Must provide either userId (authenticated user) or guestCustomerId (POS walk-in)
        if (!$userId && !$guestCustomerId) {
            throw new Exception('Phải cung cấp user_id hoặc guest_customer_id');
        }

        $showtime = $this->getShowtime($showtimeId);
        if (!$showtime) {
            throw new Exception('Suất chiếu không tồn tại');
        }
        $this->ensureShowtimeIsBookable($showtime);

        $seatIds = array_values(array_unique(array_map('intval', $seatIds)));

        $this->db->beginTransaction();
        try {
            // Validate seats belong to hall and are active
            $seatDetails = $this->getSeatDetails($seatIds, (int)$showtime['cinema_hall_id']);
            if (count($seatDetails) !== count($seatIds)) {
                throw new Exception('Ghế không hợp lệ hoặc không thuộc phòng chiếu');
            }

            // Check seat availability
            $unavailableSeats = $this->getUnavailableSeats($showtimeId, $seatIds);
            if (!empty($unavailableSeats)) {
                throw new Exception('Một số ghế đã được giữ hoặc đã bán');
            }

            // Calculate total price
            $pricing = $this->calculateTotalPrice($showtime, $seatDetails, $concessions);
            $totalPrice = $pricing['total_price'];

            $voucherDiscount = 0;
            // Only apply voucher discount if booking for authenticated user, not guest
            if ($userVoucherId && $userId) {
                $voucherDiscount = $this->applyVoucherDiscount($userVoucherId, $userId, $totalPrice);
            }

            $membershipDiscount = 0;
            // Only apply membership discount if booking for authenticated user, not guest
            if ($userId) {
                $membershipDiscount = $this->applyMembershipDiscount($userId, $totalPrice);
            }

            $discountAmount = $voucherDiscount + $membershipDiscount;
            if ($discountAmount > $totalPrice) {
                $discountAmount = $totalPrice;
            }

            $finalPrice = $totalPrice - $discountAmount;

            // Create booking
            $bookingCode = $this->generateBookingCode();

            $stmt = $this->db->prepare(
                "INSERT INTO bookings (booking_code, user_id, guest_customer_id, showtime_id, user_voucher_id, total_price, discount_amount, final_price, status)
                 VALUES (:booking_code, :user_id, :guest_customer_id, :showtime_id, :user_voucher_id, :total_price, :discount_amount, :final_price, 'Pending')"
            );
            $stmt->execute([
                ':booking_code' => $bookingCode,
                ':user_id' => $userId ?: null,
                ':guest_customer_id' => $guestCustomerId ?: null,
                ':showtime_id' => $showtimeId,
                ':user_voucher_id' => $userVoucherId ?: null,
                ':total_price' => $totalPrice,
                ':discount_amount' => $discountAmount,
                ':final_price' => $finalPrice,
            ]);

            $bookingId = (int)$this->db->lastInsertId();

            // If guest customer, increment their booking count
            if ($guestCustomerId) {
                $this->incrementGuestCustomerBooking($guestCustomerId);
            }

            // Create tickets (HOLDING)
            $holdExpiresAt = date('Y-m-d H:i:s', time() + $this->getSeatHoldDuration());
            $ticketStmt = $this->db->prepare(
                "INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status, hold_expires_at)
                 VALUES (:booking_id, :seat_id, :price, :ticket_code, 'HOLDING', :hold_expires_at)"
            );

            $ticketIndex = 1;
            foreach ($pricing['seat_prices'] as $seatId => $price) {
                $ticketCode = $this->generateTicketCode($bookingId, $ticketIndex);
                $ticketStmt->execute([
                    ':booking_id' => $bookingId,
                    ':seat_id' => $seatId,
                    ':price' => $price,
                    ':ticket_code' => $ticketCode,
                    ':hold_expires_at' => $holdExpiresAt,
                ]);
                $ticketIndex++;
            }

            // Insert concessions
            if (!empty($pricing['concessions'])) {
                $concessionStmt = $this->db->prepare(
                    "INSERT INTO booking_concessions (booking_id, concession_id, quantity, price)
                     VALUES (:booking_id, :concession_id, :quantity, :price)"
                );
                foreach ($pricing['concessions'] as $item) {
                    $concessionStmt->execute([
                        ':booking_id' => $bookingId,
                        ':concession_id' => $item['id'],
                        ':quantity' => $item['quantity'],
                        ':price' => $item['price'],
                    ]);
                }
            }

            $this->db->commit();

            // Xóa seat_holds tạm khi đã tạo booking thật
            try {
                require_once __DIR__ . '/SeatHold.php';
                $seatHoldModel = new SeatHold();
                $seatHoldModel->releaseSeats($showtimeId, $seatIds, $userId ?: 0);
            } catch (Exception $ex) {
                error_log('Release seat_holds after booking: ' . $ex->getMessage());
            }

            return [
                'booking_id' => $bookingId,
                'booking_code' => $bookingCode,
                'hold_expires_at' => $holdExpiresAt,
                'total_price' => $totalPrice,
                'discount_amount' => $discountAmount,
                'final_price' => $finalPrice,
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function getById($id) {
        $stmt = $this->db->prepare(
            "SELECT b.*, s.start_time, s.end_time, s.cinema_hall_id, m.title AS movie_title, m.duration_minutes, m.poster_url,
                    c.name AS cinema_name, h.name AS hall_name,
                    COALESCE(up.full_name, pc.name, CONCAT('User #', COALESCE(b.user_id, 'null'))) AS customer_name,
                    COALESCE(u.email, CASE WHEN pc.phone IS NOT NULL THEN CONCAT(pc.phone, '@guest.local') ELSE '-' END) AS customer_email,
                    COALESCE(pc.phone, up.phone, '-') AS customer_phone
             FROM bookings b
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             LEFT JOIN users u ON u.id = b.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN pos_customers pc ON pc.id = b.guest_customer_id
             WHERE b.id = :id"
        );
        $stmt->execute([':id' => $id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function getDetails($id) {
        $booking = $this->getById($id);
        if (!$booking) {
            return null;
        }

        $ticketStmt = $this->db->prepare(
            "SELECT t.*, s.row_code, s.number, st.name AS seat_type
             FROM tickets t
             JOIN seats s ON t.seat_id = s.id
             JOIN seat_types st ON s.seat_type_id = st.id
             WHERE t.booking_id = :booking_id"
        );
        $ticketStmt->execute([':booking_id' => $id]);
        $booking['tickets'] = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);

        $concessionStmt = $this->db->prepare(
            "SELECT bc.*, c.name, c.category, c.image_url
             FROM booking_concessions bc
             JOIN concessions c ON bc.concession_id = c.id
             WHERE bc.booking_id = :booking_id"
        );
        $concessionStmt->execute([':booking_id' => $id]);
        $booking['concessions'] = $concessionStmt->fetchAll(PDO::FETCH_ASSOC);

        $transactionStmt = $this->db->prepare(
            "SELECT * FROM transactions WHERE booking_id = :booking_id ORDER BY created_at DESC LIMIT 1"
        );
        $transactionStmt->execute([':booking_id' => $id]);
        $booking['transaction'] = $transactionStmt->fetch(PDO::FETCH_ASSOC);

        return $booking;
    }

    public function getUserBookings($userId, $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $stmt = $this->db->prepare(
            "SELECT b.*, m.title AS movie_title, m.poster_url, m.duration_minutes, m.age_rating,
                    s.start_time, c.name AS cinema_name, h.name AS hall_name,
                    tx.payment_method, tx.status AS payment_status
             FROM bookings b
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             LEFT JOIN (
                SELECT t1.booking_id, t1.payment_method, t1.status
                FROM transactions t1
                INNER JOIN (
                    SELECT booking_id, MAX(id) AS max_id
                    FROM transactions
                    GROUP BY booking_id
                ) latest ON latest.max_id = t1.id
             ) tx ON tx.booking_id = b.id
             WHERE (b.user_id = :user_id OR (b.guest_customer_id IS NOT NULL AND b.guest_customer_id IN (
                 SELECT pc.id FROM pos_customers pc
                 INNER JOIN user_profiles up ON (
                     up.phone = pc.phone 
                     OR REPLACE(REPLACE(REPLACE(up.phone, ' ', ''), '.', ''), '-', '') = REPLACE(REPLACE(REPLACE(pc.phone, ' ', ''), '.', ''), '-', '')
                 )
                 WHERE up.user_id = :user_id_sub
             )))
             ORDER BY b.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':user_id_sub', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();

        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($bookings as &$booking) {
            $bookingId = (int)$booking['id'];
            $booking['seats'] = $this->getBookingSeatsSummary($bookingId);
            $booking['seats_detail'] = $this->getBookingSeatsDetail($bookingId);
            $booking['concessions'] = $this->getBookingConcessionsSummary($bookingId);
            $booking['ticket_codes'] = $this->getBookingTicketCodes($bookingId);
        }
        unset($booking);

        return $bookings;
    }

    private function getBookingSeatsDetail($bookingId) {
        $stmt = $this->db->prepare(
            "SELECT s.row_code, s.number, CAST(t.price AS CHAR) AS price, st.name AS seat_type
             FROM tickets t
             JOIN seats s ON t.seat_id = s.id
             LEFT JOIN seat_types st ON s.seat_type_id = st.id
             WHERE t.booking_id = :booking_id
             ORDER BY s.row_code, s.number"
        );
        $stmt->execute([':booking_id' => $bookingId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function getBookingSeatsSummary($bookingId) {
        $stmt = $this->db->prepare(
            "SELECT GROUP_CONCAT(CONCAT(s.row_code, s.number) ORDER BY s.row_code, s.number SEPARATOR ', ') AS seats
             FROM tickets t
             JOIN seats s ON t.seat_id = s.id
             WHERE t.booking_id = :booking_id"
        );
        $stmt->execute([':booking_id' => $bookingId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row['seats'] ?? '';
    }

    private function getBookingConcessionsSummary($bookingId) {
        $stmt = $this->db->prepare(
            "SELECT
                bc.concession_id AS id,
                c.name AS concession_name,
                bc.quantity,
                CAST(bc.price AS CHAR) AS unit_price,
                CAST((bc.price * bc.quantity) AS CHAR) AS subtotal,
                c.category
             FROM booking_concessions bc
             JOIN concessions c ON bc.concession_id = c.id
             WHERE bc.booking_id = :booking_id"
        );
        $stmt->execute([':booking_id' => $bookingId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function getBookingTicketCodes($bookingId) {
        $stmt = $this->db->prepare(
            "SELECT ticket_code
             FROM tickets
             WHERE booking_id = :booking_id
             ORDER BY id ASC"
        );
        $stmt->execute([':booking_id' => $bookingId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_values(array_filter(array_map(function ($row) {
            return $row['ticket_code'] ?? null;
        }, $rows)));
    }

    public function countUserBookings($userId) {
        $stmt = $this->db->prepare(
            "SELECT COUNT(DISTINCT b.id) AS total
             FROM bookings b
             WHERE (b.user_id = :user_id OR (b.guest_customer_id IS NOT NULL AND b.guest_customer_id IN (
                 SELECT pc.id FROM pos_customers pc
                 INNER JOIN user_profiles up ON (
                     up.phone = pc.phone 
                     OR REPLACE(REPLACE(REPLACE(up.phone, ' ', ''), '.', ''), '-', '') = REPLACE(REPLACE(REPLACE(pc.phone, ' ', ''), '.', ''), '-', '')
                 )
                 WHERE up.user_id = :user_id_sub
             )))"
        );
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':user_id_sub', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)$row['total'];
    }

    public function getPosPaymentHistory($filters = [], $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $where = ["b.guest_customer_id IS NOT NULL"];
        $params = [];

        if (!empty($filters['phone'])) {
            $where[] = 'pc.phone LIKE :phone';
            $params[':phone'] = '%' . trim($filters['phone']) . '%';
        }
        if (!empty($filters['booking_code'])) {
            $where[] = 'b.booking_code LIKE :booking_code';
            $params[':booking_code'] = '%' . trim($filters['booking_code']) . '%';
        }
        if (!empty($filters['movie_title'])) {
            $where[] = 'm.title LIKE :movie_title';
            $params[':movie_title'] = '%' . trim($filters['movie_title']) . '%';
        }
        if (!empty($filters['booking_status'])) {
            $where[] = 'b.status = :booking_status';
            $params[':booking_status'] = $filters['booking_status'];
        }
        if (!empty($filters['payment_status'])) {
            $where[] = 'tx.status = :payment_status';
            $params[':payment_status'] = $filters['payment_status'];
        }
        if (!empty($filters['date_from'])) {
            $where[] = 'DATE(b.created_at) >= :date_from';
            $params[':date_from'] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'DATE(b.created_at) <= :date_to';
            $params[':date_to'] = $filters['date_to'];
        }
        if (!empty($filters['cinema_id'])) {
            $where[] = 'c.id = :cinema_id';
            $params[':cinema_id'] = (int)$filters['cinema_id'];
        }

        $whereSql = 'WHERE ' . implode(' AND ', $where);

        $sql =
            "SELECT
                b.id,
                b.booking_code,
                b.status AS booking_status,
                b.total_price,
                b.final_price,
                b.created_at,
                pc.id AS guest_customer_id,
                COALESCE(up.phone, pc.phone, '-') AS customer_phone,
                COALESCE(up.full_name, pc.name, 'Khách vãng lai') AS customer_name,
                b.user_id,
                CASE WHEN b.user_id IS NULL THEN 'guest' ELSE 'registered' END AS customer_type,
                s.start_time,
                m.title AS movie_title,
                c.name AS cinema_name,
                h.name AS hall_name,
                tx.status AS payment_status,
                tx.payment_method,
                GROUP_CONCAT(CONCAT(se.row_code, se.number) ORDER BY se.row_code, se.number SEPARATOR ', ') AS seats
             FROM bookings b
             JOIN pos_customers pc ON b.guest_customer_id = pc.id
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             LEFT JOIN users u ON u.id = b.user_id
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN tickets t ON t.booking_id = b.id
             LEFT JOIN seats se ON se.id = t.seat_id
             LEFT JOIN (
                SELECT t1.booking_id, t1.status, t1.payment_method
                FROM transactions t1
                INNER JOIN (
                    SELECT booking_id, MAX(id) AS max_id
                    FROM transactions
                    GROUP BY booking_id
                ) latest ON latest.max_id = t1.id
             ) tx ON tx.booking_id = b.id
             $whereSql
             GROUP BY
                b.id, b.booking_code, b.status, b.total_price, b.final_price, b.created_at,
                pc.id, up.phone, pc.phone, up.full_name, pc.name,
                b.user_id,
                s.start_time, m.title, c.name, h.name,
                tx.status, tx.payment_method
             ORDER BY b.created_at DESC
             LIMIT :limit OFFSET :offset";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countPosPaymentHistory($filters = []) {
        $where = ["b.guest_customer_id IS NOT NULL"];
        $params = [];

        if (!empty($filters['phone'])) {
            $where[] = 'pc.phone LIKE :phone';
            $params[':phone'] = '%' . trim($filters['phone']) . '%';
        }
        if (!empty($filters['booking_code'])) {
            $where[] = 'b.booking_code LIKE :booking_code';
            $params[':booking_code'] = '%' . trim($filters['booking_code']) . '%';
        }
        if (!empty($filters['movie_title'])) {
            $where[] = 'm.title LIKE :movie_title';
            $params[':movie_title'] = '%' . trim($filters['movie_title']) . '%';
        }
        if (!empty($filters['booking_status'])) {
            $where[] = 'b.status = :booking_status';
            $params[':booking_status'] = $filters['booking_status'];
        }
        if (!empty($filters['payment_status'])) {
            $where[] = 'tx.status = :payment_status';
            $params[':payment_status'] = $filters['payment_status'];
        }
        if (!empty($filters['date_from'])) {
            $where[] = 'DATE(b.created_at) >= :date_from';
            $params[':date_from'] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'DATE(b.created_at) <= :date_to';
            $params[':date_to'] = $filters['date_to'];
        }
        if (!empty($filters['cinema_id'])) {
            $where[] = 'c.id = :cinema_id';
            $params[':cinema_id'] = (int)$filters['cinema_id'];
        }

        $whereSql = 'WHERE ' . implode(' AND ', $where);

        $sql =
            "SELECT COUNT(DISTINCT b.id) AS total
             FROM bookings b
             JOIN pos_customers pc ON b.guest_customer_id = pc.id
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             LEFT JOIN (
                SELECT t1.booking_id, t1.status
                FROM transactions t1
                INNER JOIN (
                    SELECT booking_id, MAX(id) AS max_id
                    FROM transactions
                    GROUP BY booking_id
                ) latest ON latest.max_id = t1.id
             ) tx ON tx.booking_id = b.id
             $whereSql";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    }

    public function getAll($filters = [], $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'b.status = :status';
            $params[':status'] = $filters['status'];
        }
        if (!empty($filters['user_id'])) {
            $where[] = 'b.user_id = :user_id';
            $params[':user_id'] = (int)$filters['user_id'];
        }
        if (!empty($filters['showtime_id'])) {
            $where[] = 'b.showtime_id = :showtime_id';
            $params[':showtime_id'] = (int)$filters['showtime_id'];
        }

        $whereSql = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        $sql =
            "SELECT b.*, m.title AS movie_title, s.start_time, c.name AS cinema_name, h.name AS hall_name
             FROM bookings b
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             $whereSql
             ORDER BY b.created_at DESC
             LIMIT :limit OFFSET :offset";

        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countAll($filters = []) {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params[':status'] = $filters['status'];
        }
        if (!empty($filters['user_id'])) {
            $where[] = 'user_id = :user_id';
            $params[':user_id'] = (int)$filters['user_id'];
        }
        if (!empty($filters['showtime_id'])) {
            $where[] = 'showtime_id = :showtime_id';
            $params[':showtime_id'] = (int)$filters['showtime_id'];
        }

        $whereSql = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
        $stmt = $this->db->prepare("SELECT COUNT(*) AS total FROM bookings $whereSql");
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)$row['total'];
    }

    public function updateStatus($id, $status) {
        $stmt = $this->db->prepare("UPDATE bookings SET status = :status WHERE id = :id");
        return $stmt->execute([
            ':status' => $status,
            ':id' => $id,
        ]);
    }

    public function confirm($id) {
        $this->db->beginTransaction();
        try {
            $booking = $this->getById($id);
            if (!$booking) {
                throw new Exception('Booking not found');
            }

            $this->updateStatus($id, 'Paid');

            $stmt = $this->db->prepare(
                "UPDATE tickets SET status = 'SOLD', hold_expires_at = NULL WHERE booking_id = :booking_id AND status = 'HOLDING'"
            );
            $stmt->execute([':booking_id' => $id]);

            // Ensure payment transaction history is always present for confirmed bookings
            // (important for counter/POS cash sales).
            $this->ensureTransactionForConfirmedBooking($booking);

            // Mark voucher used if any
            $stmt = $this->db->prepare("SELECT user_voucher_id FROM bookings WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!empty($row['user_voucher_id'])) {
                $updateVoucher = $this->db->prepare(
                    "UPDATE user_vouchers SET status = 'USED', used_at = NOW() WHERE id = :id AND status = 'ACTIVE'"
                );
                $updateVoucher->execute([':id' => $row['user_voucher_id']]);
            }

            // Award loyalty points for this paid booking
            try {
                require_once __DIR__ . '/LoyaltyHistory.php';
                if ($booking && !empty($booking['final_price']) && !empty($booking['user_id'])) {
                    $finalPrice = (float)$booking['final_price'];
                    $userId = (int)$booking['user_id'];
                    $points = LoyaltyHistory::calculatePoints($finalPrice);
                    if ($points > 0) {
                        $lh = new LoyaltyHistory();
                        $lh->create($userId, $points, 'PURCHASE', 'Earned from booking #'.(int)$id, $id);
                    }
                }
            } catch (Exception $e) {
                // Log but do not prevent booking confirmation
                error_log('Loyalty award error: ' . $e->getMessage());
            }

            // Notify this exact account after successful payment.
            try {
                require_once __DIR__ . '/Notification.php';
                if ($booking && !empty($booking['user_id'])) {
                    $notification = new Notification();
                    $title = 'Thanh toán thành công';
                    $message = sprintf(
                        'Bạn đã thanh toán thành công đơn vé %s cho phim "%s".',
                        $booking['booking_code'] ?? ('#' . (int)$id),
                        $booking['movie_title'] ?? 'Không xác định'
                    );
                    $notification->createUserNotification((int)$booking['user_id'], $title, $message, 'BOOKING');
                }
            } catch (Exception $e) {
                // Do not break confirmation if notification fails.
                error_log('Booking notification error: ' . $e->getMessage());
            }

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Upsert transaction row when booking is confirmed outside gateway verification flow.
     */
    private function ensureTransactionForConfirmedBooking($booking) {
        $bookingId = (int)$booking['id'];
        $amount = isset($booking['final_price']) ? (float)$booking['final_price'] : (float)($booking['total_price'] ?? 0);

        $select = $this->db->prepare("SELECT id, status FROM transactions WHERE booking_id = :booking_id ORDER BY id DESC LIMIT 1");
        $select->execute([':booking_id' => $bookingId]);
        $existing = $select->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            $code = $this->generatePosTransactionCode($bookingId);
            $insert = $this->db->prepare(
                "INSERT INTO transactions (booking_id, payment_method, amount, transaction_code, status)
                 VALUES (:booking_id, 'Cash', :amount, :transaction_code, 'Success')"
            );
            $insert->execute([
                ':booking_id' => $bookingId,
                ':amount' => $amount,
                ':transaction_code' => $code,
            ]);
            return;
        }

        if (($existing['status'] ?? '') !== 'Success') {
            $update = $this->db->prepare("UPDATE transactions SET status = 'Success', amount = :amount, updated_at = NOW() WHERE id = :id");
            $update->execute([
                ':amount' => $amount,
                ':id' => (int)$existing['id'],
            ]);
        }
    }

    private function generatePosTransactionCode($bookingId) {
        return 'POS-' . date('YmdHis') . '-' . (int)$bookingId . '-' . strtoupper(substr(md5(uniqid((string)$bookingId, true)), 0, 6));
    }

    /**
     * Increment guest customer's total bookings count
     */
    private function incrementGuestCustomerBooking($guestCustomerId) {
        try {
            $update = $this->db->prepare(
                "UPDATE pos_customers SET total_bookings = total_bookings + 1 WHERE id = :id"
            );
            $update->execute([':id' => (int)$guestCustomerId]);
        } catch (Exception $e) {
            // Log but don't fail the booking if guest counter fails
            error_log("Failed to increment guest customer booking count: " . $e->getMessage());
        }
    }

    public function restoreConcessions($bookingId) {
        try {
            $stmtCinema = $this->db->prepare("
                SELECT c.id as cinema_id
                FROM bookings b
                JOIN showtimes s ON s.id = b.showtime_id
                JOIN cinema_halls ch ON ch.id = s.cinema_hall_id
                JOIN cinemas c ON c.id = ch.cinema_id
                WHERE b.id = :bid LIMIT 1
            ");
            $stmtCinema->execute([':bid' => $bookingId]);
            $cinemaId = $stmtCinema->fetchColumn();

            if ($cinemaId) {
                $stmtItems = $this->db->prepare("
                    SELECT concession_id, quantity 
                    FROM booking_concessions 
                    WHERE booking_id = :bid
                ");
                $stmtItems->execute([':bid' => $bookingId]);
                $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

                foreach ($items as $item) {
                    $cid = (int)$item['concession_id'];
                    $qty = (int)$item['quantity'];
                    if ($cid > 0 && $qty > 0) {
                        $upd = $this->db->prepare("
                            UPDATE cinema_concession_inventory 
                            SET quantity = quantity + :qty 
                            WHERE cinema_id = :cid AND concession_id = :concession_id
                        ");
                        $upd->execute([
                            ':qty' => $qty,
                            ':cid' => $cinemaId,
                            ':concession_id' => $cid
                        ]);
                    }
                }
            }
        } catch (Exception $e) {
            error_log("restoreConcessions error for booking #$bookingId: " . $e->getMessage());
        }
    }

    public function cancel($id) {
        $this->db->beginTransaction();
        try {
            $this->updateStatus($id, 'Cancelled');

            $stmt = $this->db->prepare(
                "UPDATE tickets SET status = 'REFUNDED' WHERE booking_id = :booking_id AND status IN ('HOLDING', 'SOLD')"
            );
            $stmt->execute([':booking_id' => $id]);

            // Hoàn lại tồn kho bắp nước nếu có
            $this->restoreConcessions($id);

            // Hoàn lại voucher nếu đã dùng
            $voucherStmt = $this->db->prepare(
                "SELECT user_voucher_id FROM bookings WHERE id = :id"
            );
            $voucherStmt->execute([':id' => $id]);
            $row = $voucherStmt->fetch(PDO::FETCH_ASSOC);
            if (!empty($row['user_voucher_id'])) {
                $restoreVoucher = $this->db->prepare(
                    "UPDATE user_vouchers SET status = 'ACTIVE', used_at = NULL
                     WHERE id = :id AND status = 'USED'"
                );
                $restoreVoucher->execute([':id' => $row['user_voucher_id']]);
            }

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function refund($id) {
        $this->db->beginTransaction();
        try {
            $this->updateStatus($id, 'Refunded');

            $stmt = $this->db->prepare(
                "UPDATE tickets SET status = 'REFUNDED' WHERE booking_id = :booking_id AND status IN ('HOLDING', 'SOLD')"
            );
            $stmt->execute([':booking_id' => $id]);

            // Mark transaction as Refunded
            $stmt2 = $this->db->prepare(
                "UPDATE transactions SET status = 'Refunded' WHERE booking_id = :booking_id"
            );
            $stmt2->execute([':booking_id' => $id]);

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function calculateTotalPrice($showtime, $seatDetails, $concessions) {
        $basePrice = (float)($showtime['base_price'] ?? 0);
        if ($basePrice <= 0) {
            $basePrice = $this->getBaseTicketPrice();
        }
        $adjustment = $this->getPricingAdjustment($showtime['start_time']);

        $seatPrices = [];
        $seatTotal = 0;
        foreach ($seatDetails as $seat) {
            $price = ($basePrice + $adjustment) * (float)$seat['price_multiplier'];
            $price = max(0, $price);
            $seatPrices[(int)$seat['id']] = $price;
            $seatTotal += $price;
        }

        $concessionItems = $this->normalizeConcessions($concessions);
        $concessionTotal = 0;
        $concessionDetails = [];
        if (!empty($concessionItems)) {
            $concessionDetails = $this->getConcessionDetails($concessionItems);
            foreach ($concessionDetails as $item) {
                $concessionTotal += $item['price'] * $item['quantity'];
            }
        }

        return [
            'seat_prices' => $seatPrices,
            'concessions' => $concessionDetails,
            'seat_total' => $seatTotal,
            'concession_total' => $concessionTotal,
            'total_price' => $seatTotal + $concessionTotal,
        ];
    }

    public function applyMembershipDiscount($userId, $total) {
        $stmt = $this->db->prepare(
            "SELECT m.discount_rate
             FROM user_profiles up
             JOIN memberships m ON up.membership_id = m.id
             WHERE up.user_id = :user_id"
        );
        $stmt->execute([':user_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return 0;
        }
        $rate = (float)$row['discount_rate'];
        if ($rate <= 0) {
            return 0;
        }
        return round($total * ($rate / 100), 2);
    }

    public function applyVoucherDiscount($userVoucherId, $userId, $total) {
        $stmt = $this->db->prepare(
            "SELECT uv.id, uv.status, p.code AS promo_code, p.discount_amount, p.discount_type, p.min_order_value, p.start_date, p.end_date
             FROM user_vouchers uv
             JOIN promotions p ON uv.promotion_id = p.id
             WHERE uv.id = :id AND uv.user_id = :user_id"
        );
        $stmt->execute([
            ':id' => $userVoucherId,
            ':user_id' => $userId,
        ]);
        $voucher = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$voucher) {
            throw new Exception('Voucher không hợp lệ');
        }
        if ($voucher['status'] !== 'ACTIVE') {
            throw new Exception('Voucher không còn hiệu lực');
        }

        $today = date('Y-m-d');
        if ($today < $voucher['start_date'] || $today > $voucher['end_date']) {
            throw new Exception('Voucher đã hết hạn');
        }

        $promoCode = strtoupper((string)($voucher['promo_code'] ?? ''));
        if ($promoCode === 'BIRTHDAY') {
            $dobStmt = $this->db->prepare(
                "SELECT dob FROM user_profiles WHERE user_id = :user_id LIMIT 1"
            );
            $dobStmt->execute([':user_id' => $userId]);
            $profile = $dobStmt->fetch(PDO::FETCH_ASSOC);
            $dob = $profile['dob'] ?? null;
            if (!$dob || date('m-d', strtotime((string)$dob)) !== date('m-d')) {
                throw new Exception('Voucher sinh nhật chỉ dùng được đúng ngày sinh nhật của bạn');
            }
        }

        $tierCodeMap = [
            'TIER_SILVER' => 'silver',
            'TIER_GOLD' => 'gold',
            'TIER_PLATINUM' => 'platinum',
        ];
        $requiredTier = $tierCodeMap[$promoCode] ?? null;
        if ($requiredTier !== null) {
            $tierStmt = $this->db->prepare(
                "SELECT m.rank_name\n                 FROM user_profiles up\n                 LEFT JOIN memberships m ON up.membership_id = m.id\n                 WHERE up.user_id = :user_id\n                 LIMIT 1"
            );
            $tierStmt->execute([':user_id' => $userId]);
            $tierRow = $tierStmt->fetch(PDO::FETCH_ASSOC);
            $rank = strtolower((string)($tierRow['rank_name'] ?? ''));
            if ($rank !== $requiredTier) {
                throw new Exception('Voucher hạng chỉ dùng khi tài khoản đang ở đúng hạng yêu cầu');
            }
        }

        if ($total < (float)$voucher['min_order_value']) {
            throw new Exception('Đơn hàng chưa đạt giá trị tối thiểu để áp dụng voucher');
        }

        $discount = 0;
        if ($voucher['discount_type'] === 'PERCENT') {
            $discount = $total * ((float)$voucher['discount_amount'] / 100);
        } else {
            $discount = (float)$voucher['discount_amount'];
        }

        return min($discount, $total);
    }

    private function getShowtime($showtimeId) {
        $stmt = $this->db->prepare("SELECT * FROM showtimes WHERE id = :id");
        $stmt->execute([':id' => $showtimeId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function ensureShowtimeIsBookable($showtime) {
        $startTime = isset($showtime['start_time']) ? strtotime((string)$showtime['start_time']) : false;
        if ($startTime === false) {
            throw new Exception('Suất chiếu không hợp lệ');
        }

        if ($startTime <= time()) {
            throw new Exception('Suất chiếu đã qua giờ, không thể đặt vé');
        }
    }

    private function getSeatDetails($seatIds, $hallId) {
        list($placeholders, $params) = $this->buildInClause($seatIds, 'seat');
        $sql =
            "SELECT s.id, s.seat_type_id, st.price_multiplier
             FROM seats s
             JOIN seat_types st ON s.seat_type_id = st.id
             WHERE s.id IN (" . implode(',', $placeholders) . ")
             AND s.cinema_hall_id = :hall_id
             AND s.status = 'Active'";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->bindValue(':hall_id', $hallId, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getByShowtime($showtimeId) {
        $stmt = $this->db->prepare(
            "SELECT b.*, m.title AS movie_title, s.start_time, c.name AS cinema_name, h.name AS hall_name
             FROM bookings b
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             WHERE b.showtime_id = :showtime_id
             ORDER BY b.created_at DESC"
        );
        $stmt->execute([':showtime_id' => $showtimeId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    public function update($bookingId, $seatIds, $concessions = [], $userVoucherId = null) {
        $booking = $this->getById($bookingId);
        if (!$booking) {
            throw new Exception('Booking không tồn tại');
        }
        if ($booking['status'] !== 'Pending') {
            throw new Exception('Chỉ có thể cập nhật booking đang chờ');
        }

        $showtime = $this->getShowtime($booking['showtime_id']);
        if (!$showtime) {
            throw new Exception('Suất chiếu không tồn tại');
        }
        $this->ensureShowtimeIsBookable($showtime);

        $seatIds = array_values(array_unique(array_map('intval', $seatIds)));

        $this->db->beginTransaction();
        try {
            // Validate seats
            $seatDetails = $this->getSeatDetails($seatIds, (int)$showtime['cinema_hall_id']);
            if (count($seatDetails) !== count($seatIds)) {
                throw new Exception('Ghế không hợp lệ hoặc không thuộc phòng chiếu');
            }

            // Check seat availability (exclude seats already held by this booking)
            $unavailableSeats = $this->getUnavailableSeats($booking['showtime_id'], $seatIds);
            $currentSeatIds = $this->getBookingSeatIds($bookingId);
            $trulyUnavailable = array_diff($unavailableSeats, $currentSeatIds);
            if (!empty($trulyUnavailable)) {
                throw new Exception('Một số ghế đã được giữ hoặc đã bán');
            }

            // Recalculate price
            $pricing = $this->calculateTotalPrice($showtime, $seatDetails, $concessions);
            $totalPrice = $pricing['total_price'];

            $voucherDiscount = 0;
            if ($userVoucherId) {
                $voucherDiscount = $this->applyVoucherDiscount($userVoucherId, $booking['user_id'], $totalPrice);
            }
            $membershipDiscount = $this->applyMembershipDiscount($booking['user_id'], $totalPrice);
            $discountAmount = min($voucherDiscount + $membershipDiscount, $totalPrice);
            $finalPrice = $totalPrice - $discountAmount;

            // Update booking record
            $stmt = $this->db->prepare(
                "UPDATE bookings SET total_price = :total_price, discount_amount = :discount_amount, 
                 final_price = :final_price, user_voucher_id = :user_voucher_id
                 WHERE id = :id"
            );
            $stmt->execute([
                ':total_price' => $totalPrice,
                ':discount_amount' => $discountAmount,
                ':final_price' => $finalPrice,
                ':user_voucher_id' => $userVoucherId ?: null,
                ':id' => $bookingId,
            ]);

            // Delete old tickets
            $this->db->prepare("DELETE FROM tickets WHERE booking_id = :booking_id")
                ->execute([':booking_id' => $bookingId]);

            // Create new tickets
            $holdExpiresAt = date('Y-m-d H:i:s', time() + $this->getSeatHoldDuration());
            $ticketStmt = $this->db->prepare(
                "INSERT INTO tickets (booking_id, seat_id, price, ticket_code, status, hold_expires_at)
                 VALUES (:booking_id, :seat_id, :price, :ticket_code, 'HOLDING', :hold_expires_at)"
            );
            $ticketIndex = 1;
            foreach ($pricing['seat_prices'] as $seatId => $price) {
                $ticketCode = $this->generateTicketCode($bookingId, $ticketIndex);
                $ticketStmt->execute([
                    ':booking_id' => $bookingId,
                    ':seat_id' => $seatId,
                    ':price' => $price,
                    ':ticket_code' => $ticketCode,
                    ':hold_expires_at' => $holdExpiresAt,
                ]);
                $ticketIndex++;
            }

            // Delete old concessions and insert new
            $this->db->prepare("DELETE FROM booking_concessions WHERE booking_id = :booking_id")
                ->execute([':booking_id' => $bookingId]);

            if (!empty($pricing['concessions'])) {
                $concessionStmt = $this->db->prepare(
                    "INSERT INTO booking_concessions (booking_id, concession_id, quantity, price)
                     VALUES (:booking_id, :concession_id, :quantity, :price)"
                );
                foreach ($pricing['concessions'] as $item) {
                    $concessionStmt->execute([
                        ':booking_id' => $bookingId,
                        ':concession_id' => $item['id'],
                        ':quantity' => $item['quantity'],
                        ':price' => $item['price'],
                    ]);
                }
            }

            $this->db->commit();

            return [
                'booking_id' => $bookingId,
                'hold_expires_at' => $holdExpiresAt,
                'total_price' => $totalPrice,
                'discount_amount' => $discountAmount,
                'final_price' => $finalPrice,
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function getByUserAndShowtime($userId, $showtimeId) {
        $stmt = $this->db->prepare(
            "SELECT b.*, m.title AS movie_title, s.start_time, c.name AS cinema_name, h.name AS hall_name
             FROM bookings b
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             JOIN cinema_halls h ON s.cinema_hall_id = h.id
             JOIN cinemas c ON h.cinema_id = c.id
             WHERE b.user_id = :user_id AND b.showtime_id = :showtime_id
             ORDER BY b.created_at DESC LIMIT 1"
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':showtime_id' => $showtimeId,
        ]);
        $booking = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$booking) {
            return null;
        }

        // Fetch seats for this booking
        $ticketStmt = $this->db->prepare(
            "SELECT s.id, CONCAT(s.row_code, s.number) AS seat_code, s.row_code AS `row_number`, s.number AS seat_number, st.name AS seat_type, t.price
             FROM tickets t
             JOIN seats s ON t.seat_id = s.id
             JOIN seat_types st ON s.seat_type_id = st.id
             WHERE t.booking_id = :booking_id"
        );
        $ticketStmt->execute([':booking_id' => $booking['id']]);
        $booking['seats'] = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);

        return $booking;
    }

    

    private function getUnavailableSeats($showtimeId, $seatIds) {
        list($placeholders, $params) = $this->buildInClause($seatIds, 'seat');
        $sql =
            "SELECT t.seat_id
             FROM tickets t
             JOIN bookings b ON t.booking_id = b.id
             WHERE b.showtime_id = :showtime_id
             AND t.seat_id IN (" . implode(',', $placeholders) . ")
             AND (
                t.status = 'SOLD'
                OR (t.status = 'HOLDING' AND (t.hold_expires_at IS NULL OR t.hold_expires_at > NOW()))
             )";
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':showtime_id', $showtimeId, PDO::PARAM_INT);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private function normalizeConcessions($concessions) {
        if (!is_array($concessions)) {
            return [];
        }
        $normalized = [];
        foreach ($concessions as $item) {
            if (!is_array($item)) {
                continue;
            }

            $rawId = $item['id'] ?? $item['concession_id'] ?? null;
            if (empty($rawId)) {
                continue;
            }

            $id = (int)$rawId;
            if ($id < 1) {
                continue;
            }

            $quantity = isset($item['quantity']) ? (int)$item['quantity'] : 1;
            if ($quantity < 1) {
                continue;
            }
            if (!isset($normalized[$id])) {
                $normalized[$id] = 0;
            }
            $normalized[$id] += $quantity;
        }
        return $normalized;
    }

    private function getConcessionDetails($concessionItems) {
        $ids = array_keys($concessionItems);
        list($placeholders, $params) = $this->buildInClause($ids, 'concession');
        $sql =
            "SELECT id, name, price, is_available
             FROM concessions
             WHERE id IN (" . implode(',', $placeholders) . ")";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($rows) !== count($ids)) {
            throw new Exception('Bắp nước không hợp lệ');
        }

        $details = [];
        foreach ($rows as $row) {
            if (!(bool)$row['is_available']) {
                throw new Exception('Một số bắp nước đã ngừng bán');
            }
            $id = (int)$row['id'];
            $details[] = [
                'id' => $id,
                'name' => $row['name'],
                'price' => (float)$row['price'],
                'quantity' => $concessionItems[$id],
            ];
        }

        return $details;
    }

    private function getBaseTicketPrice() {
        $stmt = $this->db->prepare("SELECT config_value FROM system_configs WHERE config_key = 'base_ticket_price' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && is_numeric($row['config_value'])) {
            return (float)$row['config_value'];
        }
        return isset(Config::$base_ticket_price) ? (float)Config::$base_ticket_price : 60000;
    }

    private function getSeatHoldDuration() {
        $stmt = $this->db->prepare("SELECT config_value FROM system_configs WHERE config_key = 'seat_hold_duration' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && is_numeric($row['config_value'])) {
            return (int)$row['config_value'];
        }
        return isset(Config::$seat_hold_duration) ? (int)Config::$seat_hold_duration : 300;
    }

    private function getPricingAdjustment($startTime) {
        $stmt = $this->db->prepare(
            "SELECT condition_type, adjustment_amount
             FROM pricing_rules
             WHERE is_active = 1"
        );
        $stmt->execute();
        $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $dateTime = new DateTime($startTime);
        $dayOfWeek = (int)$dateTime->format('N'); // 6=Sat,7=Sun
        $hour = (int)$dateTime->format('H');

        $holidayDates = $this->getHolidayDates();
        $isHoliday = in_array($dateTime->format('Y-m-d'), $holidayDates, true);

        $adjustment = 0;
        foreach ($rules as $rule) {
            switch ($rule['condition_type']) {
                case 'Weekend':
                    if ($dayOfWeek >= 6) {
                        $adjustment += (float)$rule['adjustment_amount'];
                    }
                    break;
                case 'Before10AM':
                    if ($hour < 10) {
                        $adjustment += (float)$rule['adjustment_amount'];
                    }
                    break;
                case 'Holiday':
                    if ($isHoliday) {
                        $adjustment += (float)$rule['adjustment_amount'];
                    }
                    break;
                default:
                    break;
            }
        }

        return $adjustment;
    }

    private function getHolidayDates() {
        if (isset(Config::$holiday_dates) && is_array(Config::$holiday_dates)) {
            return Config::$holiday_dates;
        }
        return [];
    }

    private function generateTicketCode($bookingId, $index) {
        return sprintf('GXY-%06d-%03d', $bookingId, $index);
    }

    private function generateBookingCode() {
        $year = date('Y');

        // Retry to avoid rare collision with the unique index on booking_code.
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $suffix = str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
            $code = sprintf('GXY-%s-%s', $year, $suffix);

            $stmt = $this->db->prepare("SELECT 1 FROM bookings WHERE booking_code = :booking_code LIMIT 1");
            $stmt->execute([':booking_code' => $code]);

            if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                return $code;
            }
        }

        throw new Exception('Không thể tạo mã đặt vé, vui lòng thử lại');
    }

    private function getBookingSeatIds($bookingId) {
        $stmt = $this->db->prepare("SELECT seat_id FROM tickets WHERE booking_id = :booking_id");
        $stmt->execute([':booking_id' => $bookingId]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private function buildInClause($items, $prefix) {
        $placeholders = [];
        $params = [];
        foreach ($items as $i => $value) {
            $key = ':' . $prefix . $i;
            $placeholders[] = $key;
            $params[$key] = $value;
        }
        return [$placeholders, $params];
    }

    /**
     * Tự động hết hạn các booking Pending quá thời gian cho phép.
     * Chuyển booking -> Expired, tickets -> REFUNDED, transactions -> Failed.
     * Trả về số booking đã xử lý.
     *
     * @param int $expireMinutes Số phút tối đa cho trạng thái Pending (mặc định 10)
     * @return int
     */
    public function expireStaleBookings($expireMinutes = 10) {
        $cutoff = date('Y-m-d H:i:s', time() - ($expireMinutes * 60));

        // Tìm các booking Pending đã quá hạn
        $stmt = $this->db->prepare(
            "SELECT id FROM bookings
             WHERE status = 'Pending'
             AND created_at <= :cutoff"
        );
        $stmt->execute([':cutoff' => $cutoff]);
        $staleIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($staleIds)) {
            return 0;
        }

        $count = 0;
        foreach ($staleIds as $bookingId) {
            try {
                $this->db->beginTransaction();

                // Chuyển booking sang Expired
                $update = $this->db->prepare(
                    "UPDATE bookings SET status = 'Expired' WHERE id = :id AND status = 'Pending'"
                );
                $update->execute([':id' => $bookingId]);

                if ($update->rowCount() === 0) {
                    // Đã bị thay đổi bởi process khác
                    $this->db->rollBack();
                    continue;
                }

                // Chuyển tickets HOLDING -> REFUNDED
                $ticketUpdate = $this->db->prepare(
                    "UPDATE tickets SET status = 'REFUNDED', hold_expires_at = NULL
                     WHERE booking_id = :booking_id AND status = 'HOLDING'"
                );
                $ticketUpdate->execute([':booking_id' => $bookingId]);

                // Chuyển transaction Pending -> Failed
                $txUpdate = $this->db->prepare(
                    "UPDATE transactions SET status = 'Failed'
                     WHERE booking_id = :booking_id AND status = 'Pending'"
                );
                $txUpdate->execute([':booking_id' => $bookingId]);

                // Hoàn lại voucher nếu đã dùng
                $voucherStmt = $this->db->prepare(
                    "SELECT user_voucher_id FROM bookings WHERE id = :id"
                );
                $voucherStmt->execute([':id' => $bookingId]);
                $row = $voucherStmt->fetch(PDO::FETCH_ASSOC);
                if (!empty($row['user_voucher_id'])) {
                    $restoreVoucher = $this->db->prepare(
                        "UPDATE user_vouchers SET status = 'ACTIVE', used_at = NULL
                         WHERE id = :id AND status = 'USED'"
                    );
                    $restoreVoucher->execute([':id' => $row['user_voucher_id']]);
                }

                // Hoàn lại tồn kho bắp nước nếu có
                $this->restoreConcessions($bookingId);

                $this->db->commit();
                $count++;
            } catch (Exception $e) {
                $this->db->rollBack();
                error_log("expireStaleBookings error for booking #$bookingId: " . $e->getMessage());
            }
        }

        return $count;
    }
}

<?php

class POSCustomer {
    private $db;

    public function __construct($database) {
        $this->db = $database;
    }

    /**
     * Tìm khách vãng lai theo SĐT, nếu không có thì tạo mới
     * 
     * @param string $phone Số điện thoại
     * @param string $name Tên khách (tuỳ chọn)
     * @param int $staffUserId ID của nhân viên tạo bản ghi
     * @return array Thông tin khách (id, phone, name, guest_customer_code)
     * @throws Exception
     */
    public function lookupOrCreate($phone, $name = null, $staffUserId = null) {
        // Validate phone
        $phone = trim($phone);
        if (!preg_match('/^0\d{9,10}$/', $phone)) {
            throw new Exception('SĐT không hợp lệ. Phải bắt đầu bằng 0, 10-11 chữ số.');
        }

        // Check if exists
        $select = $this->db->prepare(
            "SELECT id, phone, name, guest_customer_code, total_bookings 
             FROM pos_customers 
             WHERE phone = :phone 
             LIMIT 1"
        );
        $select->execute([':phone' => $phone]);
        $existing = $select->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            return $this->attachLinkedUserInfo($existing);  // Trả về khách cũ
        }

        $linkedUser = $this->findRegisteredUserByPhone($phone);

        // Tạo mới
        $guestCode = $this->generateGuestCustomerCode($phone);
        $name = trim($name ?? '');  // Empty string if null
        if ($name === '' && $linkedUser && !empty($linkedUser['full_name'])) {
            $name = (string)$linkedUser['full_name'];
        }

        $insert = $this->db->prepare(
            "INSERT INTO pos_customers (phone, name, guest_customer_code, created_by_staff_id)
             VALUES (:phone, :name, :guest_code, :staff_id)"
        );
        $insert->execute([
            ':phone' => $phone,
            ':name' => $name,
            ':guest_code' => $guestCode,
            ':staff_id' => $staffUserId
        ]);

        $customerId = (int)$this->db->lastInsertId();

        return $this->attachLinkedUserInfo([
            'id' => $customerId,
            'phone' => $phone,
            'name' => $name,
            'guest_customer_code' => $guestCode,
            'total_bookings' => 0
        ]);
    }

    /**
     * Lấy thông tin khách vãng lai theo ID
     */
    public function getById($id) {
        $stmt = $this->db->prepare(
            "SELECT * FROM pos_customers WHERE id = :id LIMIT 1"
        );
        $stmt->execute([':id' => (int)$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return $this->attachLinkedUserInfo($row);
    }

    /**
     * Tìm khách vãng lai theo SĐT
     */
    public function getByPhone($phone) {
        $stmt = $this->db->prepare(
            "SELECT * FROM pos_customers WHERE phone = :phone LIMIT 1"
        );
        $stmt->execute([':phone' => trim($phone)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return $this->attachLinkedUserInfo($row);
    }

    private function findRegisteredUserByPhone(string $phone): ?array {
        $cleanPhone = preg_replace('/\D/', '', $phone);
        $stmt = $this->db->prepare(
            "SELECT u.id AS user_id, u.email, up.full_name, up.phone
             FROM user_profiles up
             INNER JOIN users u ON u.id = up.user_id
             WHERE (up.phone = :phone 
                OR REPLACE(REPLACE(REPLACE(up.phone, ' ', ''), '.', ''), '-', '') = :clean_phone)
               AND u.status = 'Active'
             LIMIT 1"
        );
        $stmt->execute([':phone' => $phone, ':clean_phone' => $cleanPhone]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function attachLinkedUserInfo(array $customer): array {
        $phone = trim((string)($customer['phone'] ?? ''));
        $linkedUser = $phone !== '' ? $this->findRegisteredUserByPhone($phone) : null;

        $customer['has_account'] = $linkedUser ? true : false;
        $customer['linked_user_id'] = $linkedUser ? (int)$linkedUser['user_id'] : null;
        $customer['linked_user_email'] = $linkedUser['email'] ?? null;
        $customer['linked_user_full_name'] = $linkedUser['full_name'] ?? null;

        return $customer;
    }

    /**
     * Cập nhật số lần mua vé khi có booking mới
     */
    public function incrementTotalBookings($customerId) {
        $update = $this->db->prepare(
            "UPDATE pos_customers SET total_bookings = total_bookings + 1 WHERE id = :id"
        );
        return $update->execute([':id' => (int)$customerId]);
    }

    /**
     * Tạo mã khách vãng lai dạng: GUEST-20260324143022-0908765432-A1B2C3
     */
    private function generateGuestCustomerCode($phone) {
        $timestamp = date('YmdHis');
        $phoneLast4 = substr($phone, -4);
        $random = strtoupper(substr(md5(uniqid((string)$phone, true)), 0, 6));
        return "GUEST-{$timestamp}-{$phoneLast4}-{$random}";
    }

    /**
     * Lấy thống kê khách vãng lai (tuỳ chọn)
     */
    public function getStats() {
        $stmt = $this->db->query(
            "SELECT COUNT(*) as total_customers, 
                    SUM(total_bookings) as total_pos_bookings,
                    MAX(first_visit_date) as latest_visit
             FROM pos_customers"
        );
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Lấy lịch sử booking của khách vãng lai
     */
    public function getBookingHistory($customerId, $limit = 20) {
        $limit = max(1, min((int)$limit, 100));

        $sql = "SELECT
                    b.id,
                    b.booking_code,
                    b.status,
                    b.final_price,
                    b.created_at,
                    s.start_time,
                    m.title AS movie_title,
                    c.name AS cinema_name,
                    h.name AS hall_name,
                    tx.status AS payment_status,
                    GROUP_CONCAT(CONCAT(se.row_code, se.number) ORDER BY se.row_code, se.number SEPARATOR ', ') AS seats
                FROM bookings b
                JOIN showtimes s ON b.showtime_id = s.id
                JOIN movies m ON s.movie_id = m.id
                JOIN cinema_halls h ON s.cinema_hall_id = h.id
                JOIN cinemas c ON h.cinema_id = c.id
                LEFT JOIN tickets t ON t.booking_id = b.id
                LEFT JOIN seats se ON se.id = t.seat_id
                LEFT JOIN (
                    SELECT t1.booking_id, t1.status
                    FROM transactions t1
                    INNER JOIN (
                        SELECT booking_id, MAX(id) AS max_id
                        FROM transactions
                        GROUP BY booking_id
                    ) latest ON latest.max_id = t1.id
                ) tx ON tx.booking_id = b.id
                WHERE b.guest_customer_id = :customer_id
                GROUP BY
                    b.id, b.booking_code, b.status, b.final_price, b.created_at,
                    s.start_time, m.title, c.name, h.name, tx.status
                ORDER BY b.created_at DESC
                LIMIT :limit";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':customer_id', (int)$customerId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

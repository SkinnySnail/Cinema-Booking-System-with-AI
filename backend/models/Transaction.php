<?php
/**
 * Transaction Model
 */
class Transaction {
    private $db;

    public function __construct($db) {
        $this->db=$db;
    }

    public function create($bookingId, $method, $amount) {
        $transactionCode = $this->generateTransactionCode($method, $bookingId);

        $stmt = $this->db->prepare(
            "INSERT INTO transactions (booking_id, payment_method, amount, transaction_code, status)
             VALUES (:booking_id, :payment_method, :amount, :transaction_code, 'Pending')"
        );
        $stmt->execute([
            ':booking_id' => $bookingId,
            ':payment_method' => $method,
            ':amount' => $amount,
            ':transaction_code' => $transactionCode,
        ]);

        return [
            'id' => (int)$this->db->lastInsertId(),
            'transaction_code' => $transactionCode,
            'status' => 'Pending',
        ];
    }

    public function getByBooking($bookingId) {
        $stmt = $this->db->prepare(
            "SELECT * FROM transactions WHERE booking_id = :booking_id ORDER BY created_at DESC LIMIT 1"
        );
        $stmt->execute([':booking_id' => $bookingId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateStatus($transactionCode, $status) {
        $stmt = $this->db->prepare(
            "UPDATE transactions SET status = :status WHERE transaction_code = :transaction_code"
        );
        return $stmt->execute([
            ':status' => $status,
            ':transaction_code' => $transactionCode,
        ]);
    }

    public function getByUser($userId, $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $stmt = $this->db->prepare(
            "SELECT t.*, b.user_id, m.title AS movie_title, s.start_time
             FROM transactions t
             JOIN bookings b ON t.booking_id = b.id
             JOIN showtimes s ON b.showtime_id = s.id
             JOIN movies m ON s.movie_id = m.id
             WHERE b.user_id = :user_id
             ORDER BY t.created_at DESC
             LIMIT :limit OFFSET :offset"
        );
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByUser($userId) {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS total FROM transactions t
             JOIN bookings b ON t.booking_id = b.id
             WHERE b.user_id = :user_id"
        );
        $stmt->execute([':user_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)$row['total'];
    }

    public function getByTransactionCode($transactionCode) {
        $stmt = $this->db->prepare("SELECT * FROM transactions WHERE transaction_code = :transaction_code");
        $stmt->execute([':transaction_code' => $transactionCode]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateTransactionCode($oldCode, $newCode) {
        $stmt = $this->db->prepare(
            "UPDATE transactions SET transaction_code = :new_code WHERE transaction_code = :old_code"
        );
        return $stmt->execute([
            ':new_code' => $newCode,
            ':old_code' => $oldCode,
        ]);
    }

    /**
     * Gắn lại giao dịch Pending với lần thanh toán mới: mã mới, cổng và số tiền hiện tại của đơn.
     */
    public function renewPending($oldCode, $newCode, $method, $amount) {
        $stmt = $this->db->prepare(
            "UPDATE transactions
             SET transaction_code = :new_code, payment_method = :method, amount = :amount
             WHERE transaction_code = :old_code AND status = 'Pending'"
        );
        return $stmt->execute([
            ':new_code' => $newCode,
            ':method' => $method,
            ':amount' => $amount,
            ':old_code' => $oldCode,
        ]);
    }

    private function generateTransactionCode($method, $bookingId) {
        $prefix = strtoupper(preg_replace('/\s+/', '', $method));
        $random = strtoupper(substr(md5(uniqid((string)$bookingId, true)), 0, 6));
        return $prefix . '-' . date('YmdHis') . '-' . $bookingId . '-' . $random;
    }

    /**
     * Đổi phương thức thanh toán của giao dịch (VD: user chuyển từ VNPay sang tiền mặt).
     */
    public function updatePaymentMethod($transactionId, $method) {
        $stmt = $this->db->prepare(
            "UPDATE transactions SET payment_method = :payment_method, updated_at = NOW() WHERE id = :id"
        );
        return $stmt->execute([
            ':payment_method' => $method,
            ':id' => (int)$transactionId,
        ]);
    }

    /**
     * Ghi lại số tiền khách thực tế đưa (tiền mặt). Mặc định bằng số tiền đơn hàng.
     */
    public function updateReceivedAmount($transactionId, $receivedAmount) {
        $stmt = $this->db->prepare(
            "UPDATE transactions SET received_amount = :received_amount, updated_at = NOW() WHERE id = :id"
        );
        return $stmt->execute([
            ':received_amount' => (float)$receivedAmount,
            ':id' => (int)$transactionId,
        ]);
    }
}

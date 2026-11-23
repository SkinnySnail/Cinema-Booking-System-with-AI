<?php
/**
 * Transaction Service
 */
class TransactionService
{
    private $transactionModel;
    private $bookingModel;

    public function __construct($db)
    {
        $this->transactionModel = new Transaction($db);
        $this->bookingModel = new Booking($db);
    }

    public function getBookingById($bookingId)
    {
        return $this->bookingModel->getById((int) $bookingId);
    }

    public function getTransactionByBooking($bookingId)
    {
        return $this->transactionModel->getByBooking((int) $bookingId);
    }

    public function createTransactionForBooking($booking, $method, $amount)
    {
        if ($booking['status'] !== 'Pending') {
            throw new Exception('Booking is not in pending status', 400);
        }

        $existing = $this->transactionModel->getByBooking((int) $booking['id']);
        if ($existing && $existing['status'] === 'Success') {
            throw new Exception('Booking already paid', 400);
        }

        return $this->transactionModel->create((int) $booking['id'], $method, (float) $amount);
    }

    public function getHistory($userId, $page, $limit)
    {
        $transactions = $this->transactionModel->getByUser((int) $userId, $page, $limit);
        $total = $this->transactionModel->countByUser((int) $userId);

        return [$transactions, $total];
    }

    public function processGatewayVerification($gateway, $data)
    {
        if ($gateway !== 'Momo' && $gateway !== 'VNPay') {
            throw new Exception('Unsupported gateway for verification', 400);
        }

        if ($gateway === 'Momo' && !PaymentService::verifyMomoPayment($data)) {
            error_log('MoMo verify failed. Keys=' . implode(',', array_keys((array)$data)) . ' orderId=' . (string)($data['orderId'] ?? ''));
            throw new Exception('MoMo signature verification failed', 400);
        }

        if ($gateway === 'VNPay' && !PaymentService::verifyVNPayPayment($data)) {
            throw new Exception('VNPay signature verification failed', 400);
        }

        $transactionCode = $data['transaction_code']
            ?? $data['orderId']
            ?? $data['vnp_TxnRef']
            ?? null;

        if (!$transactionCode) {
            throw new Exception('Transaction code is required for verification', 422);
        }

        $transaction = $this->transactionModel->getByTransactionCode($transactionCode);
        if (!$transaction) {
            throw new Exception('Transaction not found', 404);
        }

        // Idempotent: cổng thanh toán gọi cả return URL lẫn IPN cho cùng một giao dịch.
        // Chỉ xử lý giao dịch đang Pending để không xác nhận/hủy đơn hai lần (cộng điểm, hoàn tồn kho...).
        if (($transaction['status'] ?? '') !== 'Pending') {
            return [
                'transaction_code' => $transaction['transaction_code'],
                'booking_id' => (int) $transaction['booking_id'],
                'status' => $transaction['status'],
                'gateway' => $gateway,
                'already_processed' => true,
            ];
        }

        // Số tiền cổng báo về phải khớp giao dịch (MoMo: VND, VNPay: VND × 100).
        $expectedAmount = (int) round((float) ($transaction['amount'] ?? 0));
        $reportedAmount = $gateway === 'VNPay'
            ? (isset($data['vnp_Amount']) ? (int) $data['vnp_Amount'] / 100 : null)
            : (isset($data['amount']) ? (int) $data['amount'] : null);
        if ($reportedAmount !== null && (int) round($reportedAmount) !== $expectedAmount) {
            throw new Exception('Payment amount does not match the transaction', 400);
        }

        $status = $data['status'] ?? $data['resultCode'] ?? $data['vnp_ResponseCode'] ?? null;
        $isSuccess = $this->isSuccessStatus($gateway, $status);
        $newStatus = $isSuccess ? 'Success' : 'Failed';

        $this->transactionModel->updateStatus($transaction['transaction_code'], $newStatus);

        if ($isSuccess) {
            $this->bookingModel->confirm((int) $transaction['booking_id']);
        } else {
            // Thanh toán thất bại -> tự động hủy booking, hoàn trả tồn kho bắp nước, ghế và voucher
            try {
                $this->bookingModel->cancel((int) $transaction['booking_id']);
            } catch (Exception $e) {
                error_log("Failed to cancel booking after payment failed: " . $e->getMessage());
            }
        }

        // Notify frontend in realtime. Any push failure must not break payment verification.
        PusherService::triggerPaymentStatus(
            (int) $transaction['booking_id'],
            $transaction['transaction_code'],
            $newStatus,
            $gateway
        );

        return [
            'transaction_code' => $transaction['transaction_code'],
            'booking_id' => (int) $transaction['booking_id'],
            'status' => $newStatus,
            'gateway' => $gateway,
        ];
    }

    /**
     * Xử lý IPN của VNPay và trả mã phản hồi theo đặc tả VNPay:
     * 00 thành công, 01 không tìm thấy đơn, 02 đơn đã được xác nhận, 04 sai số tiền,
     * 97 sai chữ ký, 99 lỗi khác.
     * @return array{RspCode: string, Message: string}
     */
    public function processVNPayIpn(array $data)
    {
        if (!PaymentService::verifyVNPayPayment($data)) {
            return ['RspCode' => '97', 'Message' => 'Invalid signature'];
        }

        $transactionCode = $data['vnp_TxnRef'] ?? '';
        $transaction = $transactionCode !== '' ? $this->transactionModel->getByTransactionCode($transactionCode) : null;
        if (!$transaction) {
            return ['RspCode' => '01', 'Message' => 'Order not found'];
        }

        // vnp_Amount = số tiền × 100 (đơn vị nhỏ nhất)
        $expected = (int) round(((float) ($transaction['amount'] ?? 0)) * 100);
        if ((int) ($data['vnp_Amount'] ?? -1) !== $expected) {
            return ['RspCode' => '04', 'Message' => 'Invalid amount'];
        }

        if (($transaction['status'] ?? '') !== 'Pending') {
            return ['RspCode' => '02', 'Message' => 'Order already confirmed'];
        }

        $this->processGatewayVerification('VNPay', $data);
        return ['RspCode' => '00', 'Message' => 'Confirm Success'];
    }

    /**
     * Xác nhận thủ công giao dịch (dùng cho VietQR demo flow).
     * Bỏ qua chữ ký cổng thanh toán — chỉ dùng trong môi trường sandbox/demo.
     */
    public function manualConfirmTransaction($transactionCode)
    {
        $transaction = $this->transactionModel->getByTransactionCode($transactionCode);
        if (!$transaction) {
            throw new Exception('Transaction not found', 404);
        }

        if ($transaction['status'] === 'Success') {
            // Đã thành công rồi, trả về luôn
            return [
                'transaction_code' => $transaction['transaction_code'],
                'booking_id' => (int) $transaction['booking_id'],
                'status' => 'Success',
                'gateway' => $transaction['payment_method'] ?? 'VNPay',
            ];
        }

        $this->transactionModel->updateStatus($transaction['transaction_code'], 'Success');
        $this->bookingModel->confirm((int) $transaction['booking_id']);

        PusherService::triggerPaymentStatus(
            (int) $transaction['booking_id'],
            $transaction['transaction_code'],
            'Success',
            $transaction['payment_method'] ?? 'VNPay'
        );

        return [
            'transaction_code' => $transaction['transaction_code'],
            'booking_id' => (int) $transaction['booking_id'],
            'status' => 'Success',
            'gateway' => $transaction['payment_method'] ?? 'VNPay',
        ];
    }

    public function createPaymentForBooking($gateway, $booking, $options = [])
    {
        if ($booking['status'] !== 'Pending') {
            throw new Exception('Booking is not in pending status', 400);
        }

        $amount = $this->resolveBookingAmount($booking);
        if ($amount <= 0) {
            throw new Exception('Invalid booking amount', 400);
        }

        $transaction = $this->transactionModel->getByBooking((int) $booking['id']);
        if ($transaction && $transaction['status'] === 'Success') {
            throw new Exception('Booking already paid', 400);
        }

        if (!$transaction || $transaction['status'] === 'Failed') {
            $transaction = $this->transactionModel->create((int) $booking['id'], $gateway, $amount);
        } else {
            // Transaction already Pending — generate a fresh transaction_code so VNPAY
            // receives a new vnp_TxnRef and doesn't reject it as a duplicate.
            $prefix = strtoupper(preg_replace('/\s+/', '', $gateway));
            $newCode = $prefix . '-' . date('ymdHis') . '-' . substr(uniqid(), -6);
            // Cập nhật cả cổng và số tiền: đơn có thể đã đổi ghế/voucher hoặc đổi từ MoMo sang VNPay.
            $this->transactionModel->renewPending($transaction['transaction_code'], $newCode, $gateway, $amount);
            $transaction['transaction_code'] = $newCode;
            $transaction['amount'] = $amount;
        }

        $payload = $this->buildPaymentPayload(
            $gateway,
            (int) $booking['id'],
            $transaction['transaction_code'],
            $amount,
            $options
        );

        if ($gateway === 'Momo') {
            $momoPayment = PaymentService::createMoMoPayment(
                $payload['amount'],
                $payload['orderId'],
                $payload['orderInfo'],
                $payload['returnUrl'],
                $payload['notifyUrl']
            );

            // Refresh transaction details (include updated fields)
            $transaction = $this->transactionModel->getByBooking((int) $booking['id']);

            $response = ['transaction' => $transaction];
            if (!empty($momoPayment['pay_url'])) {
                $response['pay_url'] = $momoPayment['pay_url'];
            }
            if (!empty($momoPayment['qr_code_url'])) {
                $response['qr_code_url'] = $momoPayment['qr_code_url'];
            }

            return $response;
        }

        if ($gateway === 'VNPay' || $gateway === 'Visa') {
            $bankCode = ($gateway === 'Visa') ? 'VNBANK' : '';

            $payUrl = PaymentService::createVNPayPayment(
                $payload['amount'],
                $payload['orderId'],
                $payload['orderInfo'],
                $payload['returnUrl'],
                $payload['notifyUrl'] ?? null,
                $bankCode
            );

            // Refresh transaction details (include updated fields)
            $transaction = $this->transactionModel->getByBooking((int) $booking['id']);

            return [
                'transaction' => $transaction,
                'pay_url' => $payUrl,
            ];
        }

        throw new Exception('Unsupported payment gateway', 400);
    }

    /**
     * Thanh toán tiền mặt tại quầy.
     *
     * Không cần cổng thanh toán online nên hoạt động ổn định ngay cả khi
     * VNPay/MoMo sandbox bị lỗi (TmnCode bị vô hiệu hoá, mạng chặn, ...).
     * Giao dịch được ghi nhận thành công ngay và booking được confirm luôn:
     * vé -> SOLD, voucher -> USED, cộng điểm thành viên.
     */
    public function createCashPaymentForBooking($booking, $options = [])
    {
        if ($booking['status'] !== 'Pending') {
            throw new Exception('Booking is not in pending status', 400);
        }

        $amount = $this->resolveBookingAmount($booking);
        if ($amount <= 0) {
            throw new Exception('Invalid booking amount', 400);
        }

        $existing = $this->transactionModel->getByBooking((int) $booking['id']);
        if ($existing && $existing['status'] === 'Success') {
            throw new Exception('Booking already paid', 400);
        }

        $bookingId = (int) $booking['id'];

        if ($existing) {
            // Tái sử dụng transaction Pending (VD: user chuyển từ VNPay sang tiền mặt)
            $this->transactionModel->updateTransactionCode(
                $existing['transaction_code'],
                $this->generateCashTransactionCode($bookingId)
            );
            $this->transactionModel->updatePaymentMethod($existing['id'], 'Cash');
            $transaction = $this->transactionModel->getByBooking($bookingId);
        } else {
            $this->transactionModel->create($bookingId, 'Cash', $amount);
            $transaction = $this->transactionModel->getByBooking($bookingId);
        }

        // Đánh dấu giao dịch thành công rồi confirm booking
        $this->transactionModel->updateStatus($transaction['transaction_code'], 'Success');
        $this->bookingModel->confirm($bookingId);

        // Lưu số tiền khách thực trả nếu có (VD: khách trả thừa, cần ghi lại số tiền thực nhận)
        $received = isset($options['received_amount']) ? (float) $options['received_amount'] : null;
        if ($received !== null && $received > 0) {
            $this->transactionModel->updateReceivedAmount($transaction['id'], $received);
        }

        $transaction = $this->transactionModel->getByBooking($bookingId);

        // Notify frontend in realtime. Push failure must not break the cash payment.
        try {
            PusherService::triggerPaymentStatus(
                $bookingId,
                $transaction['transaction_code'],
                'Success',
                'Cash'
            );
        } catch (Exception $e) {
            error_log('Pusher notify failed for cash payment: ' . $e->getMessage());
        }

        return [
            'transaction' => $transaction,
            'transaction_code' => $transaction['transaction_code'],
            'booking_id' => $bookingId,
            'status' => 'Success',
            'gateway' => 'Cash',
            'amount' => $amount,
        ];
    }

    private function generateCashTransactionCode($bookingId)
    {
        return 'CASH-' . date('YmdHis') . '-' . (int)$bookingId . '-' . strtoupper(substr(md5(uniqid((string)$bookingId, true)), 0, 6));
    }

    private function isSuccessStatus($gateway, $status)
    {
        if ($gateway === 'Momo') {
            if ($status === 0 || $status === '0') {
                return true;
            }
        }
        if ($gateway === 'VNPay') {
            if ($status === '00') {
                return true;
            }
        }
        if (is_string($status)) {
            $normalized = strtolower(trim($status));
            return in_array($normalized, ['success', 'succeeded', 'paid', 'ok'], true);
        }
        return false;
    }

    private function buildPaymentPayload($gateway, $bookingId, $transactionCode, $amount, $options = [])
    {
        $baseUrl = $this->getBaseUrl();

        if ($gateway === 'Momo') {
            $isPos = !empty($options['is_pos']);
            $notifyUrl = getenv('MOMO_NOTIFY_URL') ?: ($baseUrl . '/index.php/api/transactions/momo/verify');
            // POS QR flow should not redirect customer phone to localhost/front-end dev URL.
            if ($isPos) {
                $returnUrl = getenv('MOMO_POS_RETURN_URL') ?: 'https://momo.vn/';
            } else {
                // Quay về backend để xác minh chữ ký + xác nhận đơn, sau đó backend chuyển sang
                // FRONTEND_URL/booking/success|failed (giống VNPay).
                $returnUrl = getenv('MOMO_RETURN_URL') ?: ($baseUrl . '/index.php/api/transactions/momo/verify');
            }
            return [
                'amount' => $amount,
                'orderId' => $transactionCode,
                'orderInfo' => 'Payment_for_booking_' . $bookingId,
                'returnUrl' => $returnUrl,
                'notifyUrl' => $notifyUrl,
            ];
        }

        if ($gateway === 'VNPay' || $gateway === 'Visa') {
            $frontendUrl = getenv('APP_URL') ?: $baseUrl;
            // Ensure VNPay redirects back to the backend verify endpoint via index.php for built-in server compatibility
            $returnUrl = $baseUrl . '/index.php/api/transactions/vnpay/verify';
            $notifyUrl = getenv('VNPAY_NOTIFY_URL') ?: ($baseUrl . '/index.php/api/transactions/vnpay/ipn');

            return [
                'amount' => $amount,
                'orderId' => $transactionCode,
                'orderInfo' => 'Payment_for_booking_' . $bookingId,
                'returnUrl' => $returnUrl,
                'notifyUrl' => $notifyUrl,
            ];
        }

        return [];
    }

    private function getBaseUrl()
    {
        $appUrl = getenv('APP_URL');
        if (!empty($appUrl)) {
            return rtrim($appUrl, '/');
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
        return $scheme . '://' . $host;
    }

    private function resolveBookingAmount($booking)
    {
        $final = isset($booking['final_price']) ? (float) $booking['final_price'] : 0.0;
        if ($final > 0) {
            return $final;
        }

        $total = isset($booking['total_price']) ? (float) $booking['total_price'] : 0.0;
        return $total;
    }
}

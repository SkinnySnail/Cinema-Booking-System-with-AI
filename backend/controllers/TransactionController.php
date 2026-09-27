<?php
/**
 * Transaction Controller
 */
class TransactionController extends BaseController
{
    private $db;
    private $transactionService;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->transactionService = new TransactionService($this->db);
    }

    public function create()
    {
        AuthMiddleware::requirePermission('transactions.process');

        $data = self::getRequestData();
        $bookingId = $data['booking_id'] ?? null;
        $method = $data['payment_method'] ?? null;
        $amount = $data['amount'] ?? null;

        if (!$bookingId || !$method || $amount === null) {
            Response::validationError([
                'booking_id' => 'Booking id is required',
                'payment_method' => 'Payment method is required',
                'amount' => 'Amount is required',
            ]);
        }

        $booking = $this->transactionService->getBookingById((int) $bookingId);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        $this->authorizeBookingAccess($booking);

        try {
            $result = $this->transactionService->createTransactionForBooking($booking, $method, (float) $amount);
            Response::created($result, 'Transaction created');
        } catch (Exception $e) {
            Response::error($e->getMessage(), $e->getCode() ?: 400);
        }
    }

    public function getByBooking($bookingId)
    {
        AuthMiddleware::requirePermission('transactions.view_own');

        $booking = $this->transactionService->getBookingById((int) $bookingId);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        $this->authorizeBookingAccess($booking);

        $transaction = $this->transactionService->getTransactionByBooking((int) $bookingId);
        if (!$transaction) {
            Response::notFound('Transaction not found');
        }

        Response::success($transaction);
    }

    public function verifyMomo()
    {
        $data = array_merge($_GET, self::getRequestData());

        try {
            $result = $this->transactionService->processGatewayVerification('Momo', $data);
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                http_response_code(204);
                exit;
            }
            Response::success($result, 'Momo verification processed');
        } catch (Exception $e) {
            error_log('MoMo verify error: ' . $e->getMessage());
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                http_response_code(400);
                echo json_encode(['message' => $e->getMessage()]);
                exit;
            }
            Response::error($e->getMessage(), $e->getCode() ?: 400);
        }
    }

    public function verifyVNPay()
    {
        $data = array_merge($_GET, self::getRequestData());

        $isGet = (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET');

        try {
            $result = $this->transactionService->processGatewayVerification('VNPay', $data);

            if ($isGet) {
                $frontendUrl = getenv('FRONTEND_URL') ?: 'http://localhost:8080';
                $transactionCode = $result['transaction_code'] ?? ($data['vnp_TxnRef'] ?? null);
                $status = $result['status'] ?? 'Failed';
                $bookingId = $result['booking_id'] ?? null;

                $isPos = false;
                if ($bookingId) {
                    $booking = $this->transactionService->getBookingById((int)$bookingId);
                    if ($booking && !empty($booking['guest_customer_id'])) {
                        $isPos = true;
                    }
                }

                // Nếu giao dịch thất bại (user hủy, quay lại, lỗi), redirect sang trang thất bại
                if ($status !== 'Success') {
                    $returnUrl = $frontendUrl . '/booking/failed';
                    $params = ['status' => 'Failed', 'gateway' => 'VNPay'];
                    if ($isPos) {
                        $params['is_pos'] = '1';
                    }
                    if ($transactionCode) {
                        $params['transaction_code'] = $transactionCode;
                    }
                    $location = $returnUrl . '?' . http_build_query($params);
                    header('Location: ' . $location);
                    exit;
                }

                // Giao dịch thành công — redirect sang trang thành công
                $returnUrl = $frontendUrl . '/booking/success';
                $params = [
                    'transaction_code' => $transactionCode,
                    'status' => $status,
                    'gateway' => 'VNPay'
                ];
                if ($isPos) {
                    $params['is_pos'] = '1';
                }
                if ($bookingId) {
                    $params['booking_id'] = $bookingId;
                }
                if (!empty($data['vnp_ResponseCode'])) {
                    $params['vnp_ResponseCode'] = $data['vnp_ResponseCode'];
                }

                $location = $returnUrl . '?' . http_build_query($params);
                header('Location: ' . $location);
                exit;
            }

            Response::success($result, 'VNPay verification processed');
        } catch (Exception $e) {
            if ($isGet) {
                // Redirect user to the frontend booking failed page on failure
                $frontendUrl = getenv('FRONTEND_URL') ?: 'http://localhost:8080';
                $returnUrl = $frontendUrl . '/booking/failed';
                $params = ['status' => 'Failed', 'gateway' => 'VNPay'];
                $txnRef = $data['vnp_TxnRef'] ?? null;
                if ($txnRef) {
                    try {
                        $stmt = $this->db->prepare("SELECT b.guest_customer_id FROM transactions t JOIN bookings b ON b.id = t.booking_id WHERE t.transaction_code = :code LIMIT 1");
                        $stmt->execute([':code' => $txnRef]);
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        if ($row && !empty($row['guest_customer_id'])) {
                            $params['is_pos'] = '1';
                        }
                    } catch (Exception $ex) {
                        // ignore
                    }
                }
                $location = $returnUrl . '?' . http_build_query($params);
                header('Location: ' . $location);
                exit;
            }

            Response::error($e->getMessage(), $e->getCode() ?: 400);
        }
    }

    // IPN endpoint for VNPay (server-to-server callback). This should return plain '00' on success.
    public function verifyVNPayIpn()
    {
        $data = array_merge($_GET, self::getRequestData());

        try {
            $result = $this->transactionService->processGatewayVerification('VNPay', $data);
            header('Content-Type: text/plain');
            echo '00';
            exit;
        } catch (Exception $e) {
            header('Content-Type: text/plain');
            echo '01';
            exit;
        }
    }

    public function getHistory($userId)
    {
        AuthMiddleware::requirePermission('transactions.view_own');

        self::authorizeUserId((int) $userId);

        $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : Config::$items_per_page;

        list($transactions, $total) = $this->transactionService->getHistory((int) $userId, $page, $limit);

        Response::paginated($transactions, $total, $page, $limit);
    }

    private function verifyGateway($gateway)
    {
        $data = array_merge($_GET, self::getRequestData());

        try {
            $result = $this->transactionService->processGatewayVerification($gateway, $data);
            Response::success($result, $gateway . ' verification processed');
        } catch (Exception $e) {
            Response::error($e->getMessage(), $e->getCode() ?: 400);
        }
    }

    public function createMoMoPayment()
    {
        $this->createPayment('Momo');
    }

    public function createVNPayPayment()
    {
        $this->createPayment('VNPay');
    }

    public function createVisaPayment()
    {
        $this->createPayment('Visa');
    }

    private function createPayment($gateway)
    {
        AuthMiddleware::requirePermission('transactions.process');

        $data = self::getRequestData();
        $bookingId = $data['booking_id'] ?? null;
        $isPos = !empty($data['is_pos']);
        $gatewayResponse = null;

        if (!$bookingId) {
            Response::validationError([
                'booking_id' => 'Booking id is required',
            ]);
        }

        $booking = $this->transactionService->getBookingById((int) $bookingId);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        $this->authorizeBookingAccess($booking);

        try {
            // Amount is resolved server-side from booking final price.
            // Visa gateway reuses VNPay infrastructure (same sandbox, separate endpoint).
            $gatewayResponse = $this->transactionService->createPaymentForBooking($gateway, $booking, [
                'is_pos' => $isPos,
            ]);

            // Ensure VNPay/Visa returns a `pay_url` for frontend redirect. If service didn't provide it,
            // generate one from current transaction data and config.
            if ($gateway === 'VNPay' || $gateway === 'Visa') {
                $hasPayUrl = is_array($gatewayResponse) && !empty($gatewayResponse['pay_url']);
                if (!$hasPayUrl) {
                    $tx = $this->transactionService->getTransactionByBooking((int) $booking['id']);
                    $amount = isset($tx['amount']) ? (float) $tx['amount'] : ($booking['total_price'] ?? 0.0);
                    $orderId = isset($tx['transaction_code']) ? $tx['transaction_code'] : uniqid('vnp_');
                    $orderInfo = 'Thanh toan don hang so ' . $booking['id'];

                    $appUrl = getenv('APP_URL');
                    if (empty($appUrl)) {
                        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                        $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
                        $appUrl = $scheme . '://' . $host;
                    } else {
                        $appUrl = rtrim($appUrl, '/');
                    }

                    $returnUrl = $appUrl . '/index.php/api/transactions/vnpay/verify';
                    $notifyUrl = getenv('VNPAY_NOTIFY_URL') ?: ($appUrl . '/index.php/api/transactions/vnpay/ipn');

                    $bankCode = ($gateway === 'Visa') ? 'INTCARD' : '';
                    $payUrl = PaymentService::createVNPayPayment(
                        $amount,
                        $orderId,
                        $orderInfo,
                        $returnUrl,
                        $notifyUrl,
                        $bankCode
                    );

                    if (is_array($gatewayResponse)) {
                        $gatewayResponse['pay_url'] = $payUrl;
                    } else {
                        $gatewayResponse = [
                            'transaction' => $tx,
                            'pay_url' => $payUrl,
                        ];
                    }
                }
            }

            // Normalize response: if service returned ['transaction'=>..., 'pay_url'=>...],
            // flatten so frontend can access pay_url directly under data.
            $responseData = $gatewayResponse;
            if (is_array($gatewayResponse) && array_key_exists('transaction', $gatewayResponse)) {
                $responseData = $gatewayResponse['transaction'];
                if (!empty($gatewayResponse['pay_url'])) {
                    $responseData['pay_url'] = $gatewayResponse['pay_url'];
                }
                if (!empty($gatewayResponse['qr_code_url'])) {
                    $responseData['qr_code_url'] = $gatewayResponse['qr_code_url'];
                }
            }

            Response::success($responseData, $gateway . ' payment created');
        } catch (Exception $e) {
            Response::error($e->getMessage(), $e->getCode() ?: 400);
        }
    }


    private function authorizeBookingAccess($booking)
    {
        $authUserId = (int) ($_REQUEST['auth_user_id'] ?? 0);
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);

        if ($authRole === 'Admin' || $authRoleId === 5 || $authRole === 'Manager' || $authRoleId === 4 || $authRole === 'Staff' || $authRoleId === 3) {
            return;
        }

        if ($authUserId !== (int) $booking['user_id']) {
            Response::forbidden('Insufficient permissions');
        }
    }
}

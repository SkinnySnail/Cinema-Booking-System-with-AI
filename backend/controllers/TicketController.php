<?php

/**
 * Ticket Controller - Quản lý vé xem phim
 */
require_once __DIR__ . '/../models/Ticket.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

class TicketController
{
    private $ticketModel;

    public function __construct()
    {
        $this->ticketModel = new Ticket();
    }

    /**
     * Helper: Extract user info from ticket data
     */
    private function extractUserInfo($ticketData)
    {
        return [
            'user_id' => $ticketData['user_id'] ?? null,
            'user_email' => $ticketData['user_email'] ?? null,
            'user_full_name' => $ticketData['user_full_name'] ?? null,
            'user_phone' => $ticketData['user_phone'] ?? null,
            'user_avatar' => $ticketData['user_avatar'] ?? null,
        ];
    }

    /**
     * Helper: Get cinema_id assigned to the current staff user
     * Returns null if not a staff or not assigned
     */
    private function getStaffCinemaId()
    {
        $staffUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
        if ($staffUserId <= 0) {
            return null;
        }

        try {
            require_once __DIR__ . '/../config/Database.php';
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare("
                SELECT cs.cinema_id
                FROM cinema_staff cs
                WHERE cs.user_id = :uid
                LIMIT 1
            ");
            $stmt->execute([':uid' => $staffUserId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ? (int)$row['cinema_id'] : null;
        } catch (Exception $e) {
            error_log('getStaffCinemaId error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Resolve scan bundle from ticket code or booking code
     */
    private function resolveScanBundleByCode($code)
    {
        $ticket = $this->ticketModel->getByCode($code);
        if ($ticket) {
            return $this->ticketModel->getScanBundleByBookingId((int)$ticket['booking_id']);
        }

        return $this->ticketModel->getScanBundleByBookingCode($code);
    }

    /**
     * Validate if gate approval is allowed at current time
     */
    private function getGateValidationData($primaryTicket)
    {
        $showtimeStart = strtotime($primaryTicket['showtime_start']);
        $showtimeEnd = !empty($primaryTicket['showtime_end']) ? strtotime($primaryTicket['showtime_end']) : null;
        $now = time();

        $canEnterAt = $showtimeStart - 1800;
        $canApprove = true;
        $scanState = 'ALLOW_ENTRY';
        $message = 'Vé hợp lệ - Sẵn sàng duyệt vào cổng';

        if ($now < $canEnterAt) {
            $canApprove = false;
            $scanState = 'TOO_EARLY';
            $message = 'Suất chiếu chưa mở cửa';
        } elseif ($showtimeEnd !== null && $now > $showtimeEnd) {
            $canApprove = false;
            $scanState = 'EXPIRED';
            $message = 'Suất chiếu đã kết thúc - vé đã hết hạn quét';
        }

        return [
            'can_approve' => $canApprove,
            'scan_state' => $scanState,
            'message' => $message,
            'showtime_start' => $primaryTicket['showtime_start'],
            'showtime_end' => $primaryTicket['showtime_end'] ?? null,
            'can_enter_at' => date('Y-m-d H:i:s', $canEnterAt),
            'server_time' => date('Y-m-d H:i:s', $now),
        ];
    }

    /**
     * Lấy danh sách tất cả vé (Admin)
     * GET /api/tickets
     */
    public function index()
    {
        AuthMiddleware::requirePermission('tickets.view_all');
        try {
            // Get query parameters for pagination
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

            $tickets = $this->ticketModel->getAll($limit, $offset);

            Response::success(['tickets' => $tickets], 'Lấy danh sách vé thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi lấy danh sách vé: ' . $e->getMessage());
        }
    }

    /**
     * Tìm vé bằng QR code
     * GET /api/tickets/code/:code
     */
    public function getByCode($code)
    {
        AuthMiddleware::requirePermission('tickets.view_own');
        try {
            $ticket = $this->ticketModel->getByCode($code);

            if (!$ticket) {
                Response::notFound('Không tìm thấy vé với mã này');
            }

            Response::success($ticket, 'Lấy thông tin vé thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi tìm vé: ' . $e->getMessage());
        }
    }

    /**
     * Lấy danh sách vé của một booking
     * GET /api/tickets/booking/:bookingId
     */
    public function getByBooking($bookingId)
    {
        AuthMiddleware::requirePermission('tickets.view_own');
        try {
            $tickets = $this->ticketModel->getByBooking($bookingId);

            Response::success($tickets, 'Lấy danh sách vé thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi lấy danh sách vé: ' . $e->getMessage());
        }
    }

    /**
     * Quét vé tại cổng (Staff)
     * POST /api/tickets/check
     * Body: { "code": "TICKET123" }
     */
    public function check()
    {
        AuthMiddleware::requirePermission('tickets.scan');
        try {

            $input = json_decode(file_get_contents('php://input'), true);

            if (!isset($input['code'])) {
                Response::validationError(['code' => 'Mã vé là bắt buộc']);
            }

            $code = trim((string)$input['code']);
            $bundle = $this->resolveScanBundleByCode($code);

            if (empty($bundle)) {
                Response::notFound('Vé không tồn tại');
            }

            $primaryTicket = $bundle[0];

            // Kiểm tra rạp - Staff chỉ quét vé ở rạp mình
            $staffCinemaId = $this->getStaffCinemaId();
            $ticketCinemaId = isset($primaryTicket['cinema_id']) ? (int)$primaryTicket['cinema_id'] : null;
            if ($staffCinemaId !== null && $ticketCinemaId !== null && $staffCinemaId !== $ticketCinemaId) {
                $ticketCinemaName = $primaryTicket['cinema_name'] ?? 'rạp khác';
                Response::error(
                    "Vé này thuộc {$ticketCinemaName}. Bạn chỉ có thể quét vé tại rạp được phân công.",
                    403,
                    array_merge(
                        ['ticket_cinema_id' => $ticketCinemaId, 'staff_cinema_id' => $staffCinemaId],
                        $this->extractUserInfo($primaryTicket)
                    )
                );
            }

            $statuses = array_values(array_unique(array_map(function ($item) {
                return $item['status'] ?? '';
            }, $bundle)));
            $hasSoldTicket = in_array('SOLD', $statuses, true);
            $hasHoldingTicket = in_array('HOLDING', $statuses, true);
            $hasUsedTicket = in_array('USED', $statuses, true);

            // Validate ticket status
            if ($hasHoldingTicket) {
                Response::error('Vé chưa được thanh toán hoặc đã được sử dụng', 400, array_merge([
                    'current_status' => implode(', ', $statuses)
                ], $this->extractUserInfo($primaryTicket)));
            }

            if ($hasUsedTicket && !$hasSoldTicket) {
                Response::error('Vé đã được sử dụng trước đó', 400, array_merge([
                    'current_status' => implode(', ', $statuses)
                ], $this->extractUserInfo($primaryTicket)));
            }

            if (!$hasSoldTicket) {
                Response::error('Vé chưa được thanh toán hoặc đã được sử dụng', 400, array_merge([
                    'current_status' => implode(', ', $statuses)
                ], $this->extractUserInfo($primaryTicket)));
            }

            $seatCodes = array_values(array_map(function ($item) {
                return trim(($item['row_number'] ?? '') . ($item['seat_number'] ?? ''));
            }, $bundle));

            $gateValidation = $this->getGateValidationData($primaryTicket);

            Response::success([
                'ticket' => $primaryTicket,
                'booking' => [
                    'booking_code' => $primaryTicket['booking_code'] ?? null,
                    'ticket_count' => count($bundle),
                    'seats' => $seatCodes,
                ],
                'user' => $this->extractUserInfo($primaryTicket),
                'gate' => $gateValidation,
                'message' => $gateValidation['message']
            ], 'Kiểm tra vé thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi quét vé: ' . $e->getMessage());
        }
    }

    /**
     * Duyệt khách vào cổng và ghi lịch sử quét
     * POST /api/tickets/approve-entry
     * Body: { "code": "TICKET123" }
     */
    public function approveEntry()
    {
        try {
            AuthMiddleware::requirePermission('tickets.approve_entry');

            $input = json_decode(file_get_contents('php://input'), true);
            if (!isset($input['code'])) {
                Response::validationError(['code' => 'Mã vé là bắt buộc']);
            }

            $code = trim((string)$input['code']);
            $bundle = $this->resolveScanBundleByCode($code);

            if (empty($bundle)) {
                Response::notFound('Vé không tồn tại');
            }

            $primaryTicket = $bundle[0];

            // Kiểm tra rạp - Staff chỉ duyệt vé ở rạp mình
            $staffCinemaId = $this->getStaffCinemaId();
            $ticketCinemaId = isset($primaryTicket['cinema_id']) ? (int)$primaryTicket['cinema_id'] : null;
            if ($staffCinemaId !== null && $ticketCinemaId !== null && $staffCinemaId !== $ticketCinemaId) {
                $ticketCinemaName = $primaryTicket['cinema_name'] ?? 'rạp khác';
                Response::error(
                    "Vé này thuộc {$ticketCinemaName}. Bạn chỉ có thể quét vé tại rạp được phân công.",
                    403,
                    [
                        'ticket_cinema_id' => $ticketCinemaId,
                        'staff_cinema_id' => $staffCinemaId,
                        'user' => $this->extractUserInfo($primaryTicket),
                    ]
                );
            }

            $statuses = array_values(array_unique(array_map(function ($item) {
                return $item['status'] ?? '';
            }, $bundle)));

            if (in_array('HOLDING', $statuses, true)) {
                Response::error('Vé chưa được thanh toán', 400, [
                    'current_status' => implode(', ', $statuses),
                    'user' => $this->extractUserInfo($primaryTicket),
                ]);
            }

            if (!in_array('SOLD', $statuses, true)) {
                Response::error('Vé không còn hợp lệ để duyệt', 400, [
                    'current_status' => implode(', ', $statuses),
                    'user' => $this->extractUserInfo($primaryTicket),
                ]);
            }

            $gateValidation = $this->getGateValidationData($primaryTicket);
            if (!$gateValidation['can_approve']) {
                Response::error($gateValidation['message'], 400, [
                    'gate' => $gateValidation,
                    'user' => $this->extractUserInfo($primaryTicket),
                ]);
            }

            $updatedCount = $this->ticketModel->markBookingAsUsed((int)$primaryTicket['booking_id']);
            if ($updatedCount <= 0) {
                Response::error('Không có vé SOLD để duyệt vào cổng', 400, [
                    'current_status' => implode(', ', $statuses),
                ]);
            }

            $staffUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
            $this->ticketModel->logScanApproval(
                (int)$primaryTicket['booking_id'],
                $code,
                $staffUserId > 0 ? $staffUserId : null,
                'Duyệt vào cổng từ màn hình StaffScanner'
            );

            Response::success([
                'ticket' => $primaryTicket,
                'booking' => [
                    'booking_code' => $primaryTicket['booking_code'] ?? null,
                    'ticket_count' => count($bundle),
                ],
                'user' => $this->extractUserInfo($primaryTicket),
                'gate' => [
                    'approved' => true,
                    'approved_at' => date('Y-m-d H:i:s'),
                ],
                'message' => 'Đã duyệt khách vào cổng và lưu lịch sử quét'
            ], 'Duyệt vào cổng thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi duyệt vào cổng: ' . $e->getMessage());
        }
    }

    /**
     * Lấy lịch sử duyệt vào cổng (Staff)
     * GET /api/tickets/scan-history
     */
    public function scanHistory()
    {
        AuthMiddleware::requirePermission('tickets.scan');
        try {

            $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 50;
            $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
            $cinemaId = $this->getStaffCinemaId();
            
            $filters = [
                'booking_code' => $_GET['booking_code'] ?? '',
                'ticket_code_input' => $_GET['ticket_code_input'] ?? '',
                'scanned_by_email' => $_GET['scanned_by_email'] ?? '',
                'scan_result' => $_GET['scan_result'] ?? '',
                'date_from' => $_GET['date_from'] ?? '',
                'date_to' => $_GET['date_to'] ?? '',
                'cinema_id' => $cinemaId,
            ];

            $rows = $this->ticketModel->getScanHistory($limit, $offset, $filters);

            Response::success([
                'items' => $rows,
                'limit' => $limit,
                'offset' => $offset,
                'filters' => $filters,
            ], 'Lấy lịch sử quét thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi lấy lịch sử quét: ' . $e->getMessage());
        }
    }

    /**
     * Đánh dấu vé đã sử dụng (Staff)
     * PUT /api/tickets/:id/use
     */
    public function markAsUsed($id)
    {
        AuthMiddleware::requirePermission('tickets.approve_entry');
        try {
            $ticket = $this->ticketModel->getById($id);

            if (!$ticket) {
                Response::notFound('Vé không tồn tại');
            }

            if ($ticket['status'] !== 'SOLD') {
                Response::error('Chỉ có thể đánh dấu vé đã thanh toán', 400);
            }

            $result = $this->ticketModel->markAsUsed($id);

            if ($result) {
                Response::success(['id' => $id], 'Đánh dấu vé đã sử dụng thành công');
            } else {
                Response::serverError('Không thể cập nhật vé');
            }
        } catch (Exception $e) {
            Response::serverError('Lỗi khi đánh dấu vé: ' . $e->getMessage());
        }
    }

    /**
     * Hoàn vé
     * POST /api/tickets/:id/refund
     */
    public function refund($id)
    {
        AuthMiddleware::requirePermission('tickets.view_own');
        try {
            $ticket = $this->ticketModel->getById($id);

            if (!$ticket) {
                Response::notFound('Vé không tồn tại');
            }

            // Chỉ cho phép hoàn vé chưa sử dụng
            if ($ticket['status'] === 'USED') {
                Response::error('Không thể hoàn vé đã sử dụng', 400);
            }

            if ($ticket['status'] === 'REFUNDED') {
                Response::error('Vé đã được hoàn trước đó', 400);
            }

            // Kiểm tra thời gian hoàn vé (ít nhất 2 giờ trước suất chiếu)
            $showtimeStart = strtotime($ticket['showtime_start']);
            $now = time();

            if ($now > ($showtimeStart - 7200)) {
                Response::error('Không thể hoàn vé trong vòng 2 giờ trước suất chiếu', 400);
            }

            $result = $this->ticketModel->updateStatus($id, 'REFUNDED');

            if ($result) {
                if (!empty($ticket['booking_id'])) {
                    PusherService::triggerSeatsUpdatedForBooking(
                        Database::getInstance()->getConnection(),
                        $ticket['booking_id'],
                        'ticket-refunded'
                    );
                }
                Response::success([
                    'id' => $id,
                    'refund_amount' => $ticket['price']
                ], 'Hoàn vé thành công');
            } else {
                Response::serverError('Không thể hoàn vé');
            }
        } catch (Exception $e) {
            Response::serverError('Lỗi khi hoàn vé: ' . $e->getMessage());
        }
    }

    /**
     * Gửi email vé
     * POST /api/tickets/:id/send-email
     */
    public function sendEmail($id)
    {
        AuthMiddleware::requirePermission('tickets.view_own');
        try {
            $ticket = $this->ticketModel->getById($id);

            if (!$ticket) {
                Response::notFound('Vé không tồn tại');
            }

            // TODO: Implement email sending logic
            // - Generate QR code image
            // - Create HTML email template
            // - Send via SMTP/mail service

            Response::success([
                'id' => $id,
                'email_sent_to' => $ticket['user_email'] ?? 'N/A'
            ], 'Email vé đã được gửi thành công');
        } catch (Exception $e) {
            Response::serverError('Lỗi khi gửi email: ' . $e->getMessage());
        }
    }
}

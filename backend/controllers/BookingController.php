<?php
/**
 * Booking Controller
 */
class BookingController extends BaseController {
    private $db;
    private $bookingService;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
        $this->bookingService = new BookingService($this->db);
    }

    public function index() {
        AuthMiddleware::requirePermission('bookings.view_all');

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : Config::$items_per_page;

        $filters = [
            'status' => $_GET['status'] ?? null,
            'user_id' => $_GET['user_id'] ?? null,
            'showtime_id' => $_GET['showtime_id'] ?? null,
        ];

        list($bookings, $total) = $this->bookingService->listBookings($filters, $page, $limit);

        Response::paginated($bookings, $total, $page, $limit);
    }

    public function show($id) {
        AuthMiddleware::requirePermission('bookings.view_own');

        $booking = $this->bookingService->getBookingDetails($id);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        self::authorizeBookingAccess($booking);

        Response::success($booking);
    }

    public function create() {
        AuthMiddleware::requirePermission('bookings.create');

        $data = self::getRequestData();
        $seatIds = $this->extractSeatIds($data);
        $concessions = $data['concessions'] ?? [];
        $userVoucherId = $data['user_voucher_id'] ?? null;

        // Support both user_id (authenticated user) and guest_customer_id (POS walk-in)
        $guestCustomerId = $data['guest_customer_id'] ?? null;
        $userId = $data['user_id'] ?? ($_REQUEST['auth_user_id'] ?? null);

        // POS flow: when guest_customer_id is provided, always resolve account ownership by phone.
        // This prevents accidentally attaching the booking to staff/admin account from payload user_id.
        if ($guestCustomerId) {
            $userId = null;
            $linkedUserId = $this->resolveRegisteredUserIdByGuestCustomer((int)$guestCustomerId);
            if ($linkedUserId) {
                $userId = $linkedUserId;
            }
        }
        $showtimeId = $data['showtime_id'] ?? null;

        if (!$showtimeId || empty($seatIds)) {
            Response::validationError([
                'showtime_id' => 'Showtime id is required',
                'seat_ids' => 'Seat list is required',
            ]);
        }

        // Must have either user_id OR guest_customer_id
        if (!$userId && !$guestCustomerId) {
            Response::validationError([
                'user_id' => 'Either user_id or guest_customer_id is required',
            ]);
        }

        // If using user_id, authorize it (must be self or staff/admin for POS)
        if ($userId && !self::authorizeUserId((int)$userId, true)) {
            Response::forbidden('You do not have permission to create booking for this user');
        }

        try {
            // Check under 13 and under 16 age limits for late night movies
            if ($userId) {
                $stmt = $this->db->prepare("SELECT dob FROM user_profiles WHERE user_id = :uid LIMIT 1");
                $stmt->execute([':uid' => $userId]);
                $profile = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($profile && !empty($profile['dob'])) {
                    $stmtST = $this->db->prepare("
                        SELECT s.start_time, m.duration_minutes 
                        FROM showtimes s 
                        JOIN movies m ON s.movie_id = m.id 
                        WHERE s.id = :sid
                    ");
                    $stmtST->execute([':sid' => $showtimeId]);
                    $stCheck = $stmtST->fetch(PDO::FETCH_ASSOC);
                    
                    if ($stCheck) {
                        $startObj = new DateTime($stCheck['start_time']);
                        $startObj->modify("+{$stCheck['duration_minutes']} minutes");
                        $endHour = (int)$startObj->format('H');
                        $endMinute = (int)$startObj->format('i');
                        
                        $totalMinsOfDay = $endHour * 60 + $endMinute;
                        if ($endHour >= 0 && $endHour < 6) {
                            $totalMinsOfDay += 24 * 60;
                        }
                        
                        $dob = new DateTime($profile['dob']);
                        $now = new DateTime();
                        $age = $now->diff($dob)->y;
                        
                        $limit22 = 22 * 60;
                        $limit23 = 23 * 60;
                        
                        if ($age < 13 && $totalMinsOfDay > $limit22) {
                            Response::forbidden('Theo quy định, người dưới 13 tuổi không được phép xem phim có suất chiếu kết thúc sau 22h.');
                        }
                        
                        if ($age < 16 && $totalMinsOfDay > $limit23) {
                            Response::forbidden('Theo quy định, người dưới 16 tuổi không được phép xem phim có suất chiếu kết thúc sau 23h.');
                        }
                    }
                }
            }

            // Kiểm tra và trừ tồn kho concession nếu có
            if (!empty($concessions)) {
                // Lấy cinema_id từ showtime
                $stmtCinema = $this->db->prepare("
                    SELECT c.id as cinema_id
                    FROM showtimes s
                    JOIN cinema_halls ch ON ch.id = s.cinema_hall_id
                    JOIN cinemas c ON c.id = ch.cinema_id
                    WHERE s.id = :sid LIMIT 1
                ");
                $stmtCinema->execute([':sid' => $showtimeId]);
                $cinemaRow = $stmtCinema->fetch(PDO::FETCH_ASSOC);
                $cinemaId = $cinemaRow ? (int)$cinemaRow['cinema_id'] : null;

                if ($cinemaId) {
                    require_once __DIR__ . '/../models/Concession.php';
                    $concessionModel = new Concession();

                    // Kiểm tra trước (preview - không trừ)
                    foreach ($concessions as $item) {
                        $cid = isset($item['concession_id']) ? (int)$item['concession_id'] : 0;
                        $qty = isset($item['quantity']) ? (int)$item['quantity'] : 0;
                        if ($cid <= 0 || $qty <= 0) continue;

                        $stock = $concessionModel->getStock($cinemaId, $cid);
                        if ($stock < $qty) {
                            $stmtName = $this->db->prepare("SELECT name FROM concessions WHERE id = :id");
                            $stmtName->execute([':id' => $cid]);
                            $concessionName = $stmtName->fetchColumn() ?: "Sản phẩm #$cid";
                            Response::error("\"$concessionName\" đã hết hàng hoặc không đủ số lượng tồn kho. Còn lại: $stock.", 400);
                        }
                    }

                    // Trừ tồn kho sau khi kiểm tra
                    foreach ($concessions as $item) {
                        $cid = isset($item['concession_id']) ? (int)$item['concession_id'] : 0;
                        $qty = isset($item['quantity']) ? (int)$item['quantity'] : 0;
                        if ($cid <= 0 || $qty <= 0) continue;
                        $concessionModel->decreaseInventory($cinemaId, $cid, $qty);
                    }
                }
            }

            $result = $this->bookingService->createBooking(
                $userId ? (int)$userId : null,
                (int)$showtimeId,
                $seatIds,
                $concessions,
                $userVoucherId ? (int)$userVoucherId : null,
                $guestCustomerId ? (int)$guestCustomerId : null  // Add guest_customer_id param
            );
            Response::created($result, 'Booking created successfully');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function confirm($id) {
        AuthMiddleware::requirePermission('bookings.create');

        $booking = $this->bookingService->getBookingById($id);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        self::authorizeBookingAccess($booking);

        if ($booking['status'] !== 'Pending') {
            Response::error('Booking cannot be confirmed', 400);
        }

        try {
            $this->bookingService->confirmBooking($id);
            Response::success(['booking_id' => $id], 'Booking confirmed');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function cancel($id) {
        AuthMiddleware::requirePermission('bookings.cancel');

        $booking = $this->bookingService->getBookingById($id);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        $this->authorizeBookingAccess($booking);

        if (!in_array($booking['status'], ['Pending', 'Paid'], true)) {
            Response::error('Booking cannot be cancelled', 400);
        }

        try {
            $this->bookingService->cancelBooking($id);
            Response::success(['booking_id' => $id], 'Booking cancelled');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function refund($id) {
        AuthMiddleware::requirePermission('bookings.refund');

        $booking = $this->bookingService->getBookingById($id);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        if (!in_array($booking['status'], ['Pending', 'Paid'], true)) {
            Response::error('Booking cannot be refunded', 400);
        }

        try {
            $this->bookingService->refundBooking($id);
            Response::success(['booking_id' => $id], 'Booking refunded');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function getUserBookings($userId) {
        AuthMiddleware::requirePermission('bookings.view_own');
        AuthMiddleware::requirePermission('transactions.view_own');

        $this->authorizeUserId((int)$userId);

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : Config::$items_per_page;

        list($bookings, $total) = $this->bookingService->getUserBookings((int)$userId, $page, $limit);

        Response::paginated($bookings, $total, $page, $limit);
    }

    private function getStaffCinemaId() {
        $staffUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
        if ($staffUserId <= 0) return null;
        
        $stmt = $this->db->prepare("SELECT cinema_id FROM cinema_staff WHERE user_id = :uid LIMIT 1");
        $stmt->execute([':uid' => $staffUserId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (int)$row['cinema_id'] : null;
    }

    public function getPosPaymentHistory() {
        AuthMiddleware::requirePermission('bookings.pos');

        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        $roleLower = strtolower((string)($authRole ?? ''));
        if ($roleLower !== 'admin' && $authRoleId !== 5 && !in_array($roleLower, ['manager', 'staff'], true) && !in_array($authRoleId, [3, 4], true)) {
            $userId = (int)($_REQUEST['auth_user_id'] ?? 0);
            $isStaffGroup = false;
            if ($userId > 0) {
                try {
                    $db = Database::getInstance()->getConnection();
                    $stmtCheck = $db->prepare("SELECT COUNT(*) FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = :uid AND r.base_role IN ('staff', 'manager', 'admin')");
                    $stmtCheck->execute([':uid' => $userId]);
                    if ((int)$stmtCheck->fetchColumn() > 0) {
                        $isStaffGroup = true;
                    }
                } catch (Exception $e) {}
            }
            if (!$isStaffGroup) {
                Response::forbidden('Insufficient permissions');
            }
        }
        
        $cinemaId = null;
        if ($roleLower !== 'admin' && $authRoleId !== 5) {
            $cinemaId = $this->getStaffCinemaId();
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;

        $filters = [
            'phone' => $_GET['phone'] ?? null,
            'booking_code' => $_GET['booking_code'] ?? null,
            'movie_title' => $_GET['movie_title'] ?? null,
            'booking_status' => $_GET['booking_status'] ?? null,
            'payment_status' => $_GET['payment_status'] ?? null,
            'date_from' => $_GET['date_from'] ?? null,
            'date_to' => $_GET['date_to'] ?? null,
            'cinema_id' => $cinemaId,
        ];

        list($items, $total) = $this->bookingService->getPosPaymentHistory($filters, $page, $limit);

        Response::paginated($items, $total, $page, $limit);
    }

    public function getBookingsByShowtime($showtimeId) {
        AuthMiddleware::requirePermission('bookings.view_all');

        $bookings = $this->bookingService->getBookingsByShowtime((int)$showtimeId);

        Response::success($bookings);
    }
    public function getBookingByUserAndShowtime($userId, $showtimeId) {
        AuthMiddleware::requirePermission('bookings.view_own');

        $this->authorizeUserId((int)$userId);

        $booking = $this->bookingService->getBookingByUserAndShowtime((int)$userId, (int)$showtimeId);

        Response::success($booking);
    }
    public function update($id) {
        AuthMiddleware::requirePermission('bookings.update');

        $booking = $this->bookingService->getBookingById($id);
        if (!$booking) {
            Response::notFound('Booking not found');
        }

        self::authorizeBookingAccess($booking);

        if ($booking['status'] !== 'Pending') {
            Response::error('Only pending bookings can be updated', 400);
        }

        $data = self::getRequestData();
        $seatIds = $this->extractSeatIds($data);
        $concessions = $data['concessions'] ?? [];
        $userVoucherId = $data['user_voucher_id'] ?? null;

        try {
            $result = $this->bookingService->updateBooking(
                (int)$id,
                $seatIds,
                $concessions,
                $userVoucherId ? (int)$userVoucherId : null
            );
            Response::success($result, 'Booking updated successfully');
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
    }
    private function extractSeatIds($data) {
        $seatIds = $data['seat_ids'] ?? $data['seats'] ?? [];
        if (!is_array($seatIds)) {
            return [];
        }

        $result = [];
        foreach ($seatIds as $seat) {
            if (is_array($seat) && isset($seat['id'])) {
                $result[] = (int)$seat['id'];
            } else {
                $result[] = (int)$seat;
            }
        }
        return array_values(array_filter($result));
    }

    private function resolveRegisteredUserIdByGuestCustomer(int $guestCustomerId): ?int {
        if ($guestCustomerId <= 0) {
            return null;
        }

        $stmt = $this->db->prepare(
            "SELECT u.id
             FROM pos_customers pc
             INNER JOIN user_profiles up ON (
                 up.phone = pc.phone 
                 OR REPLACE(REPLACE(REPLACE(up.phone, ' ', ''), '.', ''), '-', '') = REPLACE(REPLACE(REPLACE(pc.phone, ' ', ''), '.', ''), '-', '')
             )
             INNER JOIN users u ON u.id = up.user_id
             WHERE pc.id = :guest_customer_id
               AND u.status = 'Active'
             LIMIT 1"
        );
        $stmt->execute([':guest_customer_id' => $guestCustomerId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || !isset($row['id'])) {
            return null;
        }

        return (int)$row['id'];
    }

    private function authorizeBookingAccess($booking) {
        $authUserId = (int)($_REQUEST['auth_user_id'] ?? 0);
        $authRole = $_REQUEST['auth_user_role'] ?? null;
        $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);

        if ($authRole === 'Admin' || $authRoleId === 5 || $authRole === 'Manager' || $authRoleId === 4 || $authRole === 'Staff' || $authRoleId === 3) {
            return;
        }

        if ($authUserId !== (int)$booking['user_id']) {
            Response::forbidden('Insufficient permissions');
        }
    }

}

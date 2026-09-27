<?php
require_once __DIR__ . '/../models/CinemaHall.php';
require_once __DIR__ . '/../models/Seat.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../config/Database.php';

/**
 * HallController
 * Quản lý phòng chiếu và sơ đồ ghế
 */
class HallController
{
    private $hallModel;
    private $seatModel;
    private $db;

    public function __construct()
    {
        $this->hallModel = new CinemaHall();
        $this->seatModel = new Seat();
        $this->db = Database::getInstance()->getConnection();
    }

    private function getCurrentUserId(): int
    {
        return (int) ($_REQUEST['auth_user_id'] ?? 0);
    }

    private function getCurrentUserRole(): string
    {
        return (string) ($_REQUEST['auth_user_role'] ?? '');
    }

    private function isManagerRole(): bool
    {
        return $this->getCurrentUserRole() === 'Manager';
    }

    private function getManagerCinemaId(): ?int
    {
        $userId = $this->getCurrentUserId();
        if (!$userId) {
            return null;
        }

        $stmt = $this->db->prepare("
            SELECT COALESCE(cs.cinema_id, c.id) as id
            FROM users u
            LEFT JOIN cinema_staff cs ON cs.user_id = u.id
            LEFT JOIN cinemas c ON c.manager_id = u.id
            WHERE u.id = :uid LIMIT 1
        ");
        $stmt->execute([':uid' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? (int) $row['id'] : null;
    }

    private function ensureManagerCanAccessCinema(int $cinemaId): bool
    {
        if (!$this->isManagerRole()) {
            return true;
        }

        $managerCinemaId = $this->getManagerCinemaId();
        if (!$managerCinemaId || $managerCinemaId !== $cinemaId) {
            Response::forbidden('Manager chỉ được thao tác trong rạp mà mình quản lý');
            return false;
        }

        return true;
    }

    private function ensureManagerCanAccessHall(array $hall): bool
    {
        $hallCinemaId = isset($hall['cinema_id']) ? (int) $hall['cinema_id'] : 0;
        return $this->ensureManagerCanAccessCinema($hallCinemaId);
    }

    /**
     * GET /api/halls/:id
     */
    public function show($id)
    {
        AuthMiddleware::requirePermission('halls.view');

        $hall = $this->hallModel->getById($id);
        if (!$hall)
            return Response::error('Không tìm thấy phòng', 404);

        $this->ensureManagerCanAccessHall($hall);

        $hall['seats'] = $this->hallModel->getSeats($id);
        return Response::success(['hall' => $hall]);
    }

    /**
     * POST /api/halls
     */
    public function create()
    {
        AuthMiddleware::requirePermission('halls.create');

        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['cinema_id']) || empty($input['name'])) {
            return Response::error('Thiếu thông tin rạp hoặc tên phòng', 400);
        }

        $totalSeats = isset($input['total_seats']) ? (int) $input['total_seats'] : 0;
        if ($totalSeats > 0 && ($totalSeats < 20 || $totalSeats > 350)) {
            return Response::error('Số lượng ghế của phòng chiếu phải từ 20 đến 350 ghế', 400);
        }

        $this->ensureManagerCanAccessCinema((int) $input['cinema_id']);

        $id = $this->hallModel->create($input);
        if (!$id)
            return Response::error('Không thể tạo phòng', 500);

        return Response::success(['id' => $id, 'message' => 'Tạo phòng thành công'], 201);
    }

    /**
     * PUT /api/halls/:id
     */
    public function update($id)
    {
        AuthMiddleware::requirePermission('halls.update');

        $hall = $this->hallModel->getById($id);
        if (!$hall)
            return Response::error('Không tìm thấy phòng', 404);

        $this->ensureManagerCanAccessHall($hall);

        $input = json_decode(file_get_contents('php://input'), true);
        $result = $this->hallModel->update($id, $input);

        if (!$result)
            return Response::error('Không thể cập nhật', 500);
        return Response::success(['message' => 'Cập nhật thành công']);
    }

    /**
     * DELETE /api/halls/:id
     */
    public function delete($id)
    {
        AuthMiddleware::requirePermission('halls.delete');

        $hall = $this->hallModel->getById($id);
        if (!$hall)
            return Response::error('Không tìm thấy phòng', 404);

        $this->ensureManagerCanAccessHall($hall);

        if ($this->seatModel->hasFutureShowtimeBindings((int) $id)) {
            return Response::error('Không thể xóa phòng vì còn suất chiếu tương lai', 409);
        }

        if (!$this->seatModel->canDeleteSeats($id)) {
            return Response::error('Không thể xóa phòng vì đã có suất chiếu', 400);
        }

        $result = $this->hallModel->delete($id);
        if (!$result)
            return Response::error('Không thể xóa', 500);

        return Response::success(['message' => 'Xóa phòng thành công']);
    }

    /**
     * POST /api/halls/:id/layout
     */
    public function saveLayout($id)
    {
        AuthMiddleware::requirePermission('halls.manage_layout');

        $hall = $this->hallModel->getById($id);
        if (!$hall)
            return Response::error('Không tìm thấy phòng', 404);

        $this->ensureManagerCanAccessHall($hall);

        if ($this->seatModel->hasFutureShowtimeBindings((int) $id)) {
            return Response::error('Không thể thay đổi sơ đồ ghế vì còn suất chiếu tương lai', 409);
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['seats']) || !is_array($input['seats'])) {
            return Response::error('Dữ liệu ghế không hợp lệ', 400);
        }

        // Đếm số ghế thực tế (Active + Broken, loại trừ Inactive/lối đi)
        $realSeatsCount = count(array_filter($input['seats'], function($s) {
            $status = $s['status'] ?? 'Active';
            return $status !== 'Inactive';
        }));

        if ($realSeatsCount < 20 || $realSeatsCount > 350) {
            return Response::error("Số lượng ghế thực tế của phòng phải từ 20 đến 350 ghế (hiện có {$realSeatsCount} ghế)", 400);
        }

        $result = $this->seatModel->replaceLayout($id, $input['seats']);
        if (!$result) {
            return Response::error('Không thể cập nhật sơ đồ ghế. Hãy kiểm tra xem có suất chiếu nào không.', 500);
        }

        return Response::success(['message' => 'Cập nhật sơ đồ ghế thành công']);
    }
}

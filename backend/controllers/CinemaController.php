<?php
require_once __DIR__ . '/../models/Cinema.php';
require_once __DIR__ . '/../models/CinemaHall.php';
require_once __DIR__ . '/../models/Showtime.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../config/Config.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

/**
 * CinemaController
 * Quản lý cụm rạp chiếu phim
 * Phụ trách: SƠN
 */
class CinemaController
{
    private $cinemaModel;
    private $hallModel;
    private $showtimeModel;

    public function __construct()
    {
        $this->cinemaModel = new Cinema();
        $this->hallModel = new CinemaHall();
        $this->showtimeModel = new Showtime();
    }

    /**
     * Helper: Get current user from JWT token
     */
    private function getCurrentUser()
    {
        if (!empty($_REQUEST['auth_user_id'])) {
            return [
                'user_id' => (int)$_REQUEST['auth_user_id'],
                'role_id' => (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0),
                'role' => (string)($_REQUEST['auth_user_role'] ?? ''),
            ];
        }

        try {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

            if (empty($authHeader)) {
                return null;
            }

            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
            } else {
                $token = str_replace('Bearer ', '', $authHeader);
            }

            $payload = JWT::decode($token, Config::$jwt_secret);

            return $payload;
        } catch (Exception $e) {
            error_log("JWT decode error in CinemaController: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Helper: Check if user is admin
     */
    private function isAdmin()
    {
        $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
        $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        if ($roleId === 5 || strtolower($roleName) === 'admin') return true;

        $user = $this->getCurrentUser();
        if (!$user) {
            return false;
        }

        $userRoleId = (int)($user['role_id'] ?? 0);
        $userRoleName = strtolower((string)($user['role'] ?? ''));
        return $userRoleId === 5 || $userRoleName === 'admin';
    }

    /**
     * Helper: Check if user is admin or manager
     */
    private function isAdminOrManager()
    {
        $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
        $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        if ($roleId === 5 || strtolower($roleName) === 'admin') return true;
        if ($roleId === 4 || strtolower($roleName) === 'manager') return true;

        $user = $this->getCurrentUser();
        if (!$user) {
            return false;
        }

        $userRoleId = (int)($user['role_id'] ?? 0);
        $userRoleName = strtolower((string)($user['role'] ?? ''));
        return in_array($userRoleId, [4, 5]) || in_array($userRoleName, ['admin', 'manager']);
    }

    /**
     * GET /api/cinemas
     * Lấy danh sách cinemas
     * Public access
     */
    public function index()
    {
        try {
            $filters = [];
            if (isset($_GET['search'])) {
                $filters['search'] = $_GET['search'];
            }

            $cinemas = $this->cinemaModel->getAll($filters);

            return Response::success([
                'cinemas' => $cinemas
            ]);

        } catch (Exception $e) {
            error_log("CinemaController Index Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy danh sách rạp', 500);
        }
    }

    /**
     * GET /api/cinemas/:id
     * Chi tiết cinema
     * Public access
     */
    public function show($id)
    {
        try {
            $cinema = $this->cinemaModel->getById($id);

            if (!$cinema) {
                return Response::error('Không tìm thấy rạp', 404);
            }

            // Lấy thêm danh sách halls
            $cinema['halls'] = $this->cinemaModel->getHalls($id);

            return Response::success([
                'cinema' => $cinema
            ]);

        } catch (Exception $e) {
            error_log("CinemaController Show Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy thông tin rạp', 500);
        }
    }

    /**
     * POST /api/cinemas
     * Tạo cinema mới
     * Authorization: Admin only
     */
    public function create()
    {
        try {
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $input = json_decode(file_get_contents('php://input'), true);

            // Validate required fields
            $requiredFields = ['name', 'address', 'street', 'district', 'city'];
            foreach ($requiredFields as $field) {
                if (empty($input[$field])) {
                    return Response::error("Thiếu trường bắt buộc: {$field}", 400);
                }
            }

            $cinemaId = $this->cinemaModel->create($input);

            if (!$cinemaId) {
                return Response::error('Không thể tạo rạp', 500);
            }

            $cinema = $this->cinemaModel->getById($cinemaId);

            return Response::success([
                'message' => 'Tạo rạp thành công',
                'cinema' => $cinema
            ], 201);

        } catch (Exception $e) {
            error_log("CinemaController Create Error: " . $e->getMessage());
            return Response::error('Lỗi khi tạo rạp', 500);
        }
    }

    /**
     * PUT /api/cinemas/:id
     * Cập nhật cinema
     * Authorization: Admin/Manager
     */
    public function update($id)
    {
        try {
            if (!$this->isAdminOrManager()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $cinema = $this->cinemaModel->getById($id);
            if (!$cinema) {
                return Response::error('Không tìm thấy rạp', 404);
            }

            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input)) {
                return Response::error('Không có dữ liệu cập nhật', 400);
            }

            // Whitelist allowed fields
            $allowedFields = ['name', 'address', 'street', 'district', 'city', 'lat', 'lng', 'hotline', 'manager_id', 'status'];
            $filteredInput = array_intersect_key($input, array_flip($allowedFields));

            if (empty($filteredInput)) {
                return Response::error('Không có trường hợp lệ để cập nhật', 400);
            }

            $result = $this->cinemaModel->update($id, $filteredInput);

            if (!$result) {
                return Response::error('Không thể cập nhật rạp', 500);
            }

            $updatedCinema = $this->cinemaModel->getById($id);

            return Response::success([
                'message' => 'Cập nhật rạp thành công',
                'cinema' => $updatedCinema
            ]);

        } catch (Exception $e) {
            error_log("CinemaController Update Error: " . $e->getMessage());
            return Response::error('Lỗi khi cập nhật rạp', 500);
        }
    }

    /**
     * DELETE /api/cinemas/:id
     * Xóa cinema
     * Authorization: Admin only
     */
    public function delete($id)
    {
        try {
            if (!$this->isAdmin()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            $cinema = $this->cinemaModel->getById($id);
            if (!$cinema) {
                return Response::error('Không tìm thấy rạp', 404);
            }

            if ($this->cinemaModel->hasFutureShowtimeBindings((int) $id)) {
                return Response::error('Không thể xóa rạp vì còn suất chiếu tương lai', 409);
            }

            $result = $this->cinemaModel->delete($id);

            if (!$result) {
                return Response::error('Không thể xóa rạp', 500);
            }

            return Response::success([
                'message' => 'Xóa rạp thành công'
            ]);

        } catch (Exception $e) {
            error_log("CinemaController Delete Error: " . $e->getMessage());
            return Response::error('Lỗi khi xóa rạp', 500);
        }
    }

    /**
     * GET /api/cinemas/:id/halls
     * Lấy danh sách halls của cinema
     * Public access
     */
    public function getHalls($id)
    {
        try {
            $cinema = $this->cinemaModel->getById($id);
            if (!$cinema) {
                return Response::error('Không tìm thấy rạp', 404);
            }

            $halls = $this->hallModel->getByCinemaId($id);

            return Response::success([
                'cinema_name' => $cinema['name'],
                'halls' => $halls
            ]);

        } catch (Exception $e) {
            error_log("CinemaController GetHalls Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy danh sách phòng chiếu', 500);
        }
    }

    /**
     * GET /api/cinemas/:id/showtimes
     * Lấy suất chiếu của cinema
     */
    public function getShowtimes($id)
    {
        try {
            AuthMiddleware::requirePermission('showtimes.view');
            $cinema = $this->cinemaModel->getById($id);
            if (!$cinema) {
                return Response::error('Không tìm thấy rạp', 404);
            }

            $filters = ['cinema_id' => $id];
            if (isset($_GET['date'])) {
                $filters['date'] = $_GET['date'];
            }

            $page = isset($_GET['page']) ? (int) $_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;

            $showtimes = $this->showtimeModel->getAll($filters, $page, $limit);
            $total = $this->showtimeModel->count($filters);

            return Response::success([
                'cinema_name' => $cinema['name'],
                'showtimes' => $showtimes,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => ceil($total / $limit)
                ]
            ]);

        } catch (Exception $e) {
            error_log("CinemaController GetShowtimes Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy suất chiếu', 500);
        }
    }
}

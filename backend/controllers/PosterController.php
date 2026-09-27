<?php
require_once __DIR__ . '/../models/Poster.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../utils/CloudinaryUploader.php';
require_once __DIR__ . '/../config/Config.php';

class PosterController
{
    private $posterModel;

    public function __construct()
    {
        $this->posterModel = new Poster();
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
            if (empty($authHeader)) return null;

            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
            } else {
                $token = str_replace('Bearer ', '', $authHeader);
            }

            $payload = JWT::decode($token, Config::$jwt_secret);
            return $payload;
        } catch (Exception $e) {
            return null;
        }
    }

    /**
     * Helper: Check if user is admin or manager (role_id 4=Manager, 5=Admin)
     */
    private function isAdminOrManager(): bool
    {
        $roleName = (string)($_REQUEST['auth_user_role'] ?? '');
        $roleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
        if ($roleId === 5 || strtolower($roleName) === 'admin') return true;
        if ($roleId === 4 || strtolower($roleName) === 'manager') return true;

        $user = $this->getCurrentUser();
        if (!$user) return false;
        $userRoleId = (int)($user['role_id'] ?? 0);
        $userRoleName = strtolower((string)($user['role'] ?? ''));
        return in_array($userRoleId, [4, 5]) || in_array($userRoleName, ['admin', 'manager']);
    }

    /**
     * GET /api/posters - Lấy danh sách poster (Tự động lọc nếu là guest)
     */
    public function index()
    {
        try {
            // Nếu là Admin/Manager => lấy tất cả. Nếu là Guest/User => chỉ lấy những poster có is_active = 1
            if ($this->isAdminOrManager()) {
                $posters = $this->posterModel->getAll();
            } else {
                $posters = $this->posterModel->getActive();
            }

            // Convert is_active to bool for JSON frontend
            foreach ($posters as &$poster) {
                $poster['is_active'] = (bool)$poster['is_active'];
                $poster['display_order'] = (int)$poster['display_order'];
            }

            Response::success(['posters' => $posters]);
        } catch (Exception $e) {
            error_log("Poster API Error: " . $e->getMessage());
            Response::error('Lỗi khi lấy danh sách poster', 500);
        }
    }

    /**
     * POST /api/posters - Tạo poster mới (Admin/Manager)
     * Request body: multipart/form-data (chứa file 'poster_image')
     */
    public function create()
    {
        try {
            if (!$this->isAdminOrManager()) {
                Response::error('Không có quyền thực hiện thao tác này', 403);
                return;
            }

            // Xử lý upload ảnh lên Cloudinary
            if (!isset($_FILES['poster_image']) || $_FILES['poster_image']['error'] !== UPLOAD_ERR_OK) {
                Response::error('Vui lòng cung cấp file hình ảnh hợp lệ', 400);
                return;
            }

            $publicId = 'poster_' . time() . '_' . rand(1000, 9999);
            $imageUrl = CloudinaryUploader::uploadImage($_FILES['poster_image']['tmp_name'], $publicId, 'posters');
            
            if (!$imageUrl) {
                $file = $_FILES['poster_image'];
                $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $ifEmptyExt = $extension ? '.' . $extension : '';
                $filename = $publicId . $ifEmptyExt;
                
                $uploadDir = __DIR__ . '/../uploads/posters/';
                if (!file_exists($uploadDir)) {
                    mkdir($uploadDir, 0777, true);
                }
                
                $filePath = $uploadDir . $filename;
                if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                    Response::error('Lỗi khi lưu ảnh xuống máy chủ local (do cấu hình Cloudinary chưa bật)', 500);
                    return;
                }
                
                $imageUrl = 'uploads/posters/' . $filename;
            }

            $data = [
                'title' => $_POST['title'] ?? null,
                'image_url' => $imageUrl,
                'target_url' => $_POST['target_url'] ?? null,
                'display_order' => isset($_POST['display_order']) ? (int)$_POST['display_order'] : 0,
                'is_active' => isset($_POST['is_active']) ? ((int)$_POST['is_active'] === 1 ? 1 : 0) : 1
            ];

            $posterId = $this->posterModel->create($data);
            if (!$posterId) {
                Response::error('Không thể tạo poster', 500);
                return;
            }

            $poster = $this->posterModel->getById($posterId);
            $poster['is_active'] = (bool)$poster['is_active'];
            $poster['display_order'] = (int)$poster['display_order'];

            Response::success(['poster' => $poster, 'message' => 'Tạo poster thành công'], 201);
        } catch (Exception $e) {
            error_log("Poster Create Error: " . $e->getMessage());
            Response::error('Lỗi khi tạo poster: ' . $e->getMessage(), 500);
        }
    }

    /**
     * PUT /api/posters/:id - Cập nhật poster (Admin/Manager)
     * Nhận FormData để có thể up ảnh mới (POST spoofing với _method=PUT)
     */
    public function update($id)
    {
        try {
            if (!$this->isAdminOrManager()) {
                Response::error('Không có quyền thực hiện thao tác này', 403);
                return;
            }

            $poster = $this->posterModel->getById($id);
            if (!$poster) {
                Response::error('Không tìm thấy poster', 404);
                return;
            }

            // Do PHP không tự parse FormData trên PUT method,
            // nên trên Frontend phải gửi POST rồ thêm _method=PUT, hoặc truyền JSON (nếu không đổi file ảnh)
            $input = $_POST;
            if (empty($input)) {
                $input = json_decode(file_get_contents('php://input'), true) ?? [];
            }

            $imageUrl = $poster['image_url'];

            // Nếu admin có đẩy file thay thế ảnh
            if (isset($_FILES['poster_image']) && $_FILES['poster_image']['error'] === UPLOAD_ERR_OK) {
                $publicId = 'poster_' . time() . '_' . rand(1000, 9999);
                $newImageUrl = CloudinaryUploader::uploadImage($_FILES['poster_image']['tmp_name'], $publicId, 'posters');
                
                if (!$newImageUrl) {
                    $file = $_FILES['poster_image'];
                    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                    $ifEmptyExt = $extension ? '.' . $extension : '';
                    $filename = $publicId . $ifEmptyExt;
                    
                    $uploadDir = __DIR__ . '/../uploads/posters/';
                    if (!file_exists($uploadDir)) {
                        mkdir($uploadDir, 0777, true);
                    }
                    
                    $filePath = $uploadDir . $filename;
                    if (move_uploaded_file($file['tmp_name'], $filePath)) {
                        $newImageUrl = 'uploads/posters/' . $filename;
                    }
                }

                if ($newImageUrl) {
                    $imageUrl = $newImageUrl;
                }
            } else if (!empty($input['image_url'])) {
                $imageUrl = $input['image_url'];
            }

            $data = [
                'title' => $input['title'] ?? $poster['title'],
                'image_url' => $imageUrl,
                'target_url' => $input['target_url'] ?? $poster['target_url'],
                'display_order' => isset($input['display_order']) ? (int)$input['display_order'] : $poster['display_order'],
                'is_active' => isset($input['is_active']) ? ((int)$input['is_active'] === 1 || $input['is_active'] === true ? 1 : 0) : $poster['is_active']
            ];

            $result = $this->posterModel->update($id, $data);
            if (!$result) {
                Response::error('Không thể cập nhật poster', 500);
                return;
            }

            $updatedPoster = $this->posterModel->getById($id);
            $updatedPoster['is_active'] = (bool)$updatedPoster['is_active'];
            $updatedPoster['display_order'] = (int)$updatedPoster['display_order'];

            Response::success(['poster' => $updatedPoster, 'message' => 'Cập nhật poster thành công']);
        } catch (Exception $e) {
            error_log("Poster Update Error: " . $e->getMessage());
            Response::error('Lỗi khi cập nhật poster', 500);
        }
    }

    /**
     * DELETE /api/posters/:id - Xóa poster (Admin/Manager)
     */
    public function delete($id)
    {
        try {
            if (!$this->isAdminOrManager()) {
                Response::error('Chỉ Admin/Manager mới có thể xóa poster', 403);
                return;
            }

            $poster = $this->posterModel->getById($id);
            if (!$poster) {
                Response::error('Không tìm thấy poster', 404);
                return;
            }

            $result = $this->posterModel->delete($id);
            if ($result === false) {
                Response::error('Không thể xóa poster', 500);
                return;
            }

            Response::success(['message' => 'Xóa poster thành công']);
        } catch (Exception $e) {
            error_log("Poster Delete Error: " . $e->getMessage());
            Response::error('Lỗi khi xóa poster', 500);
        }
    }
}
?>

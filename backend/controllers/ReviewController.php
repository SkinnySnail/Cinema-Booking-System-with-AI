<?php
require_once __DIR__ . '/../models/Review.php';
require_once __DIR__ . '/../models/Movie.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../config/Config.php';

/**
 * ReviewController
 * Quản lý đánh giá phim
 * Phụ trách: TUẤN TÀI
 */
class ReviewController {
    private $reviewModel;
    private $movieModel;
    
    public function __construct() {
        $this->reviewModel = new Review();
        $this->movieModel = new Movie();
    }
    
    /**
     * Helper: Get current user from JWT token
     */
    private function getCurrentUser() {
        try {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? '';
            
            if (empty($authHeader)) {
                return null;
            }
            
            $token = str_replace('Bearer ', '', $authHeader);
            $payload = JWT::decode($token, Config::$jwt_secret);
            
            return $payload;
        } catch (Exception $e) {
            error_log("JWT decode error in ReviewController: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Helper: Check if user is manager
     */
    private function isManager() {
        $user = $this->getCurrentUser();
        
        if (!$user) {
            return false;
        }
        
        // role_id: 4 = Manager, 5 = Admin
        return in_array($user['role_id'], [4, 5]);
    }
    
    /**
     * Helper: Check if user is member (logged in)
     */
    private function isMember() {
        $user = $this->getCurrentUser();
        return $user !== null;
    }
    
    // ============================================
    // ADMIN/MANAGER FUNCTIONS
    // ============================================
    
    /**
     * GET /api/reviews
     * Lấy tất cả reviews với filter (Admin/Manager)
     * Authorization: Manager/Admin only
     */
    public function index() {
        try {
            AuthMiddleware::requirePermission('reviews.view_all');
            
            // Get query parameters
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
            
            // Build filters
            $filters = [];
            if (isset($_GET['status'])) $filters['status'] = $_GET['status'];
            if (isset($_GET['movie_id'])) $filters['movie_id'] = (int)$_GET['movie_id'];
            if (isset($_GET['user_id'])) $filters['user_id'] = (int)$_GET['user_id'];
            if (isset($_GET['rating'])) $filters['rating'] = (int)$_GET['rating'];
            
            // Get reviews
            $reviews = $this->reviewModel->getAll($filters, $page, $limit);
            $total = $this->reviewModel->count($filters);
            
            $totalPages = ceil($total / $limit);
            
            return Response::success([
                'reviews' => $reviews,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => $totalPages
                ]
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Index Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy danh sách reviews', 500);
        }
    }
    
    // ============================================
    // PUBLIC FUNCTIONS
    // ============================================
    
    /**
     * GET /api/movies/{movieId}/reviews
     * Lấy reviews của 1 phim
     * Public access
     */
    public function getByMovie($movieId) {
        try {
            AuthMiddleware::requirePermission('reviews.view');

            if (!$movieId || !is_numeric($movieId)) {
                return Response::error('ID phim không hợp lệ', 400);
            }
            
            // Check if movie exists
            $movie = $this->movieModel->getById($movieId);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }
            
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            
            $reviews = $this->reviewModel->getByMovie($movieId, $page, $limit);
            $total = $this->reviewModel->countByMovie($movieId);
            
            $totalPages = ceil($total / $limit);
            
            return Response::success([
                'movie_id' => $movieId,
                'reviews' => $reviews,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => $totalPages
                ]
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController GetByMovie Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy reviews', 500);
        }
    }
    
    // ============================================
    // MEMBER FUNCTIONS
    // ============================================
    
    /**
     * POST /api/reviews
     * Tạo review mới
     * Authorization: Member only (đã xem phim)
     */
    public function create() {
        try {
            AuthMiddleware::requirePermission('reviews.create');

            // Check if user is logged in
            $user = $this->getCurrentUser();
            if (!$user) {
                return Response::error('Vui lòng đăng nhập', 401);
            }
            
            // Get request body
            $input = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (empty($input['movie_id'])) {
                return Response::error('Thiếu movie_id', 400);
            }
            
            if (empty($input['rating'])) {
                return Response::error('Thiếu rating', 400);
            }
            
            if (empty($input['comment'])) {
                return Response::error('Thiếu comment', 400);
            }
            
            // Validate rating range (1-5)
            if ($input['rating'] < 1 || $input['rating'] > 5) {
                return Response::error('Rating phải từ 1 đến 5', 400);
            }
            
            // Check if movie exists
            $movie = $this->movieModel->getById($input['movie_id']);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }
            
            // Create review
            $data = [
                'user_id' => $user['user_id'],
                'movie_id' => $input['movie_id'],
                'rating' => $input['rating'],
                'comment' => trim($input['comment'])
            ];
            
            $result = $this->reviewModel->create($data);
            
            if (!$result['success']) {
                return Response::error($result['message'], 400);
            }
            
            // Get created review
            $review = $this->reviewModel->getById($result['review_id']);
            
            return Response::success([
                'message' => 'Tạo review thành công. Review của bạn đang chờ duyệt.',
                'review' => $review
            ], 201);
            
        } catch (Exception $e) {
            error_log("ReviewController Create Error: " . $e->getMessage());
            return Response::error('Lỗi khi tạo review', 500);
        }
    }
    
    /**
     * PUT /api/reviews/{id}
     * Cập nhật review của mình
     * Authorization: Owner only
     */
    public function update($id) {
        try {
            AuthMiddleware::requirePermission('reviews.update_own');

            // Check if user is logged in
            $user = $this->getCurrentUser();
            if (!$user) {
                return Response::error('Vui lòng đăng nhập', 401);
            }
            
            if (!$id || !is_numeric($id)) {
                return Response::error('ID review không hợp lệ', 400);
            }
            
            // Check if review exists
            $review = $this->reviewModel->getById($id);
            if (!$review) {
                return Response::error('Không tìm thấy review', 404);
            }
            
            // Check ownership (Admin can edit any review)
            $authRole = $_REQUEST['auth_user_role'] ?? null;
            $authRoleId = (int)($_REQUEST['auth_user_role_id'] ?? $_REQUEST['auth_role_id'] ?? 0);
            $isAdmin = ($authRole === 'Admin' || $authRoleId === 5 || ((int)($user['role_id'] ?? 0)) === 5);
            if (!$isAdmin && $review['user_id'] != $user['user_id']) {
                return Response::error('Bạn không có quyền sửa review này', 403);
            }
            
            // Get request body
            $input = json_decode(file_get_contents('php://input'), true);
            
            // Validate required fields
            if (empty($input['rating'])) {
                return Response::error('Thiếu rating', 400);
            }
            
            if (empty($input['comment'])) {
                return Response::error('Thiếu comment', 400);
            }
            
            // Validate rating range
            if ($input['rating'] < 1 || $input['rating'] > 5) {
                return Response::error('Rating phải từ 1 đến 5', 400);
            }
            
            // Update review
            $data = [
                'rating' => $input['rating'],
                'comment' => trim($input['comment'])
            ];
            
            $result = $this->reviewModel->update($id, $data);
            
            if (!$result) {
                return Response::error('Không thể cập nhật review', 500);
            }
            
            // Get updated review
            $updatedReview = $this->reviewModel->getById($id);
            
            return Response::success([
                'message' => 'Cập nhật review thành công. Review của bạn đang chờ duyệt lại.',
                'review' => $updatedReview
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Update Error: " . $e->getMessage());
            return Response::error('Lỗi khi cập nhật review', 500);
        }
    }
    
    /**
     * DELETE /api/reviews/{id}
     * Xóa review của mình
     * Authorization: Owner or Manager
     */
    public function delete($id) {
        try {
            AuthMiddleware::authenticate();

            // Check if user is logged in
            $user = $this->getCurrentUser();
            if (!$user) {
                return Response::error('Vui lòng đăng nhập', 401);
            }
            
            if (!$id || !is_numeric($id)) {
                return Response::error('ID review không hợp lệ', 400);
            }
            
            // Check if review exists
            $review = $this->reviewModel->getById($id);
            if (!$review) {
                return Response::error('Không tìm thấy review', 404);
            }
            
            // Check ownership or manager permission
            $isOwner = $review['user_id'] == $user['user_id'];
            
            if ($isOwner) {
                AuthMiddleware::requirePermission('reviews.delete_own');
            } else {
                AuthMiddleware::requirePermission('reviews.delete_any');
            }
            
            // Delete review
            $result = $this->reviewModel->delete($id);
            
            if (!$result) {
                return Response::error('Không thể xóa review', 500);
            }
            
            return Response::success([
                'message' => 'Xóa review thành công',
                'review_id' => $id
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Delete Error: " . $e->getMessage());
            return Response::error('Lỗi khi xóa review', 500);
        }
    }
    
    /**
     * POST /api/reviews/{id}/approve
     * Duyệt review (Manager)
     * Authorization: Manager only
     */
    public function approve($id) {
        try {
            AuthMiddleware::requirePermission('reviews.approve');
            
            if (!$id || !is_numeric($id)) {
                return Response::error('ID review không hợp lệ', 400);
            }
            
            // Check if review exists
            $review = $this->reviewModel->getById($id);
            if (!$review) {
                return Response::error('Không tìm thấy review', 404);
            }
            
            // Approve review
            $result = $this->reviewModel->approve($id);
            
            if (!$result) {
                return Response::error('Không thể duyệt review', 500);
            }
            
            // Get updated review
            $updatedReview = $this->reviewModel->getById($id);
            
            return Response::success([
                'message' => 'Duyệt review thành công',
                'review' => $updatedReview
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Approve Error: " . $e->getMessage());
            return Response::error('Lỗi khi duyệt review', 500);
        }
    }
    
    /**
     * POST /api/reviews/{id}/reject
     * Từ chối review (Manager)
     * Authorization: Manager only
     */
    public function reject($id) {
        try {
            AuthMiddleware::requirePermission('reviews.reject');
            
            if (!$id || !is_numeric($id)) {
                return Response::error('ID review không hợp lệ', 400);
            }
            
            // Check if review exists
            $review = $this->reviewModel->getById($id);
            if (!$review) {
                return Response::error('Không tìm thấy review', 404);
            }
            
            // Reject review
            $result = $this->reviewModel->reject($id);
            
            if (!$result) {
                return Response::error('Không thể từ chối review', 500);
            }
            
            // Get updated review
            $updatedReview = $this->reviewModel->getById($id);
            
            return Response::success([
                'message' => 'Từ chối review thành công',
                'review' => $updatedReview
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Reject Error: " . $e->getMessage());
            return Response::error('Lỗi khi từ chối review', 500);
        }
    }
    
    /**
     * POST /api/reviews/{id}/report
     * Report review (spam/inappropriate)
     * Authorization: Member only
     */
    public function report($id) {
        try {
            AuthMiddleware::requirePermission('reviews.report');

            // Check if user is logged in
            $user = $this->getCurrentUser();
            if (!$user) {
                return Response::error('Vui lòng đăng nhập', 401);
            }
            
            if (!$id || !is_numeric($id)) {
                return Response::error('ID review không hợp lệ', 400);
            }
            
            // Check if review exists
            $review = $this->reviewModel->getById($id);
            if (!$review) {
                return Response::error('Không tìm thấy review', 404);
            }
            
            // Get request body (optional reason)
            $input = json_decode(file_get_contents('php://input'), true);
            $reason = $input['reason'] ?? null;
            
            // Report review
            $result = $this->reviewModel->report($id, $reason);
            
            if (!$result) {
                return Response::error('Không thể report review', 500);
            }
            
            return Response::success([
                'message' => 'Report review thành công. Chúng tôi sẽ xem xét.',
                'review_id' => $id
            ]);
            
        } catch (Exception $e) {
            error_log("ReviewController Report Error: " . $e->getMessage());
            return Response::error('Lỗi khi report review', 500);
        }
    }
}

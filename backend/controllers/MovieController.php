<?php
require_once __DIR__ . '/../models/Movie.php';
require_once __DIR__ . '/../models/Genre.php';
require_once __DIR__ . '/../models/MovieGenre.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../utils/JWT.php';
require_once __DIR__ . '/../utils/CloudinaryUploader.php';
require_once __DIR__ . '/../config/Config.php';

/**
 * MovieController
 * Quản lý phim
 * Phụ trách: TUẤN TÀI
 */
class MovieController
{
    private $movieModel;
    private $genreModel;
    private $movieGenreModel;

    public function __construct()
    {
        $this->movieModel = new Movie();
        $this->genreModel = new Genre();
        $this->movieGenreModel = new MovieGenre();
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
            error_log("JWT decode error in MovieController: " . $e->getMessage());
            return null;
        }
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
    
    // ============================================
    // PUBLIC FUNCTIONS
    // ============================================

    /**
     * GET /api/movies
     * Lấy danh sách phim với filter và pagination
     * Public access
     */
    public function index()
    {
        try {
            // Kiểm tra permission động
            AuthMiddleware::requirePermission('movies.view');

            // Get query parameters
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;

            // Build filters
            $filters = [];
            if (isset($_GET['status'])) $filters['status'] = $_GET['status'];
            if (isset($_GET['origin'])) $filters['origin'] = $_GET['origin'];
            if (isset($_GET['genre_id'])) $filters['genre_id'] = (int)$_GET['genre_id'];
            if (isset($_GET['search'])) $filters['search'] = $_GET['search'];

            // Get movies
            $movies = $this->movieModel->getAll($filters, $page, $limit);
            $total = $this->movieModel->count($filters);

            $totalPages = ceil($total / $limit);

            return Response::success([
                'movies' => $movies,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'total_pages' => $totalPages
                ]
            ]);
        } catch (Exception $e) {
            error_log("MovieController Index Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy danh sách phim', 500);
        }
    }

    /**
     * GET /api/movies/{id}
     * Lấy chi tiết phim theo ID
     * Public access
     */
    public function show($id)
    {
        try {
            AuthMiddleware::requirePermission('movies.view');

            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            $movie = $this->movieModel->getById($id);

            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            return Response::success(['movie' => $movie]);
        } catch (Exception $e) {
            error_log("MovieController Show Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy thông tin phim', 500);
        }
    }

    /**
     * GET /api/movies/{id}/showtimes
     * Lấy suất chiếu của phim
     */
    public function getShowtimes($id)
    {
        try {
            AuthMiddleware::requirePermission('showtimes.view');
            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            // Check if movie exists
            $movie = $this->movieModel->getById($id);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            // Build filters
            $filters = [];
            if (isset($_GET['date'])) $filters['date'] = $_GET['date'];
            if (isset($_GET['cinema_id'])) $filters['cinema_id'] = (int)$_GET['cinema_id'];

            $showtimes = $this->movieModel->getShowtimes($id, $filters);

            return Response::success([
                'movie_id' => $id,
                'showtimes' => $showtimes,
                'total' => count($showtimes)
            ]);
        } catch (Exception $e) {
            error_log("MovieController GetShowtimes Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy suất chiếu', 500);
        }
    }

    /**
     * GET /api/movies/{id}/reviews
     * Lấy reviews của phim
     * Public access
     */
    public function getReviews($id)
    {
        AuthMiddleware::requirePermission('reviews.view');
        try {
            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            // Check if movie exists
            $movie = $this->movieModel->getById($id);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;

            $reviews = $this->movieModel->getReviews($id, $page, $limit);

            // Get rating statistics
            $ratingStats = $this->movieModel->calculateAverageRating($id);

            return Response::success([
                'movie_id' => $id,
                'reviews' => $reviews,
                'rating_stats' => $ratingStats,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit
                ]
            ]);
        } catch (Exception $e) {
            error_log("MovieController GetReviews Error: " . $e->getMessage());
            return Response::error('Lỗi khi lấy reviews', 500);
        }
    }
    
    // ============================================
    // ADMIN/MANAGER FUNCTIONS
    // ============================================

    /**
     * POST /api/movies
     * Tạo phim mới
     * Authorization: Admin/Manager only
     */
    public function create()
    {
        try {
            // Check permission
            AuthMiddleware::requirePermission('movies.create');

            // Get request body
            $input = json_decode(file_get_contents('php://input'), true);

            // Validate required fields
            $requiredFields = ['title', 'duration', 'release_date', 'origin'];
            foreach ($requiredFields as $field) {
                if (empty($input[$field])) {
                    return Response::error("Thiếu trường bắt buộc: {$field}", 400);
                }
            }

            // Validate duration
            if ($input['duration'] <= 0) {
                return Response::error('Thời lượng phim phải lớn hơn 0', 400);
            }

            // Validate age_rating - must match ENUM in database
            $validAgeRatings = ['P', 'K', 'T13', 'T16', 'T18', 'C'];
            if (isset($input['age_rating']) && !in_array($input['age_rating'], $validAgeRatings)) {
                return Response::error('Phân loại độ tuổi không hợp lệ', 400);
            }

            // Validate release date format
            if (!strtotime($input['release_date'])) {
                return Response::error('Ngày phát hành không hợp lệ', 400);
            }

            // Enforce required director and cast for creating a movie
            $director = trim((string)($input['director'] ?? ''));
            $cast = trim((string)($input['cast'] ?? ''));
            if ($director === '' || $cast === '') {
                return Response::error('Vui lòng nhập đầy đủ đạo diễn và diễn viên', 400);
            }

            // Validate origin - must match ENUM in database
            $validOrigins = ['Vietnam', 'International'];
            if (!in_array($input['origin'], $validOrigins)) {
                return Response::error('Quốc gia không hợp lệ (Vietnam hoặc International)', 400);
            }

            // Validate status - must match ENUM in database
            $validStatuses = ['Now Showing', 'Coming Soon', 'Ended'];
            if (isset($input['status']) && !in_array($input['status'], $validStatuses)) {
                return Response::error('Trạng thái không hợp lệ', 400);
            }

            // Validate genre_ids if provided
            if (isset($input['genre_ids']) && is_array($input['genre_ids'])) {
                foreach ($input['genre_ids'] as $genreId) {
                    if (!$this->genreModel->getById($genreId)) {
                        return Response::error("Thể loại ID {$genreId} không tồn tại", 400);
                    }
                }
            }

            // Create movie
            $input['director'] = $director;
            $input['cast'] = $cast;
            $movieId = $this->movieModel->create($input);

            if (!$movieId) {
                return Response::error('Không thể tạo phim', 500);
            }

            // Get created movie
            $movie = $this->movieModel->getById($movieId);

            return Response::success([
                'message' => 'Tạo phim thành công',
                'movie' => $movie
            ], 201);
        } catch (Exception $e) {
            error_log("MovieController Create Error: " . $e->getMessage());
            return Response::error('Lỗi khi tạo phim', 500);
        }
    }

    /**
     * POST /api/movies/import
     * Nhập nhiều phim từ Excel (dạng mảng JSON)
     * Authorization: Admin/Manager only
     */
    public function import()
    {
        try {
            AuthMiddleware::requirePermission('movies.import');

            $input = json_decode(file_get_contents('php://input'), true);

            if (!is_array($input) || empty($input)) {
                return Response::error('Dữ liệu không hợp lệ hoặc rỗng', 400);
            }

            $successCount = 0;
            $errors = [];

            foreach ($input as $index => $item) {
                try {
                    $requiredFields = ['title', 'duration', 'release_date', 'origin'];
                    $valid = true;
                    foreach ($requiredFields as $field) {
                        if (empty($item[$field])) {
                            $errors[] = "Dòng " . ($index + 1) . ": Thiếu trường bắt buộc '{$field}'";
                            $valid = false;
                            break;
                        }
                    }
                    if (!$valid) continue;

                    // Enforce required fields
                    $director = trim((string)($item['director'] ?? ''));
                    $cast = trim((string)($item['cast'] ?? ''));
                    if ($director === '' || $cast === '') {
                        $errors[] = "Dòng " . ($index + 1) . ": Phim '{$item['title']}' thiếu đạo diễn hoặc diễn viên";
                        continue;
                    }
                    
                    if (!isset($item['status'])) {
                        $item['status'] = 'Coming Soon';
                    }

                    $item['director'] = $director;
                    $item['cast'] = $cast;
                    
                    if (isset($item['duration'])) {
                        $item['duration'] = (int)$item['duration'];
                    }

                    $movieId = $this->movieModel->create($item);
                    if ($movieId) {
                        $successCount++;
                    } else {
                        $errors[] = "Dòng " . ($index + 1) . ": Không thể lưu phim '{$item['title']}'";
                    }
                } catch (Exception $e) {
                    $errors[] = "Dòng " . ($index + 1) . ": Lỗi khi lưu phim '{$item['title']}' - " . $e->getMessage();
                }
            }

            return Response::success([
                'message' => "Import hoàn tất: Thành công $successCount, Thất bại " . count($errors),
                'success_count' => $successCount,
                'errors' => $errors
            ], 200);

        } catch (Exception $e) {
            error_log("MovieController Import Error: " . $e->getMessage());
            return Response::error('Lỗi khi import danh sách phim', 500);
        }
    }

    /**
     * PUT /api/movies/{id}
     * Cập nhật phim
     * Authorization: Admin/Manager only
     */
    public function update($id)
    {
        try {
            // Check permission
            AuthMiddleware::requirePermission('movies.update');

            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            // Check if movie exists
            $existingMovie = $this->movieModel->getById($id);
            if (!$existingMovie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            // Get request body
            $input = json_decode(file_get_contents('php://input'), true);

            // Validate required fields
            $requiredFields = ['title', 'duration', 'release_date', 'origin', 'status'];
            foreach ($requiredFields as $field) {
                if (empty($input[$field])) {
                    return Response::error("Thiếu trường bắt buộc: {$field}", 400);
                }
            }

            // Validate duration
            if ($input['duration'] <= 0) {
                return Response::error('Thời lượng phim phải lớn hơn 0', 400);
            }

            // Validate age_rating - must match ENUM in database
            $validAgeRatings = ['P', 'K', 'T13', 'T16', 'T18', 'C'];
            if (isset($input['age_rating']) && !in_array($input['age_rating'], $validAgeRatings)) {
                return Response::error('Phân loại độ tuổi không hợp lệ', 400);
            }

            // Business rule: Không cho đổi sang C nếu còn suất chiếu tương lai hoặc vé chưa dùng.
            $currentAgeRating = strtoupper(trim((string) ($existingMovie['age_rating'] ?? '')));
            $newAgeRating = strtoupper(trim((string) ($input['age_rating'] ?? $existingMovie['age_rating'] ?? '')));
            if ($newAgeRating === 'C' && $currentAgeRating !== 'C') {
                $blockingStats = $this->movieModel->getRestrictionBlockingStats((int) $id);
                $futureShowtimesCount = (int) ($blockingStats['future_showtimes_count'] ?? 0);
                $unconsumedTicketsCount = (int) ($blockingStats['unconsumed_tickets_count'] ?? 0);

                if ($futureShowtimesCount > 0 || $unconsumedTicketsCount > 0) {
                    return Response::error(
                        "Không thể đổi phim sang C vì còn {$futureShowtimesCount} suất chiếu tương lai và {$unconsumedTicketsCount} vé chưa dùng. Vui lòng xử lý suất chiếu/vé trước.",
                        409
                    );
                }
            }

            // Business rule: Không chuyển status sang Ended nếu còn suất chiếu tương lai
            $currentStatus = $existingMovie['status'];
            $newStatus = $input['status'] ?? $currentStatus;
            
            if ($newStatus === 'Ended' && $currentStatus !== 'Ended') {
                $futureCount = $this->movieModel->countFutureShowtimes($id);
                if ($futureCount > 0) {
                    return Response::error("Không thể chuyển trạng thái sang 'Ended' vì còn $futureCount suất chiếu trong tương lai. Vui lòng hủy các suất chiếu trước.", 409);
                }
            }


            // Validate genre_ids if provided
            if (isset($input['genre_ids']) && is_array($input['genre_ids'])) {
                foreach ($input['genre_ids'] as $genreId) {
                    if (!$this->genreModel->getById($genreId)) {
                        return Response::error("Thể loại ID {$genreId} không tồn tại", 400);
                    }
                }
            }

            // Update movie
            $result = $this->movieModel->update($id, $input);

            if (!$result) {
                return Response::error('Không thể cập nhật phim', 500);
            }

            // Get updated movie
            $movie = $this->movieModel->getById($id);

            return Response::success([
                'message' => 'Cập nhật phim thành công',
                'movie' => $movie
            ]);
        } catch (Exception $e) {
            error_log("MovieController Update Error: " . $e->getMessage());
            return Response::error('Lỗi khi cập nhật phim', 500);
        }
    }

    /**
     * DELETE /api/movies/{id}
     * Xóa phim (soft delete)
     * Authorization: Admin only
     */
    public function delete($id)
    {
        try {
            // Check permission
            AuthMiddleware::requirePermission('movies.delete');

            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            // Check if movie exists
            $movie = $this->movieModel->getById($id);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            // Kiểm tra có suất chiếu từ hôm nay trở đi không
            $futureCount = $this->movieModel->countFutureShowtimes($id);
            if ($futureCount > 0) {
                return Response::error(
                    "Không thể xóa phim này vì còn $futureCount suất chiếu từ hôm nay trở đi. Vui lòng hủy các suất chiếu trước.",
                    400
                );
            }

            // Soft delete - set status to 'Deleted'
            $result = $this->movieModel->delete($id);

            if (!$result) {
                return Response::error('Không thể xóa phim', 500);
            }

            return Response::success([
                'message' => 'Xóa phim thành công',
                'movie_id' => $id
            ]);
        } catch (Exception $e) {
            error_log("MovieController Delete Error: " . $e->getMessage());
            return Response::error('Lỗi khi xóa phim', 500);
        }
    }

    /**
     * POST /api/movies/{id}/poster
     * Upload poster cho phim
     * Authorization: Admin/Manager only
     */
    public function uploadPoster($id)
    {
        try {
            // Check permission
            AuthMiddleware::requirePermission('movies.upload_poster');

            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            // Check if movie exists
            $movie = $this->movieModel->getById($id);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            // Check if file was uploaded
            if (!isset($_FILES['poster']) || $_FILES['poster']['error'] !== UPLOAD_ERR_OK) {
                return Response::error('Không có file được upload hoặc có lỗi xảy ra', 400);
            }

            $file = $_FILES['poster'];

            // Validate file type
            $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!in_array($file['type'], $allowedTypes)) {
                return Response::error('Chỉ chấp nhận file ảnh (JPEG, PNG, WebP)', 400);
            }

            // Validate file size (max 5MB)
            $maxSize = 5 * 1024 * 1024; // 5MB
            if ($file['size'] > $maxSize) {
                return Response::error('Kích thước file không được vượt quá 5MB', 400);
            }

            $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $filename = 'movie_' . $id . '_' . time() . '.' . $extension;
            $posterUrl = null;

            // Try Cloudinary first when enabled/configured.
            $cloudinaryUrl = CloudinaryUploader::uploadImage(
                $file['tmp_name'],
                'movie_' . $id . '_' . time(),
                'movies/posters'
            );

            if (!empty($cloudinaryUrl)) {
                $posterUrl = $cloudinaryUrl;
            } else {
                // Fallback to local storage
                $uploadDir = __DIR__ . '/../uploads/posters/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0777, true);
                }

                $uploadPath = $uploadDir . $filename;
                if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                    return Response::error('Không thể lưu file', 500);
                }

                $posterUrl = 'uploads/posters/' . $filename;
            }

            $result = $this->movieModel->uploadPoster($id, $posterUrl);

            if (!$result) {
                if (isset($uploadPath) && file_exists($uploadPath)) {
                    unlink($uploadPath);
                }
                return Response::error('Không thể cập nhật poster URL', 500);
            }

            return Response::success([
                'message' => 'Upload poster thành công',
                'poster_url' => $posterUrl
            ]);
        } catch (Exception $e) {
            error_log("MovieController UploadPoster Error: " . $e->getMessage());
            return Response::error('Lỗi khi upload poster', 500);
        }
    }

    /**
     * POST /api/movies/{id}/upload-poster-from-url
     * Upload poster từ URL
     * Authorization: Admin/Manager only
     */
    public function uploadPosterFromUrl($id)
    {
        try {
            if (!$this->isAdminOrManager()) {
                return Response::error('Không có quyền truy cập', 403);
            }

            if (!$id || !is_numeric($id)) {
                return Response::error('ID phim không hợp lệ', 400);
            }

            $movie = $this->movieModel->getById($id);
            if (!$movie) {
                return Response::error('Không tìm thấy phim', 404);
            }

            $input = json_decode(file_get_contents('php://input'), true);
            $sourceUrl = trim((string)($input['image_url'] ?? ''));
            if ($sourceUrl === '') {
                return Response::error('Thiếu image_url', 400);
            }

            $cloudinaryUrl = CloudinaryUploader::uploadImageFromUrl(
                $sourceUrl,
                'movie_' . $id . '_' . time(),
                'movies/posters'
            );

            // If Cloudinary is disabled/not configured, keep original URL.
            $posterUrl = $cloudinaryUrl ?: $sourceUrl;

            $result = $this->movieModel->uploadPoster($id, $posterUrl);
            if (!$result) {
                return Response::error('Không thể cập nhật poster URL', 500);
            }

            return Response::success([
                'message' => 'Upload poster từ URL thành công',
                'poster_url' => $posterUrl,
            ]);
        } catch (Exception $e) {
            error_log('MovieController uploadPosterFromUrl Error: ' . $e->getMessage());
            return Response::error('Lỗi khi upload poster từ URL', 500);
        }
    }
}

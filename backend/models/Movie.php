<?php
require_once __DIR__ . '/../config/Database.php';

/**
 * Movie Model
 * Phụ trách: TUẤN TÀI
 */
class Movie {
    private $db;
    private $table = 'movies';
    
    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }
    
    /**
     * Lấy danh sách phim với filter và pagination
     * @param array $filters - status, origin, genre_id
     * @param int $page
     * @param int $limit
     * @return array
     */
    public function getAll($filters = [], $page = 1, $limit = 20) {
        try {
            $offset = ($page - 1) * $limit;
            
            $query = "SELECT m.id, m.title, m.description, m.duration_minutes as duration,
                      m.release_date, m.poster_url, m.trailer_url, m.age_rating,
                      m.origin, m.status, m.director, m.cast, m.created_at, m.updated_at,
                      (SELECT COUNT(*) FROM showtimes s WHERE s.movie_id = m.id AND s.start_time >= CURDATE()) as active_showtimes_count,
                      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') as genres,
                      AVG(r.rating) as avg_rating,
                      COUNT(DISTINCT r.id) as review_count
                      FROM {$this->table} m
                      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
                      LEFT JOIN genres g ON mg.genre_id = g.id
                      LEFT JOIN reviews r ON m.id = r.movie_id
                      WHERE 1=1";
            
            $params = [];
            
            // Filter by status
            if (!empty($filters['status'])) {
                $query .= " AND m.status = :status";
                $params[':status'] = $filters['status'];
            }
            
            // Filter by origin
            if (!empty($filters['origin'])) {
                $query .= " AND m.origin = :origin";
                $params[':origin'] = $filters['origin'];
            }
            
            // Filter by genre
            if (!empty($filters['genre_id'])) {
                $query .= " AND mg.genre_id = :genre_id";
                $params[':genre_id'] = $filters['genre_id'];
            }
            
            // Search by title
            if (!empty($filters['search'])) {
                $query .= " AND m.title LIKE :search";
                $params[':search'] = '%' . $filters['search'] . '%';
            }
            
            $query .= " GROUP BY m.id, m.title, m.description, m.duration_minutes,
                       m.release_date, m.poster_url, m.trailer_url, m.age_rating,
                       m.origin, m.status, m.director, m.cast, m.created_at, m.updated_at
                       ORDER BY m.release_date DESC
                       LIMIT :limit OFFSET :offset";
            
            $stmt = $this->db->prepare($query);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            
            $stmt->execute();
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("Movie GetAll Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Đếm tổng số phim theo filter
     */
    public function count($filters = []) {
        try {
            $query = "SELECT COUNT(DISTINCT m.id) as total
                      FROM {$this->table} m
                      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
                      WHERE 1=1";
            
            $params = [];
            
            if (!empty($filters['status'])) {
                $query .= " AND m.status = :status";
                $params[':status'] = $filters['status'];
            }
            
            if (!empty($filters['origin'])) {
                $query .= " AND m.origin = :origin";
                $params[':origin'] = $filters['origin'];
            }
            
            if (!empty($filters['genre_id'])) {
                $query .= " AND mg.genre_id = :genre_id";
                $params[':genre_id'] = $filters['genre_id'];
            }
            
            if (!empty($filters['search'])) {
                $query .= " AND m.title LIKE :search";
                $params[':search'] = '%' . $filters['search'] . '%';
            }
            
            $stmt = $this->db->prepare($query);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return $result['total'] ?? 0;
            
        } catch (PDOException $e) {
            error_log("Movie Count Error: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * Lấy chi tiết phim theo ID (join với genres)
     */
    public function getById($id) {
        try {
            $query = "SELECT m.id, m.title, m.description, m.duration_minutes as duration,
                      m.release_date, m.poster_url, m.trailer_url, m.age_rating,
                      m.origin, m.status, m.director, m.cast, m.created_at, m.updated_at,
                      (SELECT COUNT(*) FROM showtimes s WHERE s.movie_id = m.id AND s.start_time >= CURDATE()) as active_showtimes_count,
                      GROUP_CONCAT(DISTINCT g.id ORDER BY g.name) as genre_ids,
                      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') as genres,
                      AVG(r.rating) as avg_rating,
                      COUNT(DISTINCT r.id) as review_count
                      FROM {$this->table} m
                      LEFT JOIN movie_genres mg ON m.id = mg.movie_id
                      LEFT JOIN genres g ON mg.genre_id = g.id
                      LEFT JOIN reviews r ON m.id = r.movie_id
                      WHERE m.id = :id
                      GROUP BY m.id
                      LIMIT 1";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();
            
            return $stmt->fetch(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("Movie GetById Error: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Tạo phim mới
     */
    public function create($data) {
        try {
            $this->db->beginTransaction();
            
            $query = "INSERT INTO {$this->table} 
                      (title, description, duration_minutes, release_date, 
                       poster_url, trailer_url, age_rating, origin, status, director, cast) 
                      VALUES 
                      (:title, :description, :duration, :release_date, 
                       :poster_url, :trailer_url, :age_rating, :origin, :status, :director, :cast)";
            
            $stmt = $this->db->prepare($query);
            
            $stmt->bindParam(':title', $data['title']);
            $stmt->bindParam(':description', $data['description']);
            $stmt->bindParam(':duration', $data['duration'], PDO::PARAM_INT);
            $stmt->bindParam(':release_date', $data['release_date']);
            $stmt->bindParam(':poster_url', $data['poster_url']);
            $stmt->bindParam(':trailer_url', $data['trailer_url']);
            $stmt->bindParam(':age_rating', $data['age_rating']);
            $stmt->bindParam(':origin', $data['origin']);
            
            $status = $data['status'] ?? 'Coming Soon';
            $stmt->bindParam(':status', $status);
            
            $director = $data['director'] ?? null;
            $stmt->bindParam(':director', $director);
            
            $cast = $data['cast'] ?? null;
            $stmt->bindParam(':cast', $cast);
            
            $stmt->execute();
            $movieId = $this->db->lastInsertId();
            
            // Thêm genres nếu có
            if (!empty($data['genre_ids']) && is_array($data['genre_ids'])) {
                $this->addGenres($movieId, $data['genre_ids']);
            }
            
            $this->db->commit();
            return $movieId;
            
        } catch (PDOException $e) {
            $this->db->rollBack();
            error_log("Movie Create Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Cập nhật phim
     */
    public function update($id, $data) {
        try {
            $this->db->beginTransaction();
            
            $query = "UPDATE {$this->table} SET 
                      title = :title,
                      description = :description,
                      duration_minutes = :duration,
                      release_date = :release_date,
                      poster_url = :poster_url,
                      trailer_url = :trailer_url,
                      age_rating = :age_rating,
                      origin = :origin,
                      status = :status,
                      director = :director,
                      cast = :cast,
                      updated_at = CURRENT_TIMESTAMP
                      WHERE id = :id";
            
            $stmt = $this->db->prepare($query);
            
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->bindParam(':title', $data['title']);
            $stmt->bindParam(':description', $data['description']);
            $stmt->bindParam(':duration', $data['duration'], PDO::PARAM_INT);
            $stmt->bindParam(':release_date', $data['release_date']);
            $stmt->bindParam(':poster_url', $data['poster_url']);
            $stmt->bindParam(':trailer_url', $data['trailer_url']);
            $stmt->bindParam(':age_rating', $data['age_rating']);
            $stmt->bindParam(':origin', $data['origin']);
            $stmt->bindParam(':status', $data['status']);
            
            $director = $data['director'] ?? null;
            $stmt->bindParam(':director', $director);
            
            $cast = $data['cast'] ?? null;
            $stmt->bindParam(':cast', $cast);
            
            $result = $stmt->execute();
            
            // Cập nhật genres nếu có
            if (isset($data['genre_ids']) && is_array($data['genre_ids'])) {
                // Xóa genres cũ
                $deleteQuery = "DELETE FROM movie_genres WHERE movie_id = :movie_id";
                $deleteStmt = $this->db->prepare($deleteQuery);
                $deleteStmt->bindParam(':movie_id', $id, PDO::PARAM_INT);
                $deleteStmt->execute();
                
                // Thêm genres mới
                if (!empty($data['genre_ids'])) {
                    $this->addGenres($id, $data['genre_ids']);
                }
            }
            
            $this->db->commit();
            return $result;
            
        } catch (PDOException $e) {
            $this->db->rollBack();
            error_log("Movie Update Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Xóa phim (hard delete - xóa hẳn khỏi database)
     */
    public function delete($id) {
        try {
            // Hard delete - remove completely
            $query = "DELETE FROM {$this->table} WHERE id = :id";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("Movie Delete Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Đếm số suất chiếu từ hôm nay trở đi của phim
     * @param int $id
     * @return int
     */
    public function countFutureShowtimes($id) {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS cnt FROM showtimes
             WHERE movie_id = :movie_id AND DATE(start_time) >= CURDATE()"
        );
        $stmt->execute([':movie_id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($row['cnt'] ?? 0);
    }

    /**
     * Thêm genre cho phim
     */
    public function addGenre($movieId, $genreId) {
        try {
            $query = "INSERT INTO movie_genres (movie_id, genre_id) 
                      VALUES (:movie_id, :genre_id)
                      ON DUPLICATE KEY UPDATE movie_id = movie_id";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':movie_id', $movieId, PDO::PARAM_INT);
            $stmt->bindParam(':genre_id', $genreId, PDO::PARAM_INT);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("Movie AddGenre Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Thêm nhiều genres cho phim
     */
    private function addGenres($movieId, $genreIds) {
        foreach ($genreIds as $genreId) {
            $this->addGenre($movieId, $genreId);
        }
    }
    
    /**
     * Lấy phim với danh sách thể loại
     */
    public function getWithGenres() {
        return $this->getAll();
    }
    
    /**
     * Tính rating trung bình của phim
     */
    public function calculateAverageRating($movieId) {
        try {
            $query = "SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews
                      FROM reviews
                      WHERE movie_id = :movie_id AND status = 'Approved'";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':movie_id', $movieId, PDO::PARAM_INT);
            $stmt->execute();
            
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            return [
                'avg_rating' => round($result['avg_rating'] ?? 0, 1),
                'total_reviews' => $result['total_reviews'] ?? 0
            ];
            
        } catch (PDOException $e) {
            error_log("Movie CalculateAverageRating Error: " . $e->getMessage());
            return ['avg_rating' => 0, 'total_reviews' => 0];
        }
    }
    
    /**
     * Lấy showtimes của phim
     */
    public function getShowtimes($movieId, $filters = []) {
        try {
            $query = "SELECT s.*, 
                      ch.name as hall_name, 
                      c.name as cinema_name,
                      c.address as cinema_location,
                      c.street as cinema_street,
                      c.district as cinema_district,
                      c.city as cinema_city
                      FROM showtimes s
                      INNER JOIN cinema_halls ch ON s.cinema_hall_id = ch.id
                      INNER JOIN cinemas c ON ch.cinema_id = c.id
                      WHERE s.movie_id = :movie_id";
            
            $params = [':movie_id' => $movieId];
            
            // Filter by date
            if (!empty($filters['date'])) {
                $query .= " AND DATE(s.start_time) = :date";
                $params[':date'] = $filters['date'];
            }
            
            // Filter by cinema
            if (!empty($filters['cinema_id'])) {
                $query .= " AND c.id = :cinema_id";
                $params[':cinema_id'] = $filters['cinema_id'];
            }
            
            $query .= " ORDER BY s.start_time ASC";
            
            $stmt = $this->db->prepare($query);
            
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            
            $stmt->execute();
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("Movie GetShowtimes Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Lấy reviews của phim
     */
    public function getReviews($movieId, $page = 1, $limit = 10) {
        try {
            $offset = ($page - 1) * $limit;
            
            $query = "SELECT r.*, 
                      u.email,
                      up.full_name,
                      up.avatar
                      FROM reviews r
                      INNER JOIN users u ON r.user_id = u.id
                      LEFT JOIN user_profiles up ON u.id = up.user_id
                      WHERE r.movie_id = :movie_id AND r.status = 'Approved'
                      ORDER BY r.created_at DESC
                      LIMIT :limit OFFSET :offset";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':movie_id', $movieId, PDO::PARAM_INT);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            
            $stmt->execute();
            
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
            
        } catch (PDOException $e) {
            error_log("Movie GetReviews Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Upload poster cho phim
     */
    public function uploadPoster($id, $posterUrl) {
        try {
            $query = "UPDATE {$this->table} SET 
                      poster_url = :poster_url,
                      updated_at = CURRENT_TIMESTAMP
                      WHERE id = :id";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->bindParam(':poster_url', $posterUrl);
            
            return $stmt->execute();
            
        } catch (PDOException $e) {
            error_log("Movie UploadPoster Error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Lấy số lượng dữ liệu đang chặn khi muốn đổi phim sang phân loại C.
     * - future_showtimes_count: số suất chiếu trong tương lai
     * - unconsumed_tickets_count: số vé chưa sử dụng (HOLDING/SOLD) của các suất tương lai
     */
    public function getRestrictionBlockingStats($movieId) {
        try {
            $stats = [
                'future_showtimes_count' => 0,
                'unconsumed_tickets_count' => 0,
            ];

            $showtimeQuery = "SELECT COUNT(*) as total
                             FROM showtimes
                             WHERE movie_id = :movie_id
                               AND start_time > NOW()";
            $showtimeStmt = $this->db->prepare($showtimeQuery);
            $showtimeStmt->bindParam(':movie_id', $movieId, PDO::PARAM_INT);
            $showtimeStmt->execute();
            $showtimeResult = $showtimeStmt->fetch(PDO::FETCH_ASSOC);
            $stats['future_showtimes_count'] = (int) ($showtimeResult['total'] ?? 0);

            $ticketQuery = "SELECT COUNT(*) as total
                           FROM tickets t
                           INNER JOIN bookings b ON t.booking_id = b.id
                           INNER JOIN showtimes s ON b.showtime_id = s.id
                           WHERE s.movie_id = :movie_id
                             AND s.start_time > NOW()
                             AND t.status IN ('HOLDING', 'SOLD')";
            $ticketStmt = $this->db->prepare($ticketQuery);
            $ticketStmt->bindParam(':movie_id', $movieId, PDO::PARAM_INT);
            $ticketStmt->execute();
            $ticketResult = $ticketStmt->fetch(PDO::FETCH_ASSOC);
            $stats['unconsumed_tickets_count'] = (int) ($ticketResult['total'] ?? 0);

            return $stats;
        } catch (PDOException $e) {
            error_log("Movie getRestrictionBlockingStats Error: " . $e->getMessage());
            return [
                'future_showtimes_count' => 0,
                'unconsumed_tickets_count' => 0,
            ];
        }
    }
}

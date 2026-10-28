<?php
/** Read-only, bounded snapshots; no passwords, phone numbers or emails leave PHP. */
class AIData {
    private $db;
    public function __construct($db) { $this->db = $db; }

    public function movies(): array {
        return $this->db->query("SELECT m.*,
            (SELECT GROUP_CONCAT(g.name SEPARATOR ' ') FROM genres g JOIN movie_genres mg ON mg.genre_id=g.id WHERE mg.movie_id=m.id) AS genres,
            (SELECT COUNT(*) FROM tickets t JOIN bookings b ON b.id=t.booking_id JOIN showtimes s ON s.id=b.showtime_id
                WHERE s.movie_id=m.id AND t.status IN ('SOLD','USED') AND b.status='Paid') AS popularity,
            EXISTS(SELECT 1 FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id JOIN cinemas c ON c.id=h.cinema_id
                WHERE s.movie_id=m.id AND s.start_time>NOW() AND LOWER(c.status)='active') AS bookable
            FROM movies m WHERE m.age_rating<>'C' ORDER BY m.id DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
    }

    public function cinemas(): array {
        return $this->db->query("SELECT id,name,address FROM cinemas WHERE LOWER(status)='active' ORDER BY name LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
    }

    public function profileAge(int $userId): ?int {
        if (!$userId) return null;
        $stmt = $this->db->prepare('SELECT dob FROM user_profiles WHERE user_id=?');
        $stmt->execute([$userId]); $dob = $stmt->fetchColumn();
        if (!$dob) return null;
        try { $date = new DateTime($dob); return $date <= new DateTime() ? (new DateTime())->diff($date)->y : null; }
        catch (Exception $e) { return null; }
    }

    public function snapshot(int $userId, int $seed, int $limit, ?int $cinemaId = null): array {
        $movies = $this->movies(); $age = $this->profileAge($userId);
        $cinemaMovies = null;
        if ($cinemaId) {
            $stmt = $this->db->prepare('SELECT DISTINCT s.movie_id FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id WHERE h.cinema_id=? AND s.start_time>NOW()');
            $stmt->execute([$cinemaId]);
            $cinemaMovies = array_fill_keys(array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN)), true);
        }
        $ageLimits = ['P'=>0, 'K'=>0, 'T13'=>13, 'T16'=>16, 'T18'=>18, 'C'=>PHP_INT_MAX];
        foreach ($movies as &$movie) {
            $movie['bookable'] = (bool)$movie['bookable'] && $movie['status'] !== 'Ended' && ($age === null || $age >= ($ageLimits[$movie['age_rating']] ?? PHP_INT_MAX));
            if ($cinemaMovies !== null) $movie['bookable'] = $movie['bookable'] && isset($cinemaMovies[(int)$movie['id']]);
        }
        unset($movie);
        $events = $this->db->query("SELECT b.user_id,s.movie_id,COUNT(*) AS weight FROM bookings b
            JOIN showtimes s ON s.id=b.showtime_id JOIN tickets t ON t.booking_id=b.id
            WHERE b.user_id IS NOT NULL AND b.status='Paid' AND t.status IN ('SOLD','USED')
              AND b.created_at>=DATE_SUB(NOW(), INTERVAL 180 DAY)
            GROUP BY b.user_id,s.movie_id ORDER BY MAX(b.created_at) DESC LIMIT 10000")->fetchAll(PDO::FETCH_ASSOC);
        $query = "SELECT c.id,c.name,c.price,c.image_url,c.category,
            COALESCE((SELECT SUM(bc.quantity) FROM booking_concessions bc JOIN bookings b ON b.id=bc.booking_id WHERE bc.concession_id=c.id AND b.status='Paid'),0) AS popularity,
            COALESCE((SELECT SUM(bc.quantity) FROM booking_concessions bc JOIN bookings b ON b.id=bc.booking_id WHERE bc.concession_id=c.id AND b.status='Paid' AND b.user_id=?),0) AS affinity
            FROM concessions c WHERE c.is_available=1 AND EXISTS(SELECT 1 FROM cinema_concession_inventory i WHERE i.concession_id=c.id AND i.quantity>0";
        $params = [$userId];
        if ($cinemaId) { $query .= ' AND i.cinema_id=?'; $params[]=$cinemaId; }
        $query .= ') ORDER BY c.id LIMIT 200';
        $stmt=$this->db->prepare($query); $stmt->execute($params);
        return ['movies'=>$movies,'interactions'=>$events,'concessions'=>$stmt->fetchAll(PDO::FETCH_ASSOC),
            'user_id'=>$userId,'movie_id'=>$seed,'limit'=>$limit];
    }

    public function forecastSnapshot(int $cinemaId, array $movies, string $startDate): array {
        $stmt=$this->db->prepare("SELECT s.movie_id,WEEKDAY(s.start_time) AS weekday,FLOOR(HOUR(s.start_time)/3)*3 AS hour,
            (SELECT COUNT(*) FROM seats se WHERE se.cinema_hall_id=s.cinema_hall_id AND se.status<>'Inactive') AS capacity,
            (SELECT COUNT(*) FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.showtime_id=s.id AND t.status IN ('SOLD','USED') AND b.status='Paid') AS sold
            FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id
            WHERE h.cinema_id=? AND s.end_time<NOW() AND s.start_time>=DATE_SUB(NOW(),INTERVAL 180 DAY)
            ORDER BY s.start_time DESC LIMIT 10000");
        $stmt->execute([$cinemaId]); $candidates=[];
        for ($day=0;$day<7;$day++) {
            $date=(new DateTime($startDate))->modify("+$day days");
            foreach (array_slice($movies,0,500) as $movie) {
                for ($hour=0;$hour<24;$hour+=3) $candidates[]=['movie_id'=>(int)$movie['id'],'date'=>$date->format('Y-m-d'),'weekday'=>(int)$date->format('N')-1,'hour'=>$hour];
            }
        }
        return ['history'=>$stmt->fetchAll(PDO::FETCH_ASSOC),'candidates'=>$candidates];
    }
}

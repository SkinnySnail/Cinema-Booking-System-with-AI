<?php
class AIController extends BaseController {
    private $db;
    private $data;
    private $client;
    public function __construct() {
        $this->db=Database::getInstance()->getConnection();
        $this->data=new AIData($this->db); $this->client=new AIClient();
    }
    private function viewer(): int {
        // Guest query/form fields must never impersonate an authenticated viewer.
        unset($_REQUEST['auth_user_id'], $_REQUEST['auth_user_role'], $_REQUEST['auth_user_role_id'], $_REQUEST['auth_role_id']);
        $headers=getallheaders();
        if (!empty($headers['Authorization'] ?? $headers['authorization'] ?? '')) AuthMiddleware::authenticate();
        AuthMiddleware::requirePermission('movies.view');
        return (int)($_REQUEST['auth_user_id'] ?? 0);
    }
    public function recommendations() {
        $uid=$this->viewer();
        $limit=max(1,min(12,(int)($_GET['limit'] ?? 6)));
        Response::success($this->recommend($uid,(int)($_GET['movie_id'] ?? 0),$limit,isset($_GET['cinema_id'])?(int)$_GET['cinema_id']:null));
    }
    private function recommend(int $uid,int $seed=0,int $limit=6,?int $cinemaId=null): array {
        $snapshot=$this->data->snapshot($uid,$seed,$limit,$cinemaId);
        try { $result=$this->client->request('/recommendations',$snapshot); $available=true; }
        catch (Exception $e) {
            $available=false; $fallback=array_values(array_filter($snapshot['movies'],fn($m)=>$m['bookable'] && (int)$m['id']!==$seed));
            usort($fallback,fn($a,$b)=>(int)$b['popularity']<=>(int)$a['popularity']);
            $result=['movies'=>array_map(fn($m)=>['id'=>$m['id'],'reason'=>'Phim đang có lịch chiếu'],array_slice($fallback,0,$limit)),
                'concessions'=>[],'mode'=>'popular_fallback'];
        }
        $catalog=array_column($snapshot['movies'],null,'id'); $items=[];
        foreach ($result['movies'] ?? [] as $rank) {
            $movie=$catalog[(int)$rank['id']] ?? null;
            if (!$movie || !$movie['bookable']) continue;
            $items[]=array_intersect_key($movie,array_flip(['id','title','poster_url','genres','age_rating','duration_minutes','description']))
                + ['reason'=>$rank['reason'] ?? 'Gợi ý cho bạn','score'=>$rank['score'] ?? null];
        }
        $concessions=array_column($snapshot['concessions'],null,'id'); $combos=[];
        foreach ($result['concessions'] ?? [] as $rank) {
            if(isset($concessions[(int)$rank['id']])) $combos[]=$concessions[(int)$rank['id']]+['reason'=>$rank['reason']];
        }
        return ['movies'=>$items,'concessions'=>$combos,'mode'=>$result['mode'] ?? 'hybrid','ai_available'=>$available,
            'model'=>$result['model'] ?? $result['mode'] ?? null];
    }

    private function chatSentiment(string $text): array {
        if ($text === '') {
            return ['reply'=>'Hãy nhập nội dung sau “Phân tích bình luận:” để mình đọc cảm xúc.'];
        }
        try {
            $result = $this->client->request('/sentiment', ['reviews'=>[['id'=>0,'text'=>$text]]]);
        } catch (Exception $e) {
            return ['reply'=>'Hiện chưa thể phân tích cảm xúc. Bạn thử lại sau nhé.', 'ai_available'=>false];
        }
        $item = $result['items'][0];
        $labels = ['positive'=>'tích cực', 'neutral'=>'trung tính', 'negative'=>'tiêu cực'];
        $label = $labels[$item['label']] ?? $item['label'];
        $confidence = number_format((float)$item['confidence'] * 100, 1, ',', '.');
        $reply = "Bình luận có cảm xúc {$label}. Độ tin cậy của model là {$confidence}%.";
        if ($item['needs_review']) $reply .= ' Kết quả có độ tin cậy thấp, bạn nên đọc lại ngữ cảnh.';
        return ['reply'=>$reply, 'model'=>$result['model']];
    }

    private function chatForecast(int $cinemaId, array $shows, string $day): array {
        $candidates = [];
        foreach ($shows as $show) {
            $time = new DateTimeImmutable($show['start_time']);
            $candidates[] = ['movie_id'=>(int)$show['movie_id'], 'date'=>$day,
                'weekday'=>(int)$time->format('N') - 1, 'hour'=>intdiv((int)$time->format('G'), 3) * 3];
        }
        try {
            $result = $this->client->request('/forecast', ['cinema_id'=>$cinemaId,
                'history'=>$this->data->forecastHistory($cinemaId), 'candidates'=>$candidates]);
        } catch (Exception $e) {
            return ['reply'=>'Hiện chưa thể dự báo nhu cầu. Bạn vẫn có thể xem lịch chiếu.', 'ai_available'=>false];
        }
        if (($result['mode'] ?? '') === 'smoothed_prior') {
            return ['reply'=>'Rạp chưa có đủ lịch sử vé để dự báo đáng tin cậy cho các suất này.', 'model'=>'insufficient_history'];
        }
        $ranked = [];
        foreach ($shows as $index => $show) {
            if (!isset($result['items'][$index]['occupancy'])) continue;
            $ranked[] = ['show'=>$show, 'occupancy'=>(float)$result['items'][$index]['occupancy']];
        }
        usort($ranked, fn($a, $b) => ($b['occupancy'] <=> $a['occupancy']) ?: ($a['show']['start_time'] <=> $b['show']['start_time']));
        $links = [];
        foreach (array_slice($ranked, 0, 8) as $row) {
            $show = $row['show'];
            $percent = (int)round($row['occupancy'] * 100);
            $time = date('H:i', strtotime($show['start_time']));
            $links[] = ['label'=>"{$show['title']} · {$time} · dự kiến lấp đầy {$percent}%", 'url'=>'/movie/'.(int)$show['movie_id']];
        }
        $date = date('d/m', strtotime($day));
        return ['reply'=>"Các suất dự kiến đông nhất ngày {$date}. Tỷ lệ lấp đầy là ước tính từ lịch sử vé. Xem sơ đồ ghế để kiểm tra chỗ trống hiện tại.",
            'links'=>$links, 'model'=>$result['mode']];
    }

    public function chat() {
        $uid=$this->viewer(); $input=self::getRequestData();
        $message=is_string($input['message'] ?? null) ? trim($input['message']) : '';
        if (!preg_match('/^.{1,1000}$/us', $message)) Response::validationError(['message'=>'Nhập câu hỏi từ 1 đến 1000 ký tự.']);
        $movies=$this->data->movies(); $cinemas=$this->data->cinemas();
        try {
            $parsed=$this->client->request('/chat',['message'=>$message,'movies'=>array_map(fn($m)=>['id'=>(int)$m['id'],'title'=>$m['title']],$movies),
                'cinemas'=>$cinemas,'today'=>date('Y-m-d')]);
        } catch (Exception $e) {
            Response::success(['reply'=>'Trợ lý tạm thời chưa kết nối được. Bạn có thể tra lịch chiếu và đặt vé tại các mục bên dưới.',
                'links'=>[['label'=>'Lịch chiếu','url'=>'/schedule'],['label'=>'Danh sách phim','url'=>'/movies']],'ai_available'=>false]);
        }
        $context=is_array($input['context'] ?? null)?$input['context']:[];
        if (!empty($parsed['error'])) Response::success(['reply'=>$parsed['error'].'. Vui lòng nhập lại ngày.','links'=>[],'ai_available'=>true]);
        $movieIds=array_column($movies,'id'); $cinemaIds=array_column($cinemas,'id');
        $movieId=(int)($parsed['movie_id'] ?? $context['movie_id'] ?? 0);
        $cinemaId=(int)($parsed['cinema_id'] ?? $context['cinema_id'] ?? 0);
        if(!in_array($movieId,array_map('intval',$movieIds),true)) $movieId=0;
        if(!in_array($cinemaId,array_map('intval',$cinemaIds),true)) $cinemaId=0;
        $day=$parsed['date'] ?? date('Y-m-d');
        if (empty($parsed['date_explicit']) && !empty($context['date'])) $day=(string)$context['date'];
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$day)) $day=date('Y-m-d');
        $intent=$parsed['intent'] ?? 'unknown'; $links=[]; $reply='';
        $model=$parsed['intent_model'] ?? null; $available=true;
        if ($intent==='unknown' && ($movieId || $cinemaId || !empty($parsed['date_explicit']) || isset($parsed['hour']))) $intent='showtimes';
        if ($intent==='sentiment') {
            $result=$this->chatSentiment((string)($parsed['review_text'] ?? ''));
            $reply=$result['reply']; $model=$result['model'] ?? null; $available=$result['ai_available'] ?? true;
        } elseif ($intent==='forecast' && !$cinemaId) {
            $reply='Bạn muốn dự báo ở rạp nào? Ví dụ “Dự báo suất đông tại Galaxy Nguyễn Du tối nay”.';
        } elseif(in_array($intent,['showtimes','booking','forecast'],true)) {
            $sql="SELECT s.id,s.movie_id,s.start_time,m.title,c.name AS cinema_name FROM showtimes s
                JOIN movies m ON m.id=s.movie_id JOIN cinema_halls h ON h.id=s.cinema_hall_id JOIN cinemas c ON c.id=h.cinema_id
                WHERE s.start_time>NOW() AND DATE(s.start_time)=? AND m.age_rating<>'C' AND m.status<>'Ended' AND LOWER(c.status)='active'";
            $params=[$day];
            if($movieId){$sql.=' AND m.id=?';$params[]=$movieId;}
            if($cinemaId){$sql.=' AND c.id=?';$params[]=$cinemaId;}
            if(isset($parsed['hour'])){$sql.=' AND HOUR(s.start_time)=?';$params[]=(int)$parsed['hour'];}
            elseif(isset($parsed['min_hour'])){$sql.=' AND HOUR(s.start_time)>=?';$params[]=(int)$parsed['min_hour'];}
            $sql.=' ORDER BY s.start_time LIMIT '.($intent==='forecast' ? '100' : '8');
            $stmt=$this->db->prepare($sql);$stmt->execute($params);$shows=$stmt->fetchAll(PDO::FETCH_ASSOC);
            if ($intent==='forecast' && $shows) {
                $result=$this->chatForecast($cinemaId, $shows, $day);
                $reply=$result['reply']; $links=$result['links'] ?? [];
                $model=$result['model'] ?? null; $available=$result['ai_available'] ?? true;
            } else {
                $reply=$shows?'Các suất còn mở bán ngày '.date('d/m',strtotime($day)).':':'Chưa tìm thấy suất phù hợp ngày '.date('d/m',strtotime($day)).'. Bạn có thể đổi ngày, tên phim hoặc rạp.';
                foreach($shows as $show) $links[]=['label'=>$show['title'].' · '.$show['cinema_name'].' · '.date('H:i',strtotime($show['start_time'])),'url'=>'/movie/'.(int)$show['movie_id']];
                if($intent==='booking' && !$uid) $reply.=' Vui lòng đăng nhập trước khi chọn ghế và thanh toán.';
            }
            $links[]=['label'=>'Xem toàn bộ lịch chiếu','url'=>'/schedule'];
        } elseif($intent==='recommend') {
            $recommended=$this->recommend($uid,$movieId,6,$cinemaId ?: null);
            $reply=$recommended['movies'] ? 'Bạn có thể tham khảo các phim dưới đây. Mở phim để xem suất chiếu và chọn ghế.' : 'Chưa có phim phù hợp đang mở bán. Bạn có thể xem lại lịch chiếu sau.';
            $model=$recommended['model']; $available=$recommended['ai_available'];
            foreach($recommended['movies'] as $movie) $links[]=['label'=>$movie['title'].' — '.$movie['reason'],'url'=>'/movie/'.(int)$movie['id']];
        } elseif($intent==='cinemas') {
            $reply='Các rạp đang hoạt động:';
            foreach(array_slice($cinemas,0,8) as $cinema) $reply.="\n".$cinema['name'].' — '.$cinema['address'];
            $links[]=['label'=>'Xem bản đồ rạp','url'=>'/cinemas'];
        } elseif($intent==='concessions') {
            $reply='Bạn có thể chọn bắp, nước hoặc combo khi đặt vé. Giá và tồn kho hiện tại hiển thị tại thực đơn theo rạp.';
            $links[]=['label'=>'Xem thực đơn','url'=>'/concessions'];
        } elseif($intent==='loyalty') {
            $config=new SystemConfig();$rate=(int)$config->get('loyalty_points_rate',10000);
            $reply='Mỗi '.number_format($rate,0,',','.').'đ thanh toán hợp lệ tương ứng 1 điểm. Xem hạng, điểm và voucher trong hồ sơ; điều kiện đổi quà hiển thị trước khi xác nhận.';
            $links=[['label'=>'Điểm và voucher của tôi','url'=>$uid?'/profile':'/login'],['label'=>'Khuyến mãi hiện tại','url'=>'/promotions']];
        } elseif($intent==='payment') {
            $reply='Đặt vé trực tuyến hỗ trợ MoMo và VNPay. Tại quầy có thể thanh toán tiền mặt. Chỉ xác nhận thanh toán trên trang thanh toán chính thức; trợ lý không thu tiền hoặc xin mã OTP.';
            $links[]=['label'=>'Kiểm tra đơn của tôi','url'=>$uid?'/bookings':'/login'];
        } elseif($intent==='cancel') {
            $reply='Mở Lịch sử đặt vé để xem trạng thái và thao tác được phép với từng đơn. Việc hủy hoặc hoàn vé phải được xác nhận tại màn hình tương ứng; trợ lý chưa thay đổi đơn của bạn.';
            $links[]=['label'=>'Lịch sử đặt vé','url'=>$uid?'/bookings':'/login'];
        } else {
            $reply='Chào bạn! Mình hỗ trợ gợi ý phim, tìm lịch theo tên phim/rạp/ngày, hướng dẫn đặt vé, bắp nước và điểm thưởng. Thử: “Lịch chiếu ngày mai” hoặc “Tôi nên xem phim gì?”.';
        }
        Response::success(['reply'=>$reply,'links'=>$links,'intent'=>$intent,'ai_available'=>$available,
            'intent_model'=>$parsed['intent_model'] ?? null,'model'=>$model,
            'context'=>['movie_id'=>$movieId,'cinema_id'=>$cinemaId,'date'=>$day]]);
    }
    public function sentiments() {
        AuthMiddleware::requireManager(); AuthMiddleware::requirePermission('reviews.view_all');
        $input=self::getRequestData();
        if (!is_array($input['review_ids'] ?? null)) Response::validationError(['review_ids'=>'Danh sách đánh giá không hợp lệ.']);
        $ids=array_values(array_unique(array_filter(array_map('intval',$input['review_ids']),fn($id)=>$id>0)));
        if(!$ids || count($ids)>100) Response::validationError(['review_ids'=>'Chọn từ 1 đến 100 đánh giá.']);
        $params=$ids;$sql='SELECT r.id,r.comment AS text FROM reviews r WHERE r.id IN ('.implode(',',array_fill(0,count($ids),'?')).')';
        $isAdmin=(int)($_REQUEST['auth_user_role_id'] ?? 0)===5 || ($_REQUEST['auth_user_role'] ?? '')==='Admin';
        if(!$isAdmin){
            $sql.=' AND EXISTS(SELECT 1 FROM showtimes s JOIN cinema_halls h ON h.id=s.cinema_hall_id JOIN cinemas c ON c.id=h.cinema_id WHERE s.movie_id=r.movie_id AND (c.manager_id=? OR EXISTS(SELECT 1 FROM cinema_staff cs WHERE cs.cinema_id=c.id AND cs.user_id=?)))';
            $params[]=(int)$_REQUEST['auth_user_id'];$params[]=(int)$_REQUEST['auth_user_id'];
        }
        $stmt=$this->db->prepare($sql);$stmt->execute($params);$reviews=$stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach($reviews as &$review) {
            preg_match('/^.{0,5000}/us',(string)$review['text'],$match);
            $review['text']=$match[0] ?? '';
        }
        unset($review);
        try { Response::success($this->client->request('/sentiment',['reviews'=>$reviews])); }
        catch(Exception $e){Response::error('Chưa kết nối được dịch vụ phân tích cảm xúc. Vui lòng thử lại.',503);}
    }
}

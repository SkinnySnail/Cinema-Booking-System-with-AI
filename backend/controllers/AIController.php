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
    private function recommend(int $uid,int $seed=0,int $limit=6,?int $cinemaId=null,array $genreIds=[],array $excludedGenreIds=[],array $preferredGenreIds=[]): array {
        $snapshot=$this->data->snapshot($uid,$seed,$limit,$cinemaId);
        $preferenceApplied=false;
        if ($genreIds || $excludedGenreIds || $preferredGenreIds) {
            $genreMovies=[];
            $filterIds=array_values(array_unique(array_merge($genreIds,$excludedGenreIds,$preferredGenreIds)));
            $stmt=$this->db->prepare('SELECT movie_id,genre_id FROM movie_genres WHERE genre_id IN ('.implode(',',array_fill(0,count($filterIds),'?')).')');
            $stmt->execute($filterIds);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $genreMovies[(int)$row['movie_id']][]=(int)$row['genre_id'];
            foreach ($snapshot['movies'] as &$movie) {
                $assigned=$genreMovies[(int)$movie['id']] ?? [];
                $movie['bookable']=$movie['bookable'] && (!$genreIds || array_intersect($assigned,$genreIds)) && !array_intersect($assigned,$excludedGenreIds);
            }
            unset($movie);
            if (!$genreIds && $preferredGenreIds) {
                foreach ($snapshot['movies'] as $movie) {
                    if ($movie['bookable'] && (int)$movie['id']!==$seed && array_intersect($genreMovies[(int)$movie['id']] ?? [],$preferredGenreIds)) $preferenceApplied=true;
                }
                if ($preferenceApplied) {
                    foreach ($snapshot['movies'] as &$movie) {
                        $movie['bookable']=$movie['bookable'] && (bool)array_intersect($genreMovies[(int)$movie['id']] ?? [],$preferredGenreIds);
                    }
                    unset($movie);
                }
            }
        }
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
            'model'=>$result['model'] ?? $result['mode'] ?? null,'preference_applied'=>$preferenceApplied];
    }

    private function resolveChatMovie(array $parsed,array $context): int {
        return (int)($parsed['movie_id'] ?? (!empty($parsed['reset_movie_context']) ? 0 : ($context['movie_id'] ?? 0)));
    }

    private function coupleShowtimes(array $shows,array $preferredGenreIds,bool $explicitGenre): array {
        if (!$shows) {
            return ['shows'=>[], 'reply'=>'Chưa có suất đúng rạp, ngày và giờ bạn chọn cho buổi hẹn hò. Bạn có thể đổi ngày hoặc rạp.'];
        }
        if ($explicitGenre) {
            return ['shows'=>$shows,'reply'=>'Cho buổi hẹn hò, mình giữ đúng thể loại bạn yêu cầu.'];
        }
        $preferred=array_values(array_filter($shows,fn($show)=>array_intersect(
            array_map('intval',explode(',',(string)($show['genre_ids'] ?? ''))),$preferredGenreIds)));
        if ($preferred) {
            return ['shows'=>$preferred,'reply'=>'Nếu hai bạn muốn một buổi hẹn hò nhẹ nhàng, mình ưu tiên các phim tình cảm hoặc hài đang có suất phù hợp.'];
        }
        return ['shows'=>$shows,'reply'=>'Nếu hai bạn muốn không khí nhẹ nhàng, có thể ưu tiên phim tình cảm hoặc hài. Tuy nhiên, chưa có suất thuộc các thể loại này đúng rạp, ngày và giờ bạn chọn. Các lựa chọn khác còn mở bán ở dưới; hai bạn có thể cân nhắc theo sở thích chung.'];
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

    private function chatForecast(int $cinemaId, array $shows, string $day, ?string $until=null): array {
        $candidates = [];
        foreach ($shows as $show) {
            $time = new DateTimeImmutable($show['start_time']);
            $candidates[] = ['movie_id'=>(int)$show['movie_id'], 'date'=>$time->format('Y-m-d'),
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
            $dateLabel=$until && $until!==$day ? date('d/m',strtotime($show['start_time'])).' · ' : '';
            $links[] = ['label'=>"{$show['title']} · {$dateLabel}{$time} · dự kiến lấp đầy {$percent}%", 'url'=>'/movie/'.(int)$show['movie_id']];
        }
        $date = date('d/m', strtotime($day));
        if ($until && $until!==$day) $date.=' đến '.date('d/m',strtotime($until));
        return ['reply'=>"Các suất dự kiến đông nhất ngày {$date}. Tỷ lệ lấp đầy là ước tính từ lịch sử vé. Xem sơ đồ ghế để kiểm tra chỗ trống hiện tại.",
            'links'=>$links, 'model'=>$result['mode']];
    }

    private function chatShows(string $day,int $movieId,int $cinemaId,array $parsed,array $genreIds,array $excludedGenreIds,array $preferredGenreIds,int $limit): array {
        $sql="SELECT s.id,s.movie_id,s.start_time,m.title,c.name AS cinema_name,h.name AS hall_name,
            (SELECT GROUP_CONCAT(mg.genre_id) FROM movie_genres mg WHERE mg.movie_id=m.id) AS genre_ids FROM showtimes s
            JOIN movies m ON m.id=s.movie_id JOIN cinema_halls h ON h.id=s.cinema_hall_id JOIN cinemas c ON c.id=h.cinema_id
            WHERE s.start_time>NOW() AND s.start_time>=? AND s.start_time<? AND m.age_rating<>'C' AND m.status<>'Ended' AND LOWER(c.status)='active'";
        $params=[$day.' 00:00:00',(new DateTimeImmutable($day))->modify('+1 day')->format('Y-m-d').' 00:00:00'];
        if($movieId){$sql.=' AND m.id=?';$params[]=$movieId;}
        if($cinemaId){$sql.=' AND c.id=?';$params[]=$cinemaId;}
        foreach ([[$genreIds,false],[$excludedGenreIds,true]] as [$filterIds,$exclude]) {
            if (!$filterIds) continue;
            $sql.=' AND '.($exclude ? 'NOT ' : '').'EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id=m.id AND mg.genre_id IN ('.implode(',',array_fill(0,count($filterIds),'?')).'))';
            $params=array_merge($params,$filterIds);
        }
        if(isset($parsed['hour'])){$sql.=' AND HOUR(s.start_time)=?';$params[]=(int)$parsed['hour'];}
        elseif(isset($parsed['min_hour'])){$sql.=' AND HOUR(s.start_time)>=?';$params[]=(int)$parsed['min_hour'];}
        if(isset($parsed['max_hour'])){$sql.=' AND HOUR(s.start_time)<?';$params[]=(int)$parsed['max_hour'];}
        $sql.=' ORDER BY ';
        if (($parsed['audience'] ?? null)==='couple' && !$genreIds && $preferredGenreIds && ($parsed['intent'] ?? '')!=='forecast') {
            $sql.='EXISTS (SELECT 1 FROM movie_genres preferred WHERE preferred.movie_id=m.id AND preferred.genre_id IN ('.implode(',',array_fill(0,count($preferredGenreIds),'?')).')) DESC, ';
            $params=array_merge($params,$preferredGenreIds);
        }
        $sql.='s.start_time,s.id LIMIT '.max(1,min(101,$limit));
        $stmt=$this->db->prepare($sql);$stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function chat() {
        $uid=$this->viewer(); $input=self::getRequestData();
        $message=is_string($input['message'] ?? null) ? trim($input['message']) : '';
        if (!preg_match('/^.{1,1000}$/us', $message)) Response::validationError(['message'=>'Nhập câu hỏi từ 1 đến 1000 ký tự.']);
        $movies=$this->data->movies(); $cinemas=$this->data->cinemas(); $genres=$this->data->genres();
        $chatSettings=ChatSchedulePolicy::settings((new SystemConfig())->getAll());
        try {
            $parsed=$this->client->request('/chat',['message'=>$message,'movies'=>array_map(fn($m)=>['id'=>(int)$m['id'],'title'=>$m['title']],$movies),
                'cinemas'=>$cinemas,'genres'=>$genres,'today'=>date('Y-m-d'),'schedule_days'=>$chatSettings['ai_chat_schedule_days']]);
        } catch (Exception $e) {
            Response::success(['reply'=>'Trợ lý tạm thời chưa kết nối được. Bạn có thể tra lịch chiếu và đặt vé tại các mục bên dưới.',
                'links'=>[['label'=>'Lịch chiếu','url'=>'/schedule'],['label'=>'Danh sách phim','url'=>'/movies']],'ai_available'=>false]);
        }
        $context=is_array($input['context'] ?? null)?$input['context']:[];
        if (!empty($parsed['error'])) Response::success(['reply'=>$parsed['error'].'. Vui lòng nhập lại ngày.','links'=>[],'ai_available'=>true]);
        $movieIds=array_column($movies,'id'); $cinemaIds=array_column($cinemas,'id');
        $movieId=$this->resolveChatMovie($parsed,$context);
        $cinemaId=(int)($parsed['cinema_id'] ?? $context['cinema_id'] ?? 0);
        if(!in_array($movieId,array_map('intval',$movieIds),true)) $movieId=0;
        if(!in_array($cinemaId,array_map('intval',$cinemaIds),true)) $cinemaId=0;
        $range=ChatSchedulePolicy::resolve($parsed,$context,date('Y-m-d'),$chatSettings['ai_chat_schedule_days']);
        $day=$range['from'] ?? date('Y-m-d'); $until=$range['to'] ?? $day;
        $intent=$parsed['intent'] ?? 'unknown'; $links=[]; $reply='';
        $genreCatalog=array_column($genres,null,'id');
        $genreIds=array_values(array_filter(array_unique(array_map('intval',$parsed['genre_ids'] ?? [])),fn($id)=>isset($genreCatalog[$id])));
        $excludedGenreIds=array_values(array_filter(array_unique(array_map('intval',$parsed['excluded_genre_ids'] ?? [])),fn($id)=>isset($genreCatalog[$id])));
        $couple=($parsed['audience'] ?? null)==='couple';
        $preferredGenreIds=$couple ? array_values(array_filter(array_unique(array_map('intval',$parsed['preferred_genre_ids'] ?? [])),fn($id)=>isset($genreCatalog[$id]) && !in_array($id,$excludedGenreIds,true))) : [];
        $genreLabel=implode(', ',array_map(fn($id)=>$genreCatalog[$id]['name'],$genreIds));
        $excludedGenreLabel=implode(', ',array_map(fn($id)=>$genreCatalog[$id]['name'],$excludedGenreIds));
        $preference=($genreLabel ? ' thuộc thể loại '.$genreLabel : '').($excludedGenreLabel ? ' (không gồm '.$excludedGenreLabel.')' : '');
        $combined=!empty($parsed['schedule_requested']) && !empty($parsed['recommend_requested']);
        if ($couple && !$combined && in_array($intent,['unknown','greeting','showtimes'],true)) $intent='recommend';
        if ($combined && in_array($intent,['recommend','showtimes','unknown'],true)) $intent='showtimes';
        if (!empty($parsed['range_requested']) && !empty($parsed['schedule_requested']) && in_array($intent,['unknown','greeting','recommend'],true)) $intent='showtimes';
        $model=$parsed['intent_model'] ?? null; $available=true;
        if ($intent==='unknown' && ($movieId || $cinemaId || !empty($parsed['date_explicit']) || isset($parsed['hour']))) $intent='showtimes';
        $scheduleIntent=in_array($intent,['showtimes','booking','forecast'],true);
        if ($scheduleIntent && isset($range['error'])) {
            Response::success(['reply'=>$range['error'],'links'=>[['label'=>'Lịch chiếu','url'=>'/schedule']],
                'intent'=>$intent,'intents'=>[$intent],'ai_available'=>true,'intent_model'=>$model,'model'=>$model,
                'schedule_window'=>$range['window'],'date_range'=>null,'schedule_error'=>'outside_window_or_invalid_range',
                'context'=>['movie_id'=>$movieId,'cinema_id'=>$cinemaId,'date'=>$range['window']['from'],'date_to'=>$range['window']['to']]]);
        }
        $groups=[];
        if ($intent==='sentiment') {
            $result=$this->chatSentiment((string)($parsed['review_text'] ?? ''));
            $reply=$result['reply']; $model=$result['model'] ?? null; $available=$result['ai_available'] ?? true;
        } elseif ($intent==='forecast' && !$cinemaId) {
            $reply='Bạn muốn dự báo ở rạp nào? Ví dụ “Dự báo suất đông tại Galaxy Nguyễn Du tối nay”.';
        } elseif($scheduleIntent) {
            $perDay=$intent==='forecast' ? 100 : $chatSettings['ai_chat_showtimes_per_day'];
            $shows=[];
            for ($cursor=new DateTimeImmutable($day);$cursor<=new DateTimeImmutable($until);$cursor=$cursor->modify('+1 day')) {
                $date=$cursor->format('Y-m-d');
                $rows=$this->chatShows($date,$movieId,$cinemaId,$parsed,$genreIds,$excludedGenreIds,$preferredGenreIds,$perDay+1);
                $more=count($rows)>$perDay;
                $rows=array_slice($rows,0,$perDay);
                if ($couple && $day!==$until && $intent!=='forecast') $rows=$this->coupleShowtimes($rows,$preferredGenreIds,(bool)$genreIds)['shows'];
                $groups[$date]=['shows'=>$rows,'has_more'=>$more];
                $shows=array_merge($shows,$rows);
            }
            if ($intent==='forecast' && $shows) {
                $result=$this->chatForecast($cinemaId, $shows, $day, $until);
                $reply=$result['reply']; $links=$result['links'] ?? [];
                $model=$result['model'] ?? null; $available=$result['ai_available'] ?? true;
            } elseif ($day!==$until) {
                $result=ChatSchedulePolicy::groupedReply($groups,$day,$until,$preference,$perDay);
                $reply=$result['reply']; $links=$result['links'];
                if ($couple) $reply="Nếu muốn buổi hẹn nhẹ nhàng, mình ưu tiên tình cảm/hài khi có suất phù hợp, hoặc giữ thể loại bạn chọn. Các phim khác là lựa chọn thay thế để hai bạn cân nhắc. Chọn ghế cạnh nhau trên sơ đồ ghế; mình chưa kiểm tra ghế trống.\n\n".$reply;
                if($intent==='booking' && !$uid) $reply.=' Vui lòng đăng nhập trước khi chọn ghế và thanh toán.';
            } else {
                $reply=$shows?'Các suất'.$preference.' còn mở bán ngày '.date('d/m',strtotime($day)).':':'Chưa tìm thấy suất'.$preference.' phù hợp ngày '.date('d/m',strtotime($day)).'. Bạn có thể đổi ngày, thể loại, tên phim hoặc rạp.';
                if ($combined && $shows) {
                    $titles=array_values(array_unique(array_column($shows,'title')));
                    $reply='Với yêu cầu của bạn, có thể chọn '.implode(' hoặc ',$titles).$preference.'. Các suất phù hợp ngày '.date('d/m',strtotime($day)).':';
                }
                if ($couple) {
                    $suggestion=$this->coupleShowtimes($shows,$preferredGenreIds,(bool)$genreIds);
                    $shows=$suggestion['shows'];
                    $reply=$suggestion['reply'];
                    if ($shows) $reply.=' Các suất ngày '.date('d/m',strtotime($day)).':';
                    $reply.=' Mở sơ đồ ghế để chọn hai chỗ cạnh nhau; mình chưa kiểm tra ghế trống.';
                }
                foreach($shows as $show) $links[]=['label'=>$show['title'].' · '.$show['cinema_name'].' · '.$show['hall_name'].' · '.date('H:i',strtotime($show['start_time'])),'url'=>'/movie/'.(int)$show['movie_id']];
                if($intent==='booking' && !$uid) $reply.=' Vui lòng đăng nhập trước khi chọn ghế và thanh toán.';
                if ($groups[$day]['has_more']) $reply.=' Đang hiển thị tối đa '.$perDay.' suất; mở Lịch chiếu để xem đầy đủ.';
            }
            $links[]=['label'=>'Xem toàn bộ lịch chiếu','url'=>'/schedule'];
        } elseif($intent==='recommend') {
            $recommended=$this->recommend($uid,$movieId,6,$cinemaId ?: null,$genreIds,$excludedGenreIds,$preferredGenreIds);
            $reply=$recommended['movies'] ? 'Bạn có thể tham khảo các phim'.$preference.' dưới đây. Mở phim để xem suất chiếu và chọn ghế.' : 'Chưa có phim'.$preference.' phù hợp đang mở bán. Bạn có thể xem lại lịch chiếu sau.';
            $model=$recommended['model']; $available=$recommended['ai_available'];
            if ($couple) {
                if (!$recommended['movies']) $reply='Chưa có phim đúng các điều kiện bạn chọn đang mở bán cho buổi hẹn hò.';
                elseif ($genreIds) $reply='Cho buổi hẹn hò, dưới đây là các phim đúng thể loại bạn yêu cầu.';
                elseif ($recommended['preference_applied']) $reply='Nếu hai bạn muốn một buổi hẹn hò nhẹ nhàng, có thể tham khảo các phim tình cảm hoặc hài dưới đây.';
                else $reply='Chưa có phim tình cảm hoặc hài phù hợp đang mở bán. Dưới đây là các lựa chọn khác để hai bạn cân nhắc theo sở thích chung.';
                $reply.=' Mở phim để xem lịch và chọn hai chỗ cạnh nhau trên sơ đồ ghế; mình chưa kiểm tra ghế trống.';
            }
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
        if ($scheduleIntent && !empty($range['note'])) $reply=$range['note']."\n".$reply;
        Response::success(['reply'=>$reply,'links'=>$links,'intent'=>$intent,'ai_available'=>$available,
            'intents'=>$combined && $intent==='showtimes' ? ['showtimes','recommend'] : [$intent],
            'genres'=>array_map(fn($id)=>$genreCatalog[$id]['name'],$genreIds),
            'excluded_genres'=>array_map(fn($id)=>$genreCatalog[$id]['name'],$excludedGenreIds),
            'audience'=>$couple ? 'couple' : null,
            'intent_model'=>$parsed['intent_model'] ?? null,'model'=>$model,
            'schedule_window'=>$range['window'],
            'date_range'=>$scheduleIntent ? ['from'=>$day,'to'=>$until,'clipped'=>$range['clipped']] : null,
            'schedule'=>$scheduleIntent && $intent!=='forecast' ? $groups : null,
            'context'=>['movie_id'=>$movieId,'cinema_id'=>$cinemaId,'date'=>$day,'date_to'=>$until]]);
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

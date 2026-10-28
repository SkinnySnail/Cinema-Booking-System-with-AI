<?php
class AISchedulingService {
    public function forecast($db, int $cinemaId, array $movies, string $startDate): array {
        try {
            $snapshot=(new AIData($db))->forecastSnapshot($cinemaId,$movies,$startDate);
            $result=(new AIClient())->request('/forecast',$snapshot); $scores=[];
            foreach($result['items'] ?? [] as $item){
                $weekday=(int)(new DateTime($item['date']))->format('N')-1;
                $scores[$weekday][(int)$item['hour']][(int)$item['movie_id']]=max(0,min(1,(float)$item['occupancy']));
            }
            return ['used'=>true,'mode'=>$result['mode'],'training_samples'=>$result['training_samples'],'scores'=>$scores];
        } catch(Exception $e){
            return ['used'=>false,'mode'=>'unavailable','training_samples'=>0,'scores'=>[]];
        }
    }
}

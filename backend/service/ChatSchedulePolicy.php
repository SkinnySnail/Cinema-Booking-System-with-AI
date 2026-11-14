<?php
/** Server-owned rolling schedule window. Incoming chat context cannot expand it. */
class ChatSchedulePolicy {
    private const DEFAULTS = [
        'ai_chat_schedule_days' => 7,
        'ai_chat_showtimes_per_day' => 8,
        'ai_chat_show_reasons' => '1',
        'ai_chat_group_by' => 'date_movie',
        'ai_chat_empty_result_policy' => 'suggest_alternatives',
        'ai_chat_context_ttl_minutes' => 15,
        'ai_chat_ambiguity_policy' => 'clarify',
    ];

    public static function validationErrors(array $settings): array {
        $errors=[];
        foreach (['ai_chat_schedule_days'=>7,'ai_chat_showtimes_per_day'=>20,'ai_chat_context_ttl_minutes'=>120] as $key=>$max) {
            if (!array_key_exists($key,$settings)) continue;
            $value=$settings[$key];
            if ((!is_int($value) && !(is_string($value) && ctype_digit($value))) || (int)$value<1 || (int)$value>$max) {
                $errors[$key]="Nhập số nguyên từ 1 đến {$max}.";
            }
        }
        $options = [
            'ai_chat_show_reasons' => ['0', '1'],
            'ai_chat_group_by' => ['date_movie', 'date_cinema'],
            'ai_chat_empty_result_policy' => ['suggest_alternatives', 'report_only'],
            'ai_chat_ambiguity_policy' => ['clarify', 'first_match'],
        ];
        foreach ($options as $key => $allowed) {
            if (!array_key_exists($key, $settings)) continue;
            $value = $settings[$key];
            if ($key === 'ai_chat_show_reasons' && (is_bool($value) || is_int($value))) {
                $value = (string)(int)$value;
            }
            if (!in_array($value, $allowed, true)) $errors[$key] = 'Chọn một giá trị cấu hình hợp lệ.';
        }
        return $errors;
    }

    public static function settings(array $settings): array {
        $result=self::DEFAULTS;
        $errors=self::validationErrors($settings);
        foreach ($result as $key=>$default) {
            if (!isset($settings[$key]) || isset($errors[$key])) continue;
            $result[$key] = is_int($default) ? (int)$settings[$key] : (string)$settings[$key];
            if ($key === 'ai_chat_show_reasons') $result[$key] = (string)(int)$settings[$key];
        }
        return $result;
    }

    public static function activeContext(array $context, int $minutes, int $now): array {
        // Legacy API clients can still submit explicit filters without a timestamp.
        if (!array_key_exists('updated_at', $context)) return $context;
        $updatedAt = $context['updated_at'];
        if (!is_int($updatedAt) || $updatedAt > $now || $updatedAt <= $now - $minutes * 60) return [];
        return $context;
    }

    public static function nearbyDates(array $range): array {
        $dates = [];
        $windowEnd = self::date($range['window']['to']);
        for ($day = self::date($range['window']['from']); $day <= $windowEnd; $day = $day->modify('+1 day')) {
            $iso = $day->format('Y-m-d');
            if ($iso >= $range['from'] && $iso <= $range['to']) continue;
            $boundary = $iso < $range['from'] ? $range['from'] : $range['to'];
            $dates[$iso] = $day->diff(self::date($boundary))->days;
        }
        asort($dates, SORT_NUMERIC);
        return array_keys($dates);
    }

    private static function date($value): ?DateTimeImmutable {
        if (!is_string($value)) return null;
        $date=DateTimeImmutable::createFromFormat('!Y-m-d',$value,new DateTimeZone('Asia/Ho_Chi_Minh'));
        return $date && $date->format('Y-m-d')===$value ? $date : null;
    }

    public static function resolve(array $parsed,array $context,string $today,int $days=7): array {
        $start=self::date($today);
        if (!$start) throw new InvalidArgumentException('Invalid server date');
        $days=max(1,min(7,$days));
        $end=$start->modify('+'.($days-1).' days');
        $window=['from'=>$start->format('Y-m-d'),'to'=>$end->format('Y-m-d'),'days'=>$days,'timezone'=>'Asia/Ho_Chi_Minh'];
        $explicit=!empty($parsed['date_explicit']);
        if ($explicit) {
            $from=self::date($parsed['date_from'] ?? $parsed['date'] ?? null);
            $to=self::date($parsed['date_to'] ?? $parsed['date'] ?? null);
        } else {
            $from=self::date($context['date'] ?? null) ?? $start;
            $to=self::date($context['date_to'] ?? $context['date'] ?? null) ?? $end;
            // Expired conversation context must not leave the user stuck on an old day.
            if ($to<$start || $from>$end || $to<$from) { $from=$start; $to=$end; }
        }
        if (!$from || !$to || $to<$from) return ['window'=>$window,'error'=>'Khoảng ngày không hợp lệ. Vui lòng nhập lại ngày bắt đầu và ngày kết thúc.'];
        if ($to<$start || $from>$end) {
            return ['window'=>$window,'error'=>'Trợ lý chỉ tra cứu lịch trong '.$days.' ngày tính từ hôm nay, từ '.$start->format('d/m/Y').' đến '.$end->format('d/m/Y').'. Hãy chọn ngày trong khoảng này.'];
        }
        $clipped=$from<$start || $to>$end;
        return ['window'=>$window,'from'=>max($from,$start)->format('Y-m-d'),'to'=>min($to,$end)->format('Y-m-d'),
            'clipped'=>$clipped,'note'=>$clipped ? 'Yêu cầu đã được giới hạn trong '.$days.' ngày tính từ hôm nay.' : null];
    }

    public static function groupedReply(array $groups,string $from,string $to,string $preference,int $perDay,string $groupBy='date_movie'): array {
        $reply = $from === $to ? '' : 'Lịch chiếu'.$preference.' từ '.self::date($from)->format('d/m/Y').' đến '.self::date($to)->format('d/m/Y').':';
        $links=[]; $more=false;
        $byCinema = $groupBy === 'date_cinema';
        foreach ($groups as $date=>$group) {
            if ($from !== $to) $reply.="\n\n".self::date($date)->format('d/m').':';
            $sections=[];
            foreach ($group['shows'] as $show) {
                $section = $byCinema ? $show['cinema_name'] : '';
                $key = $show['movie_id'].'/'.$show['cinema_name'];
                $sections[$section][$key]['label'] = $byCinema ? $show['title'] : $show['title'].' · '.$show['cinema_name'];
                $sections[$section][$key]['slots'][] = date('H:i',strtotime($show['start_time'])).' ('.$show['hall_name'].')';
                $links[(int)$show['movie_id']]=['label'=>$show['title'],'url'=>'/movie/'.(int)$show['movie_id']];
            }
            if (!$sections) $reply.="\nChưa có suất phù hợp còn mở bán.";
            foreach ($sections as $section => $movies) {
                if ($section !== '') $reply .= "\n".$section;
                foreach ($movies as $movie) $reply.="\n• ".$movie['label'].' — '.implode(', ',$movie['slots']);
            }
            if ($group['has_more']) { $reply.="\nCòn suất khác; mở Lịch chiếu để xem đầy đủ."; $more=true; }
        }
        if ($more) $reply.="\n\nĐang hiển thị tối đa ".$perDay.' suất mỗi ngày.';
        return ['reply'=>ltrim($reply),'links'=>array_values($links)];
    }
}

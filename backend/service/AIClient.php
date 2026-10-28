<?php
/** Internal-only bridge. Browser requests never choose a model URL or service key. */
class AIClient {
    public function request(string $path, array $payload): array {
        if (getenv('AI_ENABLED') === 'false') throw new RuntimeException('AI disabled');
        $key = getenv('AI_SERVICE_KEY') ?: '';
        if ($key === '') throw new RuntimeException('AI service key not configured');
        $base = rtrim(getenv('AI_SERVICE_URL') ?: 'http://127.0.0.1:8001', '/');
        if (!function_exists('curl_init')) throw new RuntimeException('cURL unavailable');
        $handle = curl_init($base . $path);
        curl_setopt_array($handle, [
            CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 12,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-AI-Key: ' . $key],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
        $raw = curl_exec($handle);
        $status = curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if ($status !== 200 || !is_array($data)) throw new RuntimeException('AI service unavailable');
        return $data;
    }
}

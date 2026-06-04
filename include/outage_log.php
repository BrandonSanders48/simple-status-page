<?php
header('Content-Type: application/json');

$logFile    = __DIR__ . '/cron/outage_log.json';
$statusFile = __DIR__ . '/cron/service_status.json';
$cacheFile  = sys_get_temp_dir() . '/status_cache_v4.json';

$log = file_exists($logFile) ? (json_decode(file_get_contents($logFile), true) ?: []) : [];

// Index what's already in the log to deduplicate
$loggedKeys = [];
foreach ($log as $entry) {
    if (!empty($entry['service']) && !empty($entry['went_down_at'])) {
        $loggedKeys[$entry['service'] . ':' . (int)$entry['went_down_at']] = true;
    }
}

// Source 1: service_status.json — written by both cron and status_ajax.php
$status = file_exists($statusFile) ? (json_decode(file_get_contents($statusFile), true) ?: []) : [];
foreach ($status as $name => $data) {
    if (!is_array($data)) continue;
    $wentDown = (int)($data['last_down_at'] ?? 0);
    $duration = (int)($data['last_down_duration_s'] ?? 0);
    if (!$wentDown || !$duration) continue;
    $key = $name . ':' . $wentDown;
    if (isset($loggedKeys[$key])) continue;
    $loggedKeys[$key] = true;
    $log[] = [
        'service'      => $name,
        'went_down_at' => $wentDown,
        'came_up_at'   => $wentDown + $duration,
        'duration_s'   => $duration,
    ];
}

// Source 2: status_ajax cache — what the browser is actually seeing (tooltip data lives here)
$cache = file_exists($cacheFile) ? (json_decode(file_get_contents($cacheFile), true) ?: []) : [];
foreach ($cache['services'] ?? [] as $svc) {
    $wentDown = (int)($svc['last_down_at'] ?? 0);
    $duration = (int)($svc['last_down_duration_s'] ?? 0);
    if (!$wentDown || !$duration) continue;
    $name = $svc['title'] ?? '';
    if (!$name) continue;
    $key = $name . ':' . $wentDown;
    if (isset($loggedKeys[$key])) continue;
    $loggedKeys[$key] = true;
    $log[] = [
        'service'      => $name,
        'went_down_at' => $wentDown,
        'came_up_at'   => $wentDown + $duration,
        'duration_s'   => $duration,
    ];
}

usort($log, fn($a, $b) => ($b['went_down_at'] ?? 0) - ($a['went_down_at'] ?? 0));

echo json_encode(array_values($log));

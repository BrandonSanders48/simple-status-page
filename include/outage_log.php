<?php
header('Content-Type: application/json');

$logFile    = __DIR__ . '/cron/outage_log.json';
$statusFile = __DIR__ . '/cron/service_status.json';

// Historical log written by cron and status_ajax when a service recovers
$log = file_exists($logFile) ? (json_decode(file_get_contents($logFile), true) ?: []) : [];

// Index existing entries to deduplicate
$seen = [];
foreach ($log as $e) {
    if (!empty($e['service']) && !empty($e['went_down_at'])) {
        $seen[$e['service'] . ':' . (int)$e['went_down_at']] = true;
    }
}

// service_status.json — the same source the tooltip reads from.
// Contains the most recent outage per service that the cron/ajax recorded.
$status = file_exists($statusFile) ? (json_decode(file_get_contents($statusFile), true) ?: []) : [];
foreach ($status as $name => $data) {
    if (!is_array($data)) continue;
    $wentDown = (int)($data['last_down_at'] ?? 0);
    $duration = (int)($data['last_down_duration_s'] ?? 0);
    if ($wentDown === 0 || $duration === 0) continue;
    if (isset($seen[$name . ':' . $wentDown])) continue;
    $log[] = [
        'service'      => $name,
        'went_down_at' => $wentDown,
        'came_up_at'   => $wentDown + $duration,
        'duration_s'   => $duration,
    ];
}

usort($log, fn($a, $b) => ($b['went_down_at'] ?? 0) - ($a['went_down_at'] ?? 0));

echo json_encode(array_values($log));

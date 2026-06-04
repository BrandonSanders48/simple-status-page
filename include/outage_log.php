<?php
header('Content-Type: application/json');

$logFile    = __DIR__ . '/cron/outage_log.json';
$statusFile = __DIR__ . '/cron/service_status.json';

$log    = file_exists($logFile)    ? (json_decode(file_get_contents($logFile),    true) ?: []) : [];
$status = file_exists($statusFile) ? (json_decode(file_get_contents($statusFile), true) ?: []) : [];

// Index entries already in the log by (service:went_down_at) to avoid duplicates
$loggedKeys = [];
foreach ($log as $entry) {
    if (!empty($entry['service']) && !empty($entry['went_down_at'])) {
        $loggedKeys[$entry['service'] . ':' . (int)$entry['went_down_at']] = true;
    }
}

// Synthesise entries from service_status.json that the cron wrote but never made it to outage_log.json
foreach ($status as $name => $data) {
    if (empty($data['last_down_at']) || empty($data['last_down_duration_s'])) continue;
    $wentDown = (int)$data['last_down_at'];
    if (isset($loggedKeys[$name . ':' . $wentDown])) continue;
    $log[] = [
        'service'      => $name,
        'went_down_at' => $wentDown,
        'came_up_at'   => $wentDown + (int)$data['last_down_duration_s'],
        'duration_s'   => (int)$data['last_down_duration_s'],
    ];
}

// Sort newest first
usort($log, fn($a, $b) => ($b['went_down_at'] ?? 0) - ($a['went_down_at'] ?? 0));

echo json_encode($log);

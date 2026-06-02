<?php
session_start();

$_authEnv = getenv('APP_AUTH_REQUIRED');
$_configData = ($c = @file_get_contents(__DIR__ . '/configuration.json')) ? (json_decode($c, true) ?? []) : [];
$_authRequired = ($_authEnv !== false && $_authEnv !== '')
    ? filter_var($_authEnv, FILTER_VALIDATE_BOOLEAN)
    : ($_configData['require_auth'] ?? true);
if ($_authRequired === false) {
    $_SESSION['authenticated'] = true;
}

if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    http_response_code(403);
    exit('Not authorized');
}
if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
    http_response_code(403);
    exit('Invalid CSRF token');
}

// --- Rate Limiting (per IP, 10 per 10 min) ---
function rate_limit($key, $limit = 10, $window = 600) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $session_key = "rate_limit_{$key}_{$ip}";
    if (!isset($_SESSION[$session_key])) {
        $_SESSION[$session_key] = [];
    }
    // Remove old attempts
    $_SESSION[$session_key] = array_filter($_SESSION[$session_key], function($ts) use ($window) {
        return $ts > (time() - $window);
    });
    if (count($_SESSION[$session_key]) >= $limit) {
        return false;
    }
    $_SESSION[$session_key][] = time();
    return true;
}
if (!rate_limit('create_incident', 10, 600)) {
    http_response_code(429);
    exit('Too many incident submissions. Please wait and try again.');
}

$startTime = $_POST['start_time'] ?? $_POST['time'] ?? '';
if (empty($_POST['title']) || empty($_POST['description']) || empty($startTime)) {
    http_response_code(400);
    exit('Missing fields');
}

$allowed_severities = ['degraded', 'outage', 'maintenance', 'resolved'];
$severity  = in_array($_POST['severity'] ?? '', $allowed_severities) ? $_POST['severity'] : 'outage';
$startTime = strip_tags($startTime);
$endTime   = !empty($_POST['end_time']) ? strip_tags($_POST['end_time']) : null;

$incidentsFile = __DIR__ . '/incidents.json';
$incidents = [];
if (file_exists($incidentsFile)) {
    $incidents = json_decode(file_get_contents($incidentsFile), true);
    if (!is_array($incidents)) $incidents = [];
}
$incidents[] = [
    'title'       => strip_tags($_POST['title']),
    'description' => strip_tags($_POST['description']),
    'start_time'  => $startTime,
    'end_time'    => $endTime,
    'time'        => $startTime,   // backwards compat for existing displays
    'severity'    => $severity
];
file_put_contents($incidentsFile, json_encode($incidents, JSON_PRETTY_PRINT));
echo 'OK';
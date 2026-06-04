<?php
session_start();
header('Content-Type: application/json');

$_cfg = json_decode(@file_get_contents(__DIR__ . '/configuration.json') ?: '{}', true) ?: [];
$_authEnv = getenv('APP_AUTH_REQUIRED');
$_authRequired = ($_authEnv !== false && $_authEnv !== '')
    ? filter_var($_authEnv, FILTER_VALIDATE_BOOLEAN)
    : ($_cfg['require_auth'] ?? true);

if ($_authRequired && empty($_SESSION['authenticated'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Not authorized']);
    exit;
}
if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid CSRF token']);
    exit;
}

$tmpDir  = sys_get_temp_dir();
$deleted = 0;

foreach (glob($tmpDir . '/status_cache_v4*.json') ?: [] as $f) {
    if (@unlink($f)) $deleted++;
}
foreach (glob($tmpDir . '/rss_cache_*.json') ?: [] as $f) {
    if (@unlink($f)) $deleted++;
}

echo json_encode(['ok' => true, 'deleted' => $deleted]);

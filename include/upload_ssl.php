<?php
session_start();
header('Content-Type: application/json');

$_cfg = json_decode(@file_get_contents(__DIR__ . '/configuration.json') ?: '{}', true) ?: [];
$_authEnv = getenv('APP_AUTH_REQUIRED');
$_authRequired = ($_authEnv !== false && $_authEnv !== '')
    ? filter_var($_authEnv, FILTER_VALIDATE_BOOLEAN)
    : ($_cfg['require_auth'] ?? true);

if ($_authRequired && empty($_SESSION['authenticated'])) {
    http_response_code(403); echo json_encode(['error' => 'Not authorized']); exit;
}
if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
    http_response_code(403); echo json_encode(['error' => 'Invalid CSRF token']); exit;
}

$type = $_POST['type'] ?? '';
if (!in_array($type, ['cert', 'key'], true)) {
    http_response_code(400); echo json_encode(['error' => 'Invalid type']); exit;
}
if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400); echo json_encode(['error' => 'No file received']); exit;
}

$file = $_FILES['file'];
if ($file['size'] > 512 * 1024) {
    http_response_code(400); echo json_encode(['error' => 'File too large (max 512 KB)']); exit;
}

$content = file_get_contents($file['tmp_name']);
if ($type === 'cert' && strpos($content, '-----BEGIN CERTIFICATE-----') === false) {
    http_response_code(400); echo json_encode(['error' => 'Not a valid PEM certificate (missing BEGIN CERTIFICATE header)']); exit;
}
if ($type === 'key' && strpos($content, '-----BEGIN') === false) {
    http_response_code(400); echo json_encode(['error' => 'Not a valid PEM private key']); exit;
}

$sslDir = __DIR__ . '/../ssl/';
if (!is_dir($sslDir)) mkdir($sslDir, 0700, true);

$dest = $sslDir . ($type === 'cert' ? 'cert.pem' : 'key.pem');
if (file_put_contents($dest, $content) === false) {
    http_response_code(500); echo json_encode(['error' => 'Failed to write file, check directory permissions']); exit;
}
if ($type === 'key') chmod($dest, 0600);

echo json_encode(['ok' => true]);

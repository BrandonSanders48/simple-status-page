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
if (empty($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    $errMap = [1=>'File too large (server limit)',2=>'File too large',3=>'Partial upload',4=>'No file',6=>'No tmp dir',7=>'Write failed'];
    $code = $_FILES['logo']['error'] ?? 4;
    http_response_code(400);
    echo json_encode(['error' => $errMap[$code] ?? 'Upload error']);
    exit;
}

$file = $_FILES['logo'];

if ($file['size'] > 2 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large (max 2 MB)']);
    exit;
}

// MIME detection — finfo preferred, getimagesize as fallback
$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'image/svg+xml' => 'svg'];
$mime = '';
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
}
if (!$mime || !array_key_exists($mime, $allowed)) {
    $info = @getimagesize($file['tmp_name']);
    if ($info && isset($info['mime'])) $mime = $info['mime'];
}
if (!array_key_exists($mime, $allowed)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid file type. Allowed: JPG, PNG, GIF, WEBP, SVG']);
    exit;
}

// Save inside include/uploads/ — shares the already-mounted include/ volume
$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not create uploads directory']);
        exit;
    }
}

$filename = 'logo_' . bin2hex(random_bytes(6)) . '.' . $allowed[$mime];
if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file — check directory permissions']);
    exit;
}

echo json_encode(['path' => 'include/uploads/' . $filename]);

<?php
session_start();
header('Content-Type: application/json');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// CSRF protection
if (
    empty($_POST['csrf_token']) ||
    empty($_SESSION['csrf_token']) ||
    !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])
) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Invalid CSRF token.']);
    exit;
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
if (!rate_limit('subscribe', 10, 600)) {
    http_response_code(429);
    echo json_encode(['status' => 'error', 'message' => 'Too many subscription attempts. Please wait and try again.']);
    exit;
}

// Basic validation & sanitization
$email = trim($_POST['email'] ?? '');
$email = filter_var($email, FILTER_SANITIZE_EMAIL);
$services = $_POST['service'] ?? [];
if (!is_array($services)) $services = [$services];

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid email address.']);
    exit;
}
if (empty($services)) {
    echo json_encode(['status' => 'error', 'message' => 'No service selected.']);
    exit;
}

// Before adding a new subscription, check if it already exists:
$subsFile = __DIR__ . '/subscriptions.csv';
$alreadySubscribed = false;

// Load existing subscriptions
$existing = [];
if (file_exists($subsFile)) {
    $rows = array_map('str_getcsv', file($subsFile));
    foreach ($rows as $row) {
        if (count($row) >= 2) {
            $existingEmail = trim($row[0], " \t\n\r\0\x0B\"");
            $existingService = trim($row[1], " \t\n\r\0\x0B\"");
            $existing[$existingEmail][$existingService] = true;
        }
    }
}

// For each selected service, check if already subscribed
foreach ($services as $service) {
    $service = trim($service, " \t\n\r\0\x0B\"");
    if (isset($existing[$email][$service])) {
        $alreadySubscribed = true;
        break;
    }
}

// If already subscribed, return a message and do not add
if ($alreadySubscribed) {
    echo json_encode(['status' => 'error', 'message' => 'You are already subscribed to one or more selected services.']);
    exit;
}

// Save each subscription
$fp = fopen($subsFile, 'a');
foreach ($services as $service) {
    $entry = [$email, $service, date('Y-m-d H:i:s')];
    fputcsv($fp, $entry);
}
fclose($fp);

echo json_encode(['status' => 'success', 'message' => 'Subscribed successfully!']);
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

// Basic validation
$email = trim($_POST['email'] ?? '');
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

// Save each subscription
$csvFile = __DIR__ . '/subscriptions.csv';
$fp = fopen($csvFile, 'a');
foreach ($services as $service) {
    $entry = [$email, $service, date('Y-m-d H:i:s')];
    fputcsv($fp, $entry);
}
fclose($fp);

echo json_encode(['status' => 'success', 'message' => 'Subscribed successfully!']);
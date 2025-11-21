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

$email = trim($_POST['email'] ?? '');
$action = trim($_POST['action'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid email address.']);
    exit;
}

$csvFile = __DIR__ . '/subscriptions.csv';

if ($action === 'view') {
    $subscriptions = [];
    if (file_exists($csvFile)) {
        $rows = array_map('str_getcsv', file($csvFile));
        foreach ($rows as $row) {
            if (
                count($row) >= 2 &&
                strtolower(trim($row[0])) === strtolower($email)
            ) {
                $subscriptions[] = trim($row[1]);
            }
        }
    }
    echo json_encode([
        'status' => 'success',
        'message' => empty($subscriptions) ? 'No subscriptions found for this email.' : 'Subscriptions found.',
        'subscriptions' => $subscriptions
    ]);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Invalid action.']);
exit;
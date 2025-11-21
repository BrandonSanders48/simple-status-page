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
$service = trim($_POST['service'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid email address.']);
    exit;
}

$csvFile = __DIR__ . '/subscriptions.csv';

if ($action === 'unsubscribe') {
    // Remove all subscriptions for this email
    if (!file_exists($csvFile)) {
        echo json_encode([
            'status' => 'success',
            'message' => 'No subscriptions to remove.',
            'action' => 'unsubscribe'
        ]);
        exit;
    }
    $rows = array_map('str_getcsv', file($csvFile));
    $newRows = [];
    $removed = false;
    foreach ($rows as $row) {
        if (
            count($row) >= 2 &&
            strtolower(trim($row[0], " \t\n\r\0\x0B\"")) === strtolower(trim($email, " \t\n\r\0\x0B\""))
        ) {
            $removed = true;
            continue; // Remove all for this email
        }
        if (count($row) >= 2) {
            $newRows[] = $row;
        }
    }
    $fp = fopen($csvFile, 'w');
    foreach ($newRows as $row) {
        fputcsv($fp, $row);
    }
    fclose($fp);
    echo json_encode([
        'status' => 'success',
        'message' => $removed ? 'Unsubscribed from all services.' : 'No subscriptions to remove.',
        'action' => 'unsubscribe'
    ]);
    exit;
}

if ($action === 'unsubscribe_single') {
    // Remove only the specified service for this email
    if (!file_exists($csvFile)) {
        echo json_encode([
            'status' => 'success',
            'message' => 'No subscriptions to remove.',
            'action' => 'unsubscribe'
        ]);
        exit;
    }
    $rows = array_map('str_getcsv', file($csvFile));
    $newRows = [];
    $removed = false;
    foreach ($rows as $row) {
        if (
            count($row) >= 2 &&
            strtolower(trim($row[0], " \t\n\r\0\x0B\"")) === strtolower(trim($email, " \t\n\r\0\x0B\"")) &&
            trim($row[1], " \t\n\r\0\x0B\"") === trim($service, " \t\n\r\0\x0B\"")
        ) {
            $removed = true;
            continue; // Remove this service for this email
        }
        if (count($row) >= 2) {
            $newRows[] = $row;
        }
    }
    $fp = fopen($csvFile, 'w');
    foreach ($newRows as $row) {
        fputcsv($fp, $row);
    }
    fclose($fp);
    echo json_encode([
        'status' => 'success',
        'message' => $removed ? "Unsubscribed from $service." : "No subscription found for $service.",
        'action' => 'unsubscribe'
    ]);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Invalid action.']);
exit;
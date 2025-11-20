<?php
session_start();
header('Content-Type: application/json');

ini_set('display_errors', 1);
error_reporting(E_ALL);

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
$subscriptions = [];
$allRows = [];
if (file_exists($csvFile)) {
    $allRows = array_map('str_getcsv', file($csvFile));
    foreach ($allRows as $row) {
        if (count($row) >= 2 && strtolower($row[0]) === strtolower($email)) {
            $subscriptions[] = $row[1];
        }
    }
}

if ($action === 'view') {
    if (empty($subscriptions)) {
        echo json_encode([
            'status' => 'success',
            'message' => 'No subscriptions found for this email.',
            'subscriptions' => []
        ]);
    } else {
        echo json_encode([
            'status' => 'success',
            'message' => 'Subscriptions found.',
            'subscriptions' => $subscriptions
        ]);
    }
    exit;
} elseif ($action === 'unsubscribe') {
    if (!file_exists($csvFile)) {
        echo json_encode([
            'status' => 'success',
            'message' => 'No subscriptions to remove.',
            'action' => 'unsubscribe'
        ]);
        exit;
    }
    // If a specific service is provided, only remove that subscription
    $newRows = [];
    $removed = false;
    foreach ($allRows as $row) {
        if (count($row) >= 2) {
            if (
                strtolower($row[0]) === strtolower($email) &&
                ($service === '' || $row[1] === $service)
            ) {
                // Skip this row (unsubscribe)
                $removed = true;
                if ($service !== '' && $row[1] !== $service) {
                    $newRows[] = $row;
                }
                // If service is '', remove all for this email
            } else {
                $newRows[] = $row;
            }
        }
    }
    $fp = fopen($csvFile, 'w');
    foreach ($newRows as $row) {
        fputcsv($fp, $row);
    }
    fclose($fp);
    if ($service !== '') {
        $msg = $removed ? "Unsubscribed from $service." : "No subscription found for $service.";
    } else {
        $msg = 'Unsubscribed from all services.';
    }
    echo json_encode([
        'status' => 'success',
        'message' => $msg,
        'action' => 'unsubscribe'
    ]);
    exit;
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid action.']);
    exit;
}
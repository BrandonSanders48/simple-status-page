<?php
session_start();
if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    http_response_code(403);
    exit('Not authorized');
}
if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
    http_response_code(403);
    exit('Invalid CSRF token');
}
if (empty($_POST['title']) || empty($_POST['description']) || empty($_POST['time'])) {
    http_response_code(400);
    exit('Missing fields');
}
$incidentsFile = __DIR__ . '/incidents.json';
$incidents = [];
if (file_exists($incidentsFile)) {
    $incidents = json_decode(file_get_contents($incidentsFile), true);
    if (!is_array($incidents)) $incidents = [];
}
$incidents[] = [
    'title' => strip_tags($_POST['title']),
    'description' => strip_tags($_POST['description']),
    'time' => strip_tags($_POST['time'])
];
file_put_contents($incidentsFile, json_encode($incidents, JSON_PRETTY_PRINT));
echo 'OK';
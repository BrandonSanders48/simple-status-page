<?php
header('Content-Type: application/json');
$logFile = __DIR__ . '/cron/outage_log.json';
echo file_exists($logFile) ? file_get_contents($logFile) : '[]';

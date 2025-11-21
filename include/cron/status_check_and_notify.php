<?php
// For cron: ensure script runs independently and errors are logged
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);
$logFile = __DIR__ . '/status_notify_cron.log';

// Custom error handler to log errors
set_error_handler(function($errno, $errstr, $errfile, $errline) use ($logFile) {
    $msg = "[" . date('Y-m-d H:i:s') . "] ERROR: $errstr in $errfile on line $errline\n";
    error_log($msg, 3, $logFile);
});
set_exception_handler(function($e) use ($logFile) {
    $msg = "[" . date('Y-m-d H:i:s') . "] EXCEPTION: " . $e->getMessage() . "\n";
    error_log($msg, 3, $logFile);
});

// --- Load config and previous status ---
$configPath = __DIR__ . '/../configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);
$internal_hosts = $json_data['internal_hosts'] ?? [];
$domain = $json_data['network']['domain'] ?? '';
// Change this line to pull page_url from meta if not at root:
$page_url = $json_data['page_url'] ?? ($json_data['meta']['page_url'] ?? '');

// --- Email settings from config ---
$email_from = $json_data['email']['from'] ?? 'status@yourdomain.com';
$email_reply = $json_data['email']['reply_to'] ?? $email_from;
$smtp = $json_data['email']['smtp'] ?? null;

$statusFile = __DIR__ . '/service_status.json';
$prevStatus = file_exists($statusFile) ? json_decode(file_get_contents($statusFile), true) : [];

// Include PHPMailer
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function check_port($host, $port) {
    $fqdn = $host;
    $connection = @fsockopen($fqdn, $port, $errno, $errstr, 2);
    if (is_resource($connection)) {
        fclose($connection);
        return true;
    }
    return false;
}

// Get subscribers
$subsFile = __DIR__ . '/../subscriptions.csv';
$subscribers = [];
if (file_exists($subsFile)) {
    $rows = array_map('str_getcsv', file($subsFile));
    foreach ($rows as $row) {
        if (count($row) >= 2) {
            // Remove quotes and trim whitespace
            $serviceKey = trim($row[1], " \t\n\r\0\x0B\"");
            $email = trim($row[0], " \t\n\r\0\x0B\"");
            $subscribers[$serviceKey][] = $email;
        }
    }
}

// --- SMTP mail function using PHPMailer ---
function send_smtp_mail($to, $subject, $body, $from, $reply, $smtp) {
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $smtp['host'];
        $mail->SMTPAuth = true;
        $mail->Username = getenv('SMTP_USER');
        $mail->Password = getenv('SMTP_PASS');
        $mail->SMTPSecure = $smtp['secure'] ?? 'tls';
        $mail->Port = $smtp['port'];
        $mail->setFrom($from);
        $mail->addReplyTo($reply);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->isHTML(true);
        $mail->send();
        global $logFile;
        $msg = "[" . date('Y-m-d H:i:s') . "] MAIL SENT to $to (subject: $subject)\n";
        error_log($msg, 3, $logFile);
        return true;
    } catch (Exception $e) {
        global $logFile;
        $msg = "[" . date('Y-m-d H:i:s') . "] MAIL ERROR to $to (subject: $subject): " . $mail->ErrorInfo . "\n";
        error_log($msg, 3, $logFile);
        return false;
    }
}

$currentStatus = [];
foreach ($internal_hosts as $service) {
    $name = $service['name'] ?? $service['host'];
    $isUp = false;
    if (!empty($service['port'])) {
        $isUp = check_port($service['host'], (int)$service['port']);
    } else {
        // Use OS-specific ping
        $pingCmd = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN'
            ? "ping -n 2 " . escapeshellarg($service['host'])
            : "ping -c 2 " . escapeshellarg($service['host']);
        exec($pingCmd, $output, $result);
        $isUp = $result === 0;
    }
    $currentStatus[$name] = $isUp ? 'up' : 'down';

    // Detect status change
    if (isset($prevStatus[$name]) && $prevStatus[$name] !== $currentStatus[$name]) {
        $emails = $subscribers[$name] ?? [];
        error_log("[$name] STATUS CHANGE DETECTED: {$prevStatus[$name]} → {$currentStatus[$name]}\n", 3, $logFile);
        error_log("[$name] Subscribers: " . (!empty($emails) ? implode(', ', $emails) : 'None') . "\n", 3, $logFile);
        // Send notification
        foreach ($emails as $email) {
            error_log("Preparing to email subscriber: $email\n", 3, $logFile);
            $subject = "Service '{$name}' is now " . strtoupper($currentStatus[$name]);
            $message = '
<html>
<head>
  <style>
    body { background: #f8f9fa; color: #23272b; font-family: Arial, sans-serif; }
    .status-container {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 8px #0001;
      max-width: 480px;
      margin: 30px auto;
      padding: 32px 24px;
      border: 1px solid #e0e0e0;
    }
    .status-header {
      display: flex;
      align-items: center;
      margin-bottom: 18px;
    }
    .status-icon {
      font-size: 32px;
      margin-right: 14px;
      color: ' . ($currentStatus[$name] === 'up' ? '#28a745' : '#dc3545') . ';
    }
    .status-title {
      font-size: 22px;
      font-weight: bold;
      color: #23272b;
    }
    .status-state {
      font-size: 18px;
      font-weight: bold;
      color: ' . ($currentStatus[$name] === 'up' ? '#28a745' : '#dc3545') . ';
      margin-bottom: 10px;
    }
    .status-details {
      font-size: 15px;
      color: #555;
      margin-bottom: 18px;
    }
    .footer {
      font-size: 12px;
      color: #888;
      margin-top: 24px;
      text-align: center;
    }
    a.button {
      display: inline-block;
      padding: 8px 18px;
      background: #007bff;
      color: #fff !important;
      border-radius: 6px;
      text-decoration: none;
      font-size: 15px;
      margin-top: 10px;
    }
  </style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">
</head>
<body>
  <div class="status-container">
    <div class="status-header">
      <span class="status-icon">' . 
        ($currentStatus[$name] === 'up'
          ? '<i class="fa-solid fa-circle-check"></i>'
          : '<i class="fa-solid fa-circle-exclamation"></i>') . 
      '</span>
      <span class="status-title">' . htmlspecialchars($name) . '</span>
    </div>
    <div class="status-state">
      Status: ' . strtoupper($currentStatus[$name]) . '
    </div>
    <div class="status-details">
      The service <b>' . htmlspecialchars($name) . '</b> has changed status and is now <b style="color:' . ($currentStatus[$name] === 'up' ? '#28a745' : '#dc3545') . ';">' . strtoupper($currentStatus[$name]) . '</b>.<br>
      <small>Checked at: ' . date('Y-m-d H:i:s') . '</small>
    </div>
    <a class="button" href="' . htmlspecialchars($page_url) . '" target="_blank">View Status Page</a>
    <div class="footer">
      &mdash; simple-status-page
    </div>
  </div>
</body>
</html>
';
            if ($smtp) {
                send_smtp_mail($email, $subject, $message, $email_from, $email_reply, $smtp);
            } else {
                $headers = "From: {$email_from}\r\nReply-To: {$email_reply}\r\n";
                @mail($email, $subject, $message, $headers);
            }
        }
    }
}

// Save current status for next check
file_put_contents($statusFile, json_encode($currentStatus, JSON_PRETTY_PRINT));
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

// Load config and previous status
$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);
$internal_hosts = $json_data['internal_hosts'] ?? [];
$domain = $json_data['network']['domain'] ?? '';

// --- Email settings from config ---
$email_from = $json_data['email']['from'] ?? 'status@yourdomain.com';
$email_reply = $json_data['email']['reply_to'] ?? $email_from;
$smtp = $json_data['email']['smtp'] ?? null;

$statusFile = __DIR__ . '/service_status.json';
$prevStatus = file_exists($statusFile) ? json_decode(file_get_contents($statusFile), true) : [];

// Include PHPMailer
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';
require_once __DIR__ . '/PHPMailer/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function check_port($host, $port, $domain = '') {
    $fqdn = $domain ? $host . '.' . $domain : $host;
    $connection = @fsockopen($fqdn, $port, $errno, $errstr, 2);
    if (is_resource($connection)) {
        fclose($connection);
        return true;
    }
    return false;
}

// Get subscribers
$subsFile = '../subscriptions.csv';
$subscribers = [];
if (file_exists($subsFile)) {
    $rows = array_map('str_getcsv', file($subsFile));
    foreach ($rows as $row) {
        if (count($row) >= 2) {
            $subscribers[$row[1]][] = $row[0]; // $row[1]=service, $row[0]=email
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
        $mail->Username = $smtp['username'];
        $mail->Password = $smtp['password'];
        $mail->SMTPSecure = $smtp['secure'] ?? 'tls';
        $mail->Port = $smtp['port'];
        $mail->setFrom($from);
        $mail->addReplyTo($reply);
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->isHTML(false);
        $mail->send();
        return true;
    } catch (Exception $e) {
        // Log error for cron diagnostics
        global $logFile;
        $msg = "[" . date('Y-m-d H:i:s') . "] MAIL ERROR to $to: " . $mail->ErrorInfo . "\n";
        error_log($msg, 3, $logFile);
        return false;
    }
}

$currentStatus = [];
foreach ($internal_hosts as $service) {
    $name = $service['name'] ?? $service['host'];
    $isUp = false;
    if (!empty($service['port'])) {
        $isUp = check_port($service['host'], (int)$service['port'], $domain);
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
        // Send notification
        $emails = $subscribers[$name] ?? [];
        foreach ($emails as $email) {
            $subject = "Service '{$name}' is now " . strtoupper($currentStatus[$name]);
            $message = "The service '{$name}' has changed status and is now " . strtoupper($currentStatus[$name]) . ".";
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
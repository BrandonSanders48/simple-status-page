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
$page_url = $json_data['page_url']
    ?? ($json_data['meta']['page_url']
    ?? ($json_data['branding']['company_url']
    ?? ($json_data['company_url'] ?? '')));

$business_name = $json_data['branding']['business_name'] ?? $json_data['business_name'] ?? 'Status Page';
$business_logo = $json_data['branding']['business_logo'] ?? $json_data['business_logo'] ?? '';
$company_url   = $json_data['branding']['company_url'] ?? $json_data['company_url'] ?? '';
$accent_color  = $json_data['theme']['accent_color'] ?? '#06b6d4';

// --- Email settings from config ---
$email_from = $json_data['email']['from'] ?? 'status@yourdomain.com';
$email_reply = $json_data['email']['reply_to'] ?? $email_from;
$smtp = $json_data['email']['smtp'] ?? null;
$show_action_buttons = $json_data['email']['show_action_buttons'] ?? true;

$statusFile  = __DIR__ . '/service_status.json';
$tokensFile  = __DIR__ . '/email_tokens.json';

function generate_action_tokens($service, $tokensFile, $page_url) {
    $tokens = file_exists($tokensFile) ? (json_decode(file_get_contents($tokensFile), true) ?: []) : [];
    $now    = time();
    // Prune expired tokens
    $tokens = array_filter($tokens, fn($t) => $t['exp'] > $now);
    $exp    = $now + 48 * 3600;
    $base   = rtrim($page_url, '/') . '/include/email_action.php?token=';
    $urls   = [];
    foreach (['wip', 'resolved'] as $type) {
        $token = bin2hex(random_bytes(16));
        $tokens[$token] = ['service' => $service, 'type' => $type, 'exp' => $exp];
        $urls[$type] = $base . $token;
    }
    @file_put_contents($tokensFile, json_encode($tokens, JSON_PRETTY_PRINT));
    return $urls;
}
$prevData = file_exists($statusFile) ? json_decode(file_get_contents($statusFile), true) : [];
if (!is_array($prevData)) $prevData = [];
// Normalize old "up"/"down" string format to rich object format
foreach ($prevData as $k => $v) {
    if (is_string($v)) {
        $prevData[$k] = ['status' => $v, 'last_down_at' => null, 'last_down_duration_s' => null, 'went_down_at' => null];
    }
}

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

// A service whose type mentions http/https gets a real HTTP request check instead of
// a raw port-open check: a webserver/proxy can keep accepting TCP connections while
// the application behind it is erroring out, which a port check alone would miss.
function check_http($host, $port, $scheme) {
    if (!function_exists('curl_init')) return false;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $scheme . '://' . $host . ':' . $port . '/',
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    curl_exec($ch);
    $errno = curl_errno($ch);
    $code  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $errno === 0 && $code > 0 && $code < 500;
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
        $mail->Username = $smtp['username'];
        $mail->Password = $smtp['password'];
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
        $type = $service['type'] ?? '';
        if (stripos($type, 'http') !== false) {
            $scheme = (stripos($type, 'https') !== false || (int)$service['port'] === 443) ? 'https' : 'http';
            $isUp = check_http($service['host'], (int)$service['port'], $scheme);
        } else {
            $isUp = check_port($service['host'], (int)$service['port']);
        }
    } else {
        // Use OS-specific ping
        $pingCmd = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN'
            ? "ping -n 2 " . escapeshellarg($service['host'])
            : "ping -c 2 " . escapeshellarg($service['host']);
        exec($pingCmd, $output, $result);
        $isUp = $result === 0;
    }
    $curStr  = $isUp ? 'up' : 'down';
    $prev    = $prevData[$name] ?? ['status' => null, 'last_down_at' => null, 'last_down_duration_s' => null, 'went_down_at' => null];
    $prevStr = $prev['status'] ?? null;

    $entry = [
        'status'               => $curStr,
        'last_down_at'         => $prev['last_down_at']         ?? null,
        'last_down_duration_s' => $prev['last_down_duration_s'] ?? null,
        'went_down_at'         => $prev['went_down_at']         ?? null,
    ];

    if ($curStr === 'down') {
        if ($prevStr !== 'down') {
            $entry['went_down_at'] = time();
            $entry['last_down_at'] = time();
        }
    } elseif ($curStr === 'up' && $prevStr === 'down' && !empty($prev['went_down_at'])) {
        $entry['last_down_duration_s'] = time() - (int)$prev['went_down_at'];
        $entry['went_down_at']         = null;
        // Persist to outage log
        $_logFile = __DIR__ . '/outage_log.json';
        $_log = file_exists($_logFile) ? (json_decode(file_get_contents($_logFile), true) ?: []) : [];
        array_unshift($_log, [
            'service'      => $name,
            'went_down_at' => (int)$prev['went_down_at'],
            'came_up_at'   => time(),
            'duration_s'   => $entry['last_down_duration_s'],
        ]);
        if (count($_log) > 200) $_log = array_slice($_log, 0, 200);
        @file_put_contents($_logFile, json_encode($_log, JSON_PRETTY_PRINT));
    }

    $currentStatus[$name] = $entry;

    // Detect status change and send notifications
    // Alert on any real transition, including a service found down on the very first
    // check (no prior baseline), but don't alert when merely establishing an initial
    // "up" baseline on a fresh install.
    if ($prevStr !== $curStr && !($prevStr === null && $curStr === 'up')) {
        $emails = $subscribers[$name] ?? [];
        error_log("[$name] STATUS CHANGE DETECTED: {$prevStr} → {$curStr}\n", 3, $logFile);
        error_log("[$name] Subscribers: " . (!empty($emails) ? implode(', ', $emails) : 'None') . "\n", 3, $logFile);
        foreach ($emails as $email) {
            error_log("Preparing to email subscriber: $email\n", 3, $logFile);
            $subject = "Service '{$name}' is now " . strtoupper($curStr);
            $accentColor = $curStr === 'up' ? '#28a745' : '#dc3545';
            $actionButtons = '';
            if ($show_action_buttons && $curStr === 'down' && !empty($page_url)) {
                $actionUrls = generate_action_tokens($name, $tokensFile, $page_url);
                $actionButtons = '
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 14px;text-align:center;font-weight:500;">Quick actions</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding-right:10px;">
            <a href="' . htmlspecialchars($actionUrls['wip']) . '" style="display:inline-block;padding:10px 22px;background:#fef3c7;color:#92400e;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Work in Progress</a>
          </td>
          <td>
            <a href="' . htmlspecialchars($actionUrls['resolved']) . '" style="display:inline-block;padding:10px 22px;background:#d1fae5;color:#065f46;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Mark Resolved</a>
          </td>
        </tr>
      </table>
      <p style="font-size:11px;color:#cbd5e1;margin:12px 0 0;text-align:center;">Links expire in 48 hours</p>
    </div>';
            }
            $linkUrl = $company_url ?: $page_url;
            $logoHtml = '';
            if (!empty($business_logo) && !empty($page_url)) {
                $logoSrc = rtrim($page_url, '/') . '/' . ltrim($business_logo, '/');
                $logoImg = '<img src="' . htmlspecialchars($logoSrc) . '" alt="' . htmlspecialchars($business_name) . '" style="max-height:36px;display:block;">';
                $logoHtml = !empty($linkUrl) ? '<a href="' . htmlspecialchars($linkUrl) . '" target="_blank" style="text-decoration:none;">' . $logoImg . '</a>' : $logoImg;
            }
            $isUp = $curStr === 'up';
            $statusLabel = $isUp ? 'Operational' : 'Down';
            $statusIcon  = $isUp ? '&#9989;' : '&#128721;';
            $pillBg      = $isUp ? '#ecfdf5' : '#fef2f2';
            $pillColor   = $isUp ? '#059669' : '#dc2626';
            $bannerBg    = $isUp ? '#f0fdf4' : '#fef2f2';
            $bannerBorder = $isUp ? '#bbf7d0' : '#fecaca';
            $message = '
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;">
    <tr><td style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 8px 30px rgba(0,0,0,0.04);">

        <!-- Header -->
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="vertical-align:middle;">' . ($logoHtml ?: '<span style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">' . htmlspecialchars($business_name) . '</span>') . '</td>
            <td style="vertical-align:middle;text-align:right;">
              <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.3px;background:' . $pillBg . ';color:' . $pillColor . ';">' . $statusLabel . '</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Status banner -->
        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:' . $bannerBg . ';border:1px solid ' . $bannerBorder . ';border-radius:12px;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <div style="font-size:36px;line-height:1;margin-bottom:10px;">' . $statusIcon . '</div>
              <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">' . htmlspecialchars($name) . '</div>
              <div style="font-size:14px;font-weight:600;color:' . $pillColor . ';">Service is ' . strtolower($statusLabel) . '</div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Details -->
        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
            <tr>
              <td style="padding:14px 20px;font-size:13px;color:#64748b;">Service</td>
              <td style="padding:14px 20px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">' . htmlspecialchars($name) . '</td>
            </tr>
            <tr>
              <td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Status</td>
              <td style="padding:0 20px 14px;font-size:13px;font-weight:600;color:' . $pillColor . ';text-align:right;">' . strtoupper($curStr) . '</td>
            </tr>
            <tr>
              <td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Checked at</td>
              <td style="padding:0 20px 14px;font-size:13px;color:#334155;text-align:right;">' . date('M j, Y g:i A') . '</td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA button -->
        <tr><td style="padding:24px 32px 0;text-align:center;">
          <a href="' . htmlspecialchars($linkUrl) . '" target="_blank" style="display:inline-block;padding:12px 32px;background:' . $accent_color . ';color:#ffffff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.2px;">View Status Page</a>
        </td></tr>

        <!-- Action buttons -->
        ' . (!empty($actionButtons) ? '<tr><td style="padding:0 32px;">' . $actionButtons . '</td></tr>' : '') . '

        <!-- Footer -->
        <tr><td style="padding:28px 32px;text-align:center;border-top:1px solid #f1f5f9;margin-top:24px;">
          <a href="' . htmlspecialchars($linkUrl) . '" target="_blank" style="font-size:12px;color:#94a3b8;text-decoration:none;">' . htmlspecialchars($business_name) . '</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
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
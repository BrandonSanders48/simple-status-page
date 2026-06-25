<?php
session_start();
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json_data  = json_decode(@file_get_contents($configPath) ?: '{}', true) ?: [];

$_authEnv = getenv('APP_AUTH_REQUIRED');
$_authRequired = ($_authEnv !== false && $_authEnv !== '')
    ? filter_var($_authEnv, FILTER_VALIDATE_BOOLEAN)
    : ($json_data['require_auth'] ?? true);

if ($_authRequired && empty($_SESSION['authenticated'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Not authorized']);
    exit;
}
if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid CSRF token']);
    exit;
}

$to = filter_var($_POST['to'] ?? '', FILTER_VALIDATE_EMAIL);
if (!$to) {
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

$smtp = $json_data['email']['smtp'] ?? null;
$from = $json_data['email']['from'] ?? 'status@yourdomain.com';
$reply = $json_data['email']['reply_to'] ?? $from;
$business_name = $json_data['branding']['business_name'] ?? $json_data['business_name'] ?? 'Status Page';
$accent_color  = $json_data['theme']['accent_color'] ?? '#06b6d4';
$page_url = $json_data['page_url']
    ?? ($json_data['meta']['page_url']
    ?? ($json_data['branding']['company_url']
    ?? ($json_data['company_url'] ?? '')));
$company_url = $json_data['branding']['company_url'] ?? $json_data['company_url'] ?? '';
$linkUrl = $company_url ?: $page_url;

$subject = 'Test Email - ' . $business_name;
$body = '
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;">
    <tr><td style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 8px 30px rgba(0,0,0,0.04);">

        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">' . htmlspecialchars($business_name) . '</span>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <div style="font-size:36px;line-height:1;margin-bottom:10px;">&#9989;</div>
              <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">Email Working</div>
              <div style="font-size:14px;font-weight:600;color:#059669;">SMTP configuration is correct</div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
            <tr>
              <td style="padding:14px 20px;font-size:13px;color:#64748b;">From</td>
              <td style="padding:14px 20px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">' . htmlspecialchars($from) . '</td>
            </tr>
            <tr>
              <td style="padding:0 20px 14px;font-size:13px;color:#64748b;">To</td>
              <td style="padding:0 20px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">' . htmlspecialchars($to) . '</td>
            </tr>
            <tr>
              <td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Sent at</td>
              <td style="padding:0 20px 14px;font-size:13px;color:#334155;text-align:right;">' . date('M j, Y g:i A') . '</td>
            </tr>
          </table>
        </td></tr>

        ' . (!empty($linkUrl) ? '<tr><td style="padding:24px 32px 0;text-align:center;">
          <a href="' . htmlspecialchars($linkUrl) . '" target="_blank" style="display:inline-block;padding:12px 32px;background:' . $accent_color . ';color:#ffffff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.2px;">View Status Page</a>
        </td></tr>' : '') . '

        <tr><td style="padding:28px 32px;text-align:center;border-top:1px solid #f1f5f9;margin-top:24px;">
          <span style="font-size:12px;color:#94a3b8;">' . htmlspecialchars($business_name) . '</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>';

if (!$smtp || empty($smtp['host'])) {
    echo json_encode(['error' => 'SMTP is not configured. Save your SMTP settings first.']);
    exit;
}

require_once __DIR__ . '/cron/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/cron/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/cron/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host       = $smtp['host'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $smtp['username'];
    $mail->Password   = $smtp['password'];
    $mail->SMTPSecure = $smtp['secure'] ?? 'tls';
    $mail->Port       = $smtp['port'];
    $mail->setFrom($from);
    $mail->addReplyTo($reply);
    $mail->addAddress($to);
    $mail->Subject    = $subject;
    $mail->Body       = $body;
    $mail->isHTML(true);
    $mail->send();
    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    echo json_encode(['error' => $mail->ErrorInfo]);
}

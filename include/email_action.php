<?php
$configPath  = __DIR__ . '/configuration.json';
$json_data   = json_decode(@file_get_contents($configPath) ?: '{}', true) ?: [];
$page_url    = $json_data['page_url']
    ?? ($json_data['meta']['page_url']
    ?? ($json_data['branding']['company_url']
    ?? ($json_data['company_url'] ?? '')));
$tokensFile  = __DIR__ . '/cron/email_tokens.json';

$token = preg_replace('/[^a-f0-9]/', '', $_GET['token'] ?? '');
if (!$token) { http_response_code(400); exit('Invalid request.'); }

$tokens = file_exists($tokensFile) ? (json_decode(file_get_contents($tokensFile), true) ?: []) : [];

function render_page($title, $body, $page_url) {
    $redirect = htmlspecialchars($page_url ?: '../index.php');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>' . htmlspecialchars($title) . '</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px 36px;max-width:440px;width:90%;text-align:center}
  h1{font-size:1.4rem;font-weight:700;margin:0 0 8px;color:#1e293b}
  p{color:#64748b;font-size:.95rem;margin:0 0 24px}
  .btn{display:inline-block;padding:11px 28px;border-radius:9px;font-weight:600;font-size:.9rem;text-decoration:none;cursor:pointer;border:none;margin:4px}
  .btn-amber{background:#f59e0b;color:#fff}
  .btn-green{background:#10b981;color:#fff}
  .btn-gray{background:#e2e8f0;color:#475569}
  .icon{font-size:2.5rem;margin-bottom:12px}
</style></head><body><div class="card">' . $body . '
<br><a href="' . $redirect . '" class="btn btn-gray" style="margin-top:8px">← Back to Status Page</a>
</div></body></html>';
}

// --- POST: confirm and create incident ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($tokens[$token]) || $tokens[$token]['exp'] < time()) {
        render_page('Expired', '<div class="icon">⏱</div><h1>Link Expired</h1><p>This action link has already been used or has expired.</p>', $page_url);
        exit;
    }

    $payload = $tokens[$token];
    unset($tokens[$token]);
    @file_put_contents($tokensFile, json_encode(array_filter($tokens, fn($t) => $t['exp'] > time()), JSON_PRETTY_PRINT));

    $service = $payload['service'];
    $type    = $payload['type'];
    $now     = date('Y-m-d\TH:i');

    $incidentsFile = __DIR__ . '/incidents.json';
    $incidents = file_exists($incidentsFile) ? (json_decode(file_get_contents($incidentsFile), true) ?: []) : [];

    if ($type === 'wip') {
        $incidents[] = [
            'title'       => htmlspecialchars($service) . ' — Work in Progress',
            'description' => 'Our team is actively investigating and working to resolve this issue.',
            'severity'    => 'degraded',
            'start_time'  => $now,
            'end_time'    => null,
            'time'        => $now,
        ];
        $label = 'Work in Progress incident posted.';
        $icon  = '⚙️';
    } else {
        $incidents[] = [
            'title'       => htmlspecialchars($service) . ' — Resolved',
            'description' => 'The issue affecting ' . htmlspecialchars($service) . ' has been resolved.',
            'severity'    => 'resolved',
            'start_time'  => $now,
            'end_time'    => $now,
            'time'        => $now,
        ];
        $label = 'Resolved incident posted.';
        $icon  = '✅';
    }

    file_put_contents($incidentsFile, json_encode($incidents, JSON_PRETTY_PRINT));

    render_page('Done', '<div class="icon">' . $icon . '</div><h1>Done</h1><p>' . htmlspecialchars($label) . ' It is now visible on the status page.</p>', $page_url);
    exit;
}

// --- GET: show confirmation page (safe for email prefetchers) ---
if (!isset($tokens[$token]) || $tokens[$token]['exp'] < time()) {
    render_page('Expired', '<div class="icon">⏱</div><h1>Link Expired</h1><p>This action link has already been used or has expired.</p>', $page_url);
    exit;
}

$payload = $tokens[$token];
$service = htmlspecialchars($payload['service']);
$type    = $payload['type'];
$isWip   = $type === 'wip';
$btnCls  = $isWip ? 'btn-amber' : 'btn-green';
$icon    = $isWip ? '⚙️' : '✅';
$label   = $isWip ? 'Work in Progress' : 'Mark as Resolved';
$desc    = $isWip
    ? 'This will post a <b>Work in Progress</b> incident for <b>' . $service . '</b> on the status page.'
    : 'This will post a <b>Resolved</b> incident for <b>' . $service . '</b> on the status page.';

render_page('Confirm Action',
    '<div class="icon">' . $icon . '</div>
    <h1>' . $label . '</h1>
    <p>' . $desc . '</p>
    <form method="post" action="?token=' . htmlspecialchars($token) . '">
        <button type="submit" class="btn ' . $btnCls . '">' . $label . '</button>
    </form>', $page_url);

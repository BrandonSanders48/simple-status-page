<?php
declare(strict_types=1);
session_start();

$configPath = __DIR__ . '/include/configuration.json';

// Auth — env var takes precedence, then config.json require_auth, then default true
$auth_env      = getenv('APP_AUTH_REQUIRED');
$cfg_for_auth  = json_decode(@file_get_contents(__DIR__ . '/include/configuration.json') ?: '{}', true) ?: [];
$auth_required = ($auth_env !== false && $auth_env !== '')
    ? filter_var($auth_env, FILTER_VALIDATE_BOOLEAN)
    : ($cfg_for_auth['require_auth'] ?? true);
if ($auth_required && !(isset($_SESSION['authenticated']) && $_SESSION['authenticated'])) {
    header('Location: index.php'); exit();
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$json      = @file_get_contents($configPath) ?: '{}';
$json_data = json_decode($json, true) ?: [];

// Handle POST save
$save_ok  = false;
$save_err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        $save_err = 'Invalid CSRF token.';
    } else {
        $incoming = json_decode($_POST['json'] ?? '', true);
        if ($incoming === null) {
            $save_err = 'Invalid JSON — ' . json_last_error_msg();
        } else {
            // Auto-increment patch version (e.g. 1.4 → 1.5)
            $currentVer = $incoming['meta']['version'] ?? ($json_data['meta']['version'] ?? '1.0');
            $parts = explode('.', (string)$currentVer);
            $incoming['meta']['version'] = ($parts[0] ?? '1') . '.' . ((int)($parts[1] ?? 0) + 1);
            // Merge so unknown fields (email, etc.) are preserved
            $merged = array_merge($json_data, $incoming);
            file_put_contents($configPath, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            $json_data = $merged;
            $json      = json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            $save_ok   = true;
        }
    }
}

$dark_mode  = $_COOKIE['dark_mode'] ?? 'off';
$is_dark    = $dark_mode === 'on';
$local_tw   = file_exists(__DIR__ . '/assets/tailwind.min.js');
$local_fa   = file_exists(__DIR__ . '/assets/fontawesome/css/all.min.css');
$embed      = ($_GET['embed'] ?? '') === '1'; // loaded inside the modal iframe

// Helpers
function e($v) { return htmlspecialchars((string)($v ?? ''), ENT_QUOTES); }
function checked($v) { return $v ? 'checked' : ''; }
?>
<!DOCTYPE html>
<html lang="en"<?= $is_dark ? ' class="dark"' : '' ?>>
<head>
    <meta charset="UTF-8">
    <title>Configuration — <?= e($json_data['business_name'] ?? 'Status Page') ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="images/favicon.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <?php if ($local_tw): ?>
    <script src="assets/tailwind.min.js"></script>
    <?php else: ?>
    <script src="https://cdn.tailwindcss.com"></script>
    <?php endif; ?>
    <script>tailwind.config = { darkMode: 'class', theme: { extend: { fontFamily: { sans: ['Inter','system-ui','sans-serif'] } } } }</script>
    <?php if ($local_fa): ?>
    <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
    <?php else: ?>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous">
    <?php endif; ?>
    <link href="status-page.css" rel="stylesheet">
    <style>
        /* ── Tabs ── */
        .tab-btn { padding:9px 16px; font-size:13px; font-weight:500; border-bottom:2px solid transparent; color:#64748b; cursor:pointer; white-space:nowrap; transition:color .15s,border-color .15s; }
        .tab-btn:hover { color:#6366f1; }
        .tab-btn.active { color:#6366f1; border-bottom-color:#6366f1; }
        .dark .tab-btn { color:#64748b; }
        .dark .tab-btn:hover, .dark .tab-btn.active { color:#818cf8; border-bottom-color:#818cf8; }

        /* ── Form inputs ── */
        .cfg-input { width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px 11px; font-size:13px; background:#fff; color:#0f172a; transition:border-color .15s,box-shadow .15s; }
        .cfg-input:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
        .dark .cfg-input { background:#0d1e36; border-color:rgba(148,163,184,.14); color:#cbd5e1; }
        .dark .cfg-input:focus { border-color:#818cf8; box-shadow:0 0 0 3px rgba(129,140,248,.14); }
        .cfg-input[readonly] { cursor:default; background:#f1f5f9 !important; color:#94a3b8 !important; border-color:#e2e8f0 !important; }
        .dark .cfg-input[readonly] { background:#060e1c !important; color:#4b5675 !important; border-color:rgba(148,163,184,.06) !important; }

        /* ── Labels ── */
        .cfg-label { display:block; font-size:11px; font-weight:600; color:#64748b; margin-bottom:5px; letter-spacing:0.04em; text-transform:uppercase; }
        .dark .cfg-label { color:#475569; }

        /* ── Table inputs ── */
        .tbl-input { width:100%; border:0; background:transparent; font-size:12.5px; padding:5px 7px; color:#1e293b; border-radius:5px; }
        .tbl-input:focus { outline:none; background:#eff2ff; box-shadow:inset 0 0 0 1.5px #6366f1; }
        .dark .tbl-input { color:#94a3b8; }
        .dark .tbl-input:focus { background:rgba(99,102,241,.1); box-shadow:inset 0 0 0 1.5px #818cf8; }

        /* ── Tables ── */
        table { width:100%; border-collapse:collapse; }
        th { font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:#94a3b8; padding:6px 8px 8px; text-align:left; border-bottom:1px solid #e2e8f0; }
        .dark th { color:#334155; border-color:rgba(148,163,184,.08); }
        td { padding:2px 2px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
        .dark td { border-color:rgba(7,16,31,.6); }
        tr:hover td { background:#f8fafc; }
        .dark tr:hover td { background:rgba(15,31,56,.4); }

        /* ── Action buttons ── */
        .del-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:6px; color:#f87171; cursor:pointer; transition:background .15s,color .15s; flex-shrink:0; }
        .del-btn:hover { background:rgba(239,68,68,.1); color:#ef4444; }
        .dark .del-btn { color:rgba(248,113,113,.4); }
        .dark .del-btn:hover { background:rgba(239,68,68,.12); color:#f87171; }
        .add-row-btn { font-size:12px; font-weight:600; color:#6366f1; cursor:pointer; display:flex; align-items:center; gap:5px; padding:7px 4px; margin-top:6px; opacity:.8; transition:opacity .15s; }
        .add-row-btn:hover { opacity:1; }
        .dark .add-row-btn { color:#818cf8; }

        /* ── Section cards ── */
        .section-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:22px 24px; margin-bottom:16px; }
        .dark .section-card { background:linear-gradient(150deg, #0d1e38 0%, #111c2e 100%); border-color:rgba(148,163,184,.08); box-shadow:0 1px 0 rgba(255,255,255,.02) inset; }
    </style>
</head>
<body class="bg-slate-50 dark:bg-[#0d1b30] text-slate-900 dark:text-slate-100 font-sans antialiased min-h-screen">

<!-- Sticky top bar -->
<div class="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/70 shadow-sm">
    <div class="<?= $embed ? 'px-4' : 'max-w-5xl mx-auto px-4' ?> h-14 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
            <?php if ($embed): ?>
                <h1 class="text-base font-semibold text-slate-800 dark:text-slate-200">
                    <i class="fa-solid fa-gear text-indigo-500 mr-1.5"></i>Configuration
                </h1>
            <?php else: ?>
                <a href="index.php" class="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors font-medium">
                    <i class="fa-solid fa-arrow-left text-xs"></i> Status Page
                </a>
                <span class="text-slate-300 dark:text-slate-700">|</span>
                <h1 class="text-base font-semibold text-slate-800 dark:text-slate-200">
                    <i class="fa-solid fa-gear text-indigo-500 mr-1.5"></i>Configuration
                </h1>
            <?php endif; ?>
        </div>
        <div class="flex items-center gap-2">
            <span id="save-status" class="text-sm hidden"></span>
            <button id="saveBtn" class="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                <i class="fa-solid fa-floppy-disk text-xs"></i> Save
            </button>
            <?php if ($embed): ?>
            <button type="button" onclick="window.parent.closeConfigModal(false)"
                class="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xl leading-none">
                &times;
            </button>
            <?php endif; ?>
        </div>
    </div>
    <!-- Tab bar -->
    <div class="<?= $embed ? 'px-4' : 'max-w-5xl mx-auto px-4' ?> flex gap-0 overflow-x-auto border-t border-slate-100 dark:border-slate-800">
        <button class="tab-btn active" data-tab="general">
            <i class="fa-solid fa-sliders mr-1.5 text-emerald-500"></i>General
        </button>
        <button class="tab-btn" data-tab="services">
            <i class="fa-solid fa-server mr-1.5 text-indigo-500"></i>Services
        </button>
        <button class="tab-btn" data-tab="rss">
            <i class="fa-solid fa-rss mr-1.5 text-orange-500"></i>RSS Feeds
        </button>
        <button class="tab-btn" data-tab="network">
            <i class="fa-solid fa-network-wired mr-1.5 text-sky-500"></i>Network
        </button>
        <button class="tab-btn" data-tab="notifications">
            <i class="fa-solid fa-bell mr-1.5 text-violet-500"></i>Notifications
        </button>
    </div>
</div>

<?php if ($save_ok): ?>
<div id="cfg-saved-alert" class="<?= $embed ? 'px-4' : 'max-w-5xl mx-auto px-4' ?> mt-4">
    <div class="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-sm">
        <span><i class="fa-solid fa-circle-check mr-1.5"></i>Configuration saved successfully.</span>
        <button onclick="document.getElementById('cfg-saved-alert').remove()" class="ml-4 text-emerald-500 hover:text-emerald-700 text-xl leading-none font-light">&times;</button>
    </div>
</div>
<?php endif; ?>
<?php if ($save_err): ?>
<div class="<?= $embed ? 'px-4' : 'max-w-5xl mx-auto px-4' ?> mt-4">
    <div class="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
        <i class="fa-solid fa-circle-xmark"></i> <?= e($save_err) ?>
    </div>
</div>
<?php endif; ?>

<div class="<?= $embed ? 'px-4' : 'max-w-5xl mx-auto px-4' ?> py-5 pb-10">

    <!-- ── Services tab ─────────────────────────────────────────────── -->
    <div id="tab-services" class="tab-panel hidden">
        <div class="section-card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300">Monitored Services</h2>
                <span class="text-xs text-slate-400">Leave Port blank for ICMP ping</span>
            </div>
            <div class="overflow-x-auto">
            <table id="hosts-table">
                <thead>
                    <tr>
                        <th style="width:15%">Name</th>
                        <th style="width:20%">Host / IP</th>
                        <th style="width:8%">Port</th>
                        <th style="width:10%">Type</th>
                        <th style="width:40%">Description</th>
                        <th style="width:7%"></th>
                    </tr>
                </thead>
                <tbody id="hosts-tbody">
                <?php foreach ($json_data['internal_hosts'] ?? [] as $i => $h): ?>
                <tr data-row="<?= $i ?>">
                    <td><input class="tbl-input" data-field="name"        value="<?= e($h['name'] ?? '') ?>"></td>
                    <td><input class="tbl-input" data-field="host"        value="<?= e($h['host'] ?? '') ?>"></td>
                    <td><input class="tbl-input" data-field="port" type="text" placeholder="ping" value="<?= $h['port'] !== null ? e($h['port']) : '' ?>"></td>
                    <td><input class="tbl-input" data-field="type"        value="<?= e($h['type'] ?? '') ?>"></td>
                    <td><input class="tbl-input" data-field="description" value="<?= e($h['description'] ?? '') ?>"></td>
                    <td><button type="button" class="del-btn" onclick="this.closest('tr').remove()" title="Remove"><i class="fa fa-trash text-xs"></i></button></td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            </div>
            <button type="button" class="add-row-btn" onclick="addHostRow()">
                <i class="fa-solid fa-plus text-xs"></i> Add Service
            </button>
        </div>
    </div>

    <!-- ── RSS tab ──────────────────────────────────────────────────── -->
    <div id="tab-rss" class="tab-panel hidden">
        <div class="section-card">
            <div class="flex items-center justify-between mb-4">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300">RSS / Atom Status Feeds</h2>
            </div>
            <div class="overflow-x-auto">
            <table id="rss-table">
                <thead>
                    <tr>
                        <th style="width:18%">Name</th>
                        <th style="width:40%">Feed URL</th>
                        <th style="width:9%">Format</th>
                        <th style="width:26%">Description</th>
                        <th style="width:7%"></th>
                    </tr>
                </thead>
                <tbody id="rss-tbody">
                <?php foreach ($json_data['RSS'] ?? [] as $i => $f): ?>
                <tr data-row="<?= $i ?>">
                    <td><input class="tbl-input" data-field="name"        value="<?= e($f['name'] ?? '') ?>"></td>
                    <td><input class="tbl-input" data-field="host"        value="<?= e($f['host'] ?? '') ?>" placeholder="https://..."></td>
                    <td>
                        <select class="tbl-input" data-field="tag">
                            <option value="item"  <?= ($f['tag'] ?? 'item') === 'item'  ? 'selected' : '' ?>>RSS</option>
                            <option value="entry" <?= ($f['tag'] ?? '') === 'entry' ? 'selected' : '' ?>>Atom</option>
                        </select>
                    </td>
                    <td><input class="tbl-input" data-field="description" value="<?= e($f['description'] ?? '') ?>"></td>
                    <td><button type="button" class="del-btn" onclick="this.closest('tr').remove()" title="Remove"><i class="fa fa-trash text-xs"></i></button></td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            </div>
            <button type="button" class="add-row-btn" onclick="addRssRow()">
                <i class="fa-solid fa-plus text-xs"></i> Add Feed
            </button>
        </div>
    </div>

    <!-- ── General tab ─────────────────────────────────────────────── -->
    <div id="tab-general" class="tab-panel">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <!-- Branding card -->
            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Branding</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">Business / Site Name</label>
                        <input id="cfg-business-name" class="cfg-input" value="<?= e($json_data['branding']['business_name'] ?? $json_data['business_name'] ?? '') ?>">
                    </div>
                    <div>
                        <label class="cfg-label">Logo Path or URL</label>
                        <input id="cfg-business-logo" class="cfg-input" value="<?= e($json_data['branding']['business_logo'] ?? $json_data['business_logo'] ?? '') ?>" placeholder="images/logo.webp">
                        <?php $_logo = $json_data['branding']['business_logo'] ?? $json_data['business_logo'] ?? ''; if (!empty($_logo)): ?>
                        <img src="<?= e($_logo) ?>" alt="Logo preview" class="mt-2 max-h-12 rounded bg-white p-1 border border-slate-200">
                        <?php endif; ?>
                    </div>
                    <div>
                        <label class="cfg-label">Company URL</label>
                        <input id="cfg-company-url" class="cfg-input" type="url" value="<?= e($json_data['branding']['company_url'] ?? $json_data['company_url'] ?? '') ?>" placeholder="https://example.com">
                    </div>
                    <div>
                        <label class="cfg-label">Support Email</label>
                        <input id="cfg-support-email" class="cfg-input" type="email" value="<?= e($json_data['branding']['support_email'] ?? $json_data['support_email'] ?? '') ?>" placeholder="support@example.com">
                    </div>
                    <div>
                        <label class="cfg-label">Support Phone</label>
                        <input id="cfg-support-phone" class="cfg-input" type="text" value="<?= e($json_data['branding']['support_phone'] ?? $json_data['support_phone'] ?? '') ?>" placeholder="+1 555-000-0000">
                    </div>
                    <div>
                        <label class="cfg-label">Footer Message</label>
                        <input id="cfg-footer-message" class="cfg-input" value="<?= e($json_data['branding']['footer_message'] ?? $json_data['footer_message'] ?? '') ?>">
                    </div>
                </div>
            </div>

            <!-- Announcement + Theme stacked -->
            <div class="flex flex-col gap-4">

                <!-- Announcement card -->
                <div class="section-card">
                    <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Announcement Banner</h2>
                    <div class="space-y-4">
                        <div>
                            <label class="cfg-label">Banner Text</label>
                            <input id="cfg-announcement-banner" class="cfg-input" value="<?= e($json_data['branding']['announcement_banner'] ?? $json_data['announcement_banner'] ?? '') ?>" placeholder="Leave blank to hide banner">
                        </div>
                        <div>
                            <label class="cfg-label">Banner Type</label>
                            <select id="cfg-announcement-type" class="cfg-input">
                                <?php $annType = $json_data['branding']['announcement_type'] ?? $json_data['announcement_type'] ?? 'info'; ?>
                                <option value="info"    <?= $annType === 'info'    ? 'selected' : '' ?>>Info</option>
                                <option value="warning" <?= $annType === 'warning' ? 'selected' : '' ?>>Warning</option>
                                <option value="error"   <?= $annType === 'error'   ? 'selected' : '' ?>>Error</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Theme card -->
                <div class="section-card">
                    <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Theme Colors</h2>
                    <div class="grid grid-cols-1 gap-3">
                        <?php
                        $themeColors = [
                            'cfg-primary-color' => ['Primary',  $json_data['theme']['primary_color']  ?? '#6366f1'],
                            'cfg-accent-color'  => ['Accent',   $json_data['theme']['accent_color']   ?? '#8b5cf6'],
                            'cfg-success-color' => ['Success',  $json_data['theme']['success_color']  ?? '#10b981'],
                            'cfg-warning-color' => ['Warning',  $json_data['theme']['warning_color']  ?? '#f59e0b'],
                            'cfg-error-color'   => ['Error',    $json_data['theme']['error_color']    ?? '#ef4444'],
                        ];
                        foreach ($themeColors as $id => [$label, $val]): ?>
                        <div class="flex items-center justify-between gap-3">
                            <label class="cfg-label mb-0 flex-1"><?= $label ?></label>
                            <input id="<?= $id ?>" type="color" class="w-10 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-600 p-0.5" value="<?= e($val) ?>">
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>

            </div><!-- /col -->

            <!-- SLA card -->
            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">SLA Tracking</h2>
                <div class="space-y-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input id="cfg-sla-enabled" type="checkbox" class="w-4 h-4 accent-indigo-600" <?= checked($json_data['sla']['enabled'] ?? false) ?>>
                        <span class="text-sm font-medium">Enable SLA reporting</span>
                    </label>
                    <div>
                        <label class="cfg-label">Uptime Target (%)</label>
                        <input id="cfg-sla-target" class="cfg-input" type="number" min="0" max="100" step="0.01"
                               value="<?= e($json_data['sla']['uptime_target'] ?? 99.9) ?>">
                    </div>
                    <div>
                        <label class="cfg-label">Reporting Period</label>
                        <select id="cfg-sla-period" class="cfg-input">
                            <?php $slaPeriod = $json_data['sla']['reporting_period'] ?? 'monthly'; ?>
                            <option value="monthly"   <?= $slaPeriod === 'monthly'   ? 'selected' : '' ?>>Monthly</option>
                            <option value="weekly"    <?= $slaPeriod === 'weekly'    ? 'selected' : '' ?>>Weekly</option>
                            <option value="quarterly" <?= $slaPeriod === 'quarterly' ? 'selected' : '' ?>>Quarterly</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Meta card -->
            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">About / Meta</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">Description</label>
                        <input id="cfg-meta-description" class="cfg-input" value="<?= e($json_data['meta']['description'] ?? '') ?>" placeholder="A brief description of this status page">
                    </div>
                    <div>
                        <label class="cfg-label">Author</label>
                        <input id="cfg-author" class="cfg-input" value="<?= e($json_data['meta']['author'] ?? '') ?>">
                    </div>
                    <div>
                        <label class="cfg-label">Config Version <span class="text-slate-400 font-normal normal-case">(auto-increments on save)</span></label>
                        <input id="cfg-version" class="cfg-input" value="<?= e($json_data['meta']['version'] ?? '1.0') ?>" readonly>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- ── Network tab ─────────────────────────────────────────────── -->
    <div id="tab-network" class="tab-panel hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Connectivity Checks</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">Default Gateway</label>
                        <input id="cfg-gateway" class="cfg-input" value="<?= e($json_data['network']['gateway'] ?? '') ?>" placeholder="192.168.1.1">
                        <p class="text-xs text-slate-400 mt-1">Checked via ICMP ping for Local-Area status.</p>
                    </div>
                    <div>
                        <label class="cfg-label">Public DNS Server</label>
                        <input id="cfg-public-dns" class="cfg-input" value="<?= e($json_data['network']['public_dns'] ?? '8.8.8.8') ?>">
                        <p class="text-xs text-slate-400 mt-1">Checked on port 53 for Wide-Area status.</p>
                    </div>
                    <div>
                        <label class="cfg-label">Internal Domain</label>
                        <input id="cfg-domain" class="cfg-input" value="<?= e($json_data['network']['domain'] ?? '') ?>" placeholder="corp.local">
                    </div>
                </div>
            </div>

            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-1">ISP Detection Map</h2>
                <p class="text-xs text-slate-400 mb-4">Maps your public IP to an ISP name shown in the Wide-Area status.</p>
                <table id="isp-table">
                    <thead><tr><th>Public IP</th><th>ISP Label</th><th></th></tr></thead>
                    <tbody id="isp-tbody">
                    <?php foreach ($json_data['network']['isp_map'] ?? [] as $ip => $name): ?>
                    <tr>
                        <td><input class="tbl-input" data-field="ip"   value="<?= e($ip) ?>"   placeholder="1.2.3.4"></td>
                        <td><input class="tbl-input" data-field="name" value="<?= e($name) ?>" placeholder="ISP Name"></td>
                        <td><button type="button" class="del-btn" onclick="this.closest('tr').remove()"><i class="fa fa-trash text-xs"></i></button></td>
                    </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
                <button type="button" class="add-row-btn" onclick="addIspRow()">
                    <i class="fa-solid fa-plus text-xs"></i> Add ISP
                </button>
            </div>
        </div>
    </div>

    <!-- ── Notifications tab ─────────────────────────────────────────── -->
    <div id="tab-notifications" class="tab-panel hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <!-- Display & Behaviour card -->
            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Display &amp; Behaviour</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">Auto-Refresh Interval (ms)</label>
                        <input id="cfg-refresh-rate" class="cfg-input" type="number" min="3000" step="500"
                               value="<?= (int)($json_data['refresh_rate'] ?? 30000) ?>">
                        <p class="text-xs text-slate-400 mt-1">3000 = 3 seconds. Minimum 3000.</p>
                    </div>
                    <div class="flex flex-col gap-3 pt-1">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="cfg-alert-sound" type="checkbox" class="w-4 h-4 accent-indigo-600" <?= checked($json_data['alert_sound'] ?? false) ?>>
                            <span class="text-sm font-medium">Play alert sound on status change</span>
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="cfg-browser-notify" type="checkbox" class="w-4 h-4 accent-indigo-600" <?= checked($json_data['browser_notify'] ?? false) ?>>
                            <span class="text-sm font-medium">Enable browser notifications</span>
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="cfg-require-auth" type="checkbox" class="w-4 h-4 accent-indigo-600" <?= checked($json_data['require_auth'] ?? true) ?>>
                            <span class="text-sm font-medium">Require login for admin features
                                <span class="block text-xs text-slate-400 font-normal">Uncheck to allow config access without logging in</span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Email / Notifications card -->
            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Email / Notifications</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">From Address</label>
                        <input id="cfg-email-from" class="cfg-input" type="email" value="<?= e($json_data['email']['from'] ?? '') ?>" placeholder="noreply@example.com">
                    </div>
                    <div>
                        <label class="cfg-label">Reply-To Address</label>
                        <input id="cfg-email-replyto" class="cfg-input" type="email" value="<?= e($json_data['email']['reply_to'] ?? '') ?>" placeholder="support@example.com">
                    </div>
                    <div>
                        <label class="cfg-label">SMTP Host</label>
                        <input id="cfg-smtp-host" class="cfg-input" type="text" value="<?= e($json_data['email']['smtp']['host'] ?? '') ?>" placeholder="smtp.example.com">
                    </div>
                    <div>
                        <label class="cfg-label">SMTP Port</label>
                        <input id="cfg-smtp-port" class="cfg-input" type="number" min="1" max="65535"
                               value="<?= (int)($json_data['email']['smtp']['port'] ?? 587) ?>">
                    </div>
                    <div>
                        <label class="cfg-label">SMTP Security</label>
                        <select id="cfg-smtp-secure" class="cfg-input">
                            <?php $smtpSecure = $json_data['email']['smtp']['secure'] ?? 'tls'; ?>
                            <option value="tls"  <?= $smtpSecure === 'tls'  ? 'selected' : '' ?>>TLS (STARTTLS)</option>
                            <option value="ssl"  <?= $smtpSecure === 'ssl'  ? 'selected' : '' ?>>SSL</option>
                            <option value="none" <?= $smtpSecure === 'none' ? 'selected' : '' ?>>None</option>
                        </select>
                    </div>
                </div>
            </div>

        </div>
    </div>

</div><!-- /max-w-5xl -->

<!-- Hidden save form -->
<form id="save-form" method="post" style="display:none">
    <input type="hidden" name="csrf_token" value="<?= e($_SESSION['csrf_token']) ?>">
    <input type="hidden" name="json" id="save-json-input">
</form>

<script>
// ── Inline config data (preserves unknown fields on save) ───────────
var _cfg = <?= json_encode($json_data, JSON_UNESCAPED_SLASHES) ?>;

// ── Tab switching ────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.getElementById('tab-' + this.dataset.tab).classList.remove('hidden');
        this.classList.add('active');
    });
});

// ── Row counters ────────────────────────────────────────────────────
var _hostIdx = <?= count($json_data['internal_hosts'] ?? []) ?>;
var _rssIdx  = <?= count($json_data['RSS'] ?? []) ?>;

function addHostRow() {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="tbl-input" data-field="name" placeholder="My Service"></td>'
        + '<td><input class="tbl-input" data-field="host" placeholder="hostname or IP"></td>'
        + '<td><input class="tbl-input" data-field="port" placeholder="ping"></td>'
        + '<td><input class="tbl-input" data-field="type" placeholder="PING"></td>'
        + '<td><input class="tbl-input" data-field="description"></td>'
        + '<td><button type="button" class="del-btn" onclick="this.closest(\'tr\').remove()"><i class="fa fa-trash text-xs"></i></button></td>';
    document.getElementById('hosts-tbody').appendChild(tr);
    tr.querySelector('input').focus();
}

function addRssRow() {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="tbl-input" data-field="name" placeholder="Service Name"></td>'
        + '<td><input class="tbl-input" data-field="host" placeholder="https://status.example.com/rss"></td>'
        + '<td><select class="tbl-input" data-field="tag"><option value="item">RSS</option><option value="entry">Atom</option></select></td>'
        + '<td><input class="tbl-input" data-field="description"></td>'
        + '<td><button type="button" class="del-btn" onclick="this.closest(\'tr\').remove()"><i class="fa fa-trash text-xs"></i></button></td>';
    document.getElementById('rss-tbody').appendChild(tr);
    tr.querySelector('input').focus();
}

function addIspRow() {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="tbl-input" data-field="ip" placeholder="1.2.3.4"></td>'
        + '<td><input class="tbl-input" data-field="name" placeholder="ISP Name"></td>'
        + '<td><button type="button" class="del-btn" onclick="this.closest(\'tr\').remove()"><i class="fa fa-trash text-xs"></i></button></td>';
    document.getElementById('isp-tbody').appendChild(tr);
    tr.querySelector('input').focus();
}

// ── Config builder ──────────────────────────────────────────────────
function v(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
function chk(id) { var e = document.getElementById(id); return e ? e.checked : false; }

function buildHosts() {
    var rows = [];
    document.querySelectorAll('#hosts-tbody tr').forEach(function(tr) {
        var host = tr.querySelector('[data-field="host"]').value.trim();
        if (!host) return;
        var portVal = tr.querySelector('[data-field="port"]').value.trim();
        rows.push({
            name: tr.querySelector('[data-field="name"]').value.trim(),
            host: host,
            port: (portVal === '' || portVal.toLowerCase() === 'ping') ? null : parseInt(portVal) || null,
            type: tr.querySelector('[data-field="type"]').value.trim().toUpperCase() || 'PING',
            description: tr.querySelector('[data-field="description"]').value.trim()
        });
    });
    return rows;
}

function buildRss() {
    var rows = [];
    document.querySelectorAll('#rss-tbody tr').forEach(function(tr) {
        var host = tr.querySelector('[data-field="host"]').value.trim();
        if (!host) return;
        rows.push({
            name: tr.querySelector('[data-field="name"]').value.trim(),
            host: host,
            tag: tr.querySelector('[data-field="tag"]').value,
            description: tr.querySelector('[data-field="description"]').value.trim()
        });
    });
    return rows;
}

function buildIspMap() {
    var map = {};
    document.querySelectorAll('#isp-tbody tr').forEach(function(tr) {
        var ip   = tr.querySelector('[data-field="ip"]').value.trim();
        var name = tr.querySelector('[data-field="name"]').value.trim();
        if (ip && name) map[ip] = name;
    });
    return map;
}

function buildConfig() {
    // Start from current full config to preserve unknown fields
    var cfg = JSON.parse(JSON.stringify(_cfg));

    cfg.meta = Object.assign(cfg.meta || {}, {
        version:     v('cfg-version'),
        description: v('cfg-meta-description'),
        author:      v('cfg-author')
    });
    cfg.branding = Object.assign(cfg.branding || {}, {
        business_name:        v('cfg-business-name'),
        business_logo:        v('cfg-business-logo'),
        company_url:          v('cfg-company-url'),
        support_email:        v('cfg-support-email'),
        support_phone:        v('cfg-support-phone'),
        footer_message:       v('cfg-footer-message'),
        announcement_banner:  v('cfg-announcement-banner'),
        announcement_type:    v('cfg-announcement-type')
    });
    // Backwards-compat flat fields
    cfg.business_name  = v('cfg-business-name');
    cfg.business_logo  = v('cfg-business-logo');
    cfg.footer_message = v('cfg-footer-message');
    cfg.theme = Object.assign(cfg.theme || {}, {
        primary_color: v('cfg-primary-color'),
        accent_color:  v('cfg-accent-color'),
        success_color: v('cfg-success-color'),
        warning_color: v('cfg-warning-color'),
        error_color:   v('cfg-error-color')
    });
    cfg.sla = Object.assign(cfg.sla || {}, {
        enabled:          chk('cfg-sla-enabled'),
        uptime_target:    parseFloat(v('cfg-sla-target')) || 99.9,
        reporting_period: v('cfg-sla-period')
    });
    cfg.email = Object.assign(cfg.email || {}, {
        from:     v('cfg-email-from'),
        reply_to: v('cfg-email-replyto'),
        smtp: Object.assign(((cfg.email || {}).smtp) || {}, {
            host:   v('cfg-smtp-host'),
            port:   parseInt(v('cfg-smtp-port')) || 587,
            secure: v('cfg-smtp-secure')
        })
    });
    cfg.network = Object.assign(cfg.network || {}, {
        gateway:    v('cfg-gateway'),
        public_dns: v('cfg-public-dns'),
        domain:     v('cfg-domain'),
        isp_map:    buildIspMap()
    });
    cfg.refresh_rate   = parseInt(v('cfg-refresh-rate')) || 30000;
    cfg.alert_sound    = chk('cfg-alert-sound');
    cfg.browser_notify = chk('cfg-browser-notify');
    cfg.require_auth   = chk('cfg-require-auth');
    cfg.internal_hosts = buildHosts();
    cfg.RSS            = buildRss();
    return cfg;
}

// ── Save ────────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', function() {
    document.getElementById('save-json-input').value = JSON.stringify(buildConfig(), null, 2);
    document.getElementById('save-form').submit();
});

function showStatus(msg, ok) {
    var el = document.getElementById('save-status');
    el.textContent = msg;
    el.className = 'text-sm ' + (ok ? 'text-emerald-600' : 'text-red-500');
    el.classList.remove('hidden');
    setTimeout(function() { el.classList.add('hidden'); }, 3000);
}

// ── Keyboard shortcut: Ctrl+S ────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('saveBtn').click();
    }
});

<?php if ($embed && $save_ok): ?>
// Auto-close modal in parent after successful save
setTimeout(function() {
    if (window.parent && window.parent.closeConfigModal) {
        window.parent.closeConfigModal(true);
    }
}, 1200);
<?php endif; ?>
</script>
</body>
</html>

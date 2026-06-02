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
            // Preserve author from existing config (read-only field)
            $incoming['meta']['author'] = $json_data['meta']['author'] ?? ($incoming['meta']['author'] ?? '');
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
        .tab-btn { padding:8px 16px; font-size:13px; font-weight:500; border-bottom:2px solid transparent; color:#64748b; cursor:pointer; white-space:nowrap; transition:color 0.15s,border-color 0.15s; }
        .tab-btn:hover { color:#6366f1; }
        .tab-btn.active { color:#6366f1; border-bottom-color:#6366f1; }
        .dark .tab-btn { color:#94a3b8; }
        .dark .tab-btn:hover, .dark .tab-btn.active { color:#818cf8; border-bottom-color:#818cf8; }
        .cfg-input { width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px 10px; font-size:13px; background:#fff; color:#0f172a; transition:border-color .15s,box-shadow .15s; }
        .cfg-input:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
        .dark .cfg-input { background:#1e293b; border-color:#334155; color:#e2e8f0; }
        .dark .cfg-input:focus { border-color:#818cf8; box-shadow:0 0 0 3px rgba(129,140,248,0.15); }
        .cfg-label { display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; letter-spacing:0.03em; text-transform:uppercase; }
        .dark .cfg-label { color:#94a3b8; }
        .tbl-input { width:100%; border:0; background:transparent; font-size:12.5px; padding:4px 6px; color:#0f172a; border-radius:4px; }
        .tbl-input:focus { outline:none; background:#f1f5f9; box-shadow:inset 0 0 0 1px #6366f1; }
        .dark .tbl-input { color:#e2e8f0; }
        .dark .tbl-input:focus { background:#334155; }
        table { width:100%; border-collapse:collapse; }
        th { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding:8px 8px 6px; text-align:left; border-bottom:1px solid #e2e8f0; }
        .dark th { color:#94a3b8; border-color:#334155; }
        td { padding:2px 2px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
        .dark td { border-color:#1e293b; }
        tr:hover td { background:#f8fafc; }
        .dark tr:hover td { background:#1e293b; }
        .del-btn { width:28px; height:28px; display:flex;align-items:center;justify-content:center; border-radius:6px; color:#ef4444; cursor:pointer; transition:background .15s; flex-shrink:0; }
        .del-btn:hover { background:#fee2e2; }
        .dark .del-btn:hover { background:#450a0a; }
        .add-row-btn { font-size:12px; font-weight:600; color:#6366f1; cursor:pointer; display:flex; align-items:center; gap:4px; padding:6px 2px; margin-top:8px; }
        .add-row-btn:hover { color:#4f46e5; }
        .section-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:20px 24px; margin-bottom:16px; }
        .dark .section-card { background:#1e293b; border-color:#334155; }
    </style>
</head>
<body class="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased min-h-screen">

<!-- Sticky top bar -->
<div class="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
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
        <button class="tab-btn active" data-tab="services">
            <i class="fa-solid fa-server mr-1.5 text-indigo-500"></i>Services
        </button>
        <button class="tab-btn" data-tab="rss">
            <i class="fa-solid fa-rss mr-1.5 text-orange-500"></i>RSS Feeds
        </button>
        <button class="tab-btn" data-tab="general">
            <i class="fa-solid fa-sliders mr-1.5 text-emerald-500"></i>General
        </button>
        <button class="tab-btn" data-tab="network">
            <i class="fa-solid fa-network-wired mr-1.5 text-sky-500"></i>Network
        </button>
        <button class="tab-btn" data-tab="raw">
            <i class="fa-solid fa-code mr-1.5 text-slate-400"></i>Raw JSON
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
    <div id="tab-services" class="tab-panel">
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
                <span class="text-xs text-slate-400">Use <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">item</code> for RSS, <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">entry</code> for Atom</span>
            </div>
            <div class="overflow-x-auto">
            <table id="rss-table">
                <thead>
                    <tr>
                        <th style="width:18%">Name</th>
                        <th style="width:40%">Feed URL</th>
                        <th style="width:9%">Tag</th>
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
                            <option value="item"  <?= ($f['tag'] ?? 'item') === 'item'  ? 'selected' : '' ?>>item</option>
                            <option value="entry" <?= ($f['tag'] ?? '') === 'entry' ? 'selected' : '' ?>>entry</option>
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
    <div id="tab-general" class="tab-panel hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div class="section-card">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">Branding</h2>
                <div class="space-y-4">
                    <div>
                        <label class="cfg-label">Business / Site Name</label>
                        <input id="cfg-business-name" class="cfg-input" value="<?= e($json_data['business_name'] ?? '') ?>">
                    </div>
                    <div>
                        <label class="cfg-label">Logo Path or URL</label>
                        <input id="cfg-business-logo" class="cfg-input" value="<?= e($json_data['business_logo'] ?? '') ?>" placeholder="images/logo.webp">
                        <?php if (!empty($json_data['business_logo'])): ?>
                        <img src="<?= e($json_data['business_logo']) ?>" alt="Logo preview" class="mt-2 max-h-12 rounded bg-white p-1 border border-slate-200">
                        <?php endif; ?>
                    </div>
                    <div>
                        <label class="cfg-label">Footer Message</label>
                        <input id="cfg-footer-message" class="cfg-input" value="<?= e($json_data['footer_message'] ?? '') ?>">
                    </div>
                </div>
            </div>

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

            <div class="section-card md:col-span-2">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4">About / Meta</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="cfg-label">Config Version <span class="text-slate-400 font-normal normal-case">(auto-increments on save)</span></label>
                        <input id="cfg-version" class="cfg-input" value="<?= e($json_data['meta']['version'] ?? '1.0') ?>"
                               readonly style="opacity:0.6;cursor:default;background:#f8fafc">
                    </div>
                    <div>
                        <label class="cfg-label">Author</label>
                        <input id="cfg-author" class="cfg-input" value="<?= e($json_data['meta']['author'] ?? '') ?>"
                               readonly style="opacity:0.6;cursor:default;background:#f8fafc">
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

    <!-- ── Raw JSON tab ────────────────────────────────────────────── -->
    <div id="tab-raw" class="tab-panel hidden">
        <div class="section-card mb-4">
            <div class="flex items-center justify-between mb-3">
                <h2 class="font-semibold text-slate-700 dark:text-slate-300">Raw JSON</h2>
                <span class="text-xs text-amber-500"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Edits here override the form tabs on save</span>
            </div>
            <textarea id="raw-json" style="background:#0f172a;color:#e2e8f0;font-family:monospace;resize:vertical;border:1px solid #334155;border-radius:8px;padding:14px;min-height:520px;width:100%;font-size:12.5px;line-height:1.7;box-sizing:border-box"
                spellcheck="false"><?= htmlspecialchars($json) ?></textarea>
        </div>

        <!-- Help Reference -->
        <div class="section-card">
            <h2 class="font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                <i class="fa-solid fa-circle-info text-indigo-400"></i> Configuration Reference
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">

                <div>
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">Services <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">internal_hosts[]</code></h3>
                    <table class="w-full text-xs">
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">name</td><td class="py-1 text-slate-600 dark:text-slate-400">Display name</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">host</td><td class="py-1 text-slate-600 dark:text-slate-400">Hostname or IP address</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">port</td><td class="py-1 text-slate-600 dark:text-slate-400">Port number, or <code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">null</code> for ICMP ping</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">type</td><td class="py-1 text-slate-600 dark:text-slate-400">Label: PING, LDAP, SMB, HTTP…</td></tr>
                        <tr><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">description</td><td class="py-1 text-slate-600 dark:text-slate-400">Short note shown on the card</td></tr>
                    </table>
                </div>

                <div>
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">RSS Feeds <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">RSS[]</code></h3>
                    <table class="w-full text-xs">
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">name</td><td class="py-1 text-slate-600 dark:text-slate-400">Feed display name</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">host</td><td class="py-1 text-slate-600 dark:text-slate-400">Full RSS/Atom URL</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">tag</td><td class="py-1 text-slate-600 dark:text-slate-400"><code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">item</code> (RSS) or <code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">entry</code> (Atom)</td></tr>
                        <tr><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">description</td><td class="py-1 text-slate-600 dark:text-slate-400">Short note shown on the box</td></tr>
                    </table>
                </div>

                <div>
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">Network <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">network{}</code></h3>
                    <table class="w-full text-xs">
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">gateway</td><td class="py-1 text-slate-600 dark:text-slate-400">LAN gateway IP — pinged for local status</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">public_dns</td><td class="py-1 text-slate-600 dark:text-slate-400">DNS checked on port 53 for WAN status</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">domain</td><td class="py-1 text-slate-600 dark:text-slate-400">Internal domain (display only)</td></tr>
                        <tr><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">isp_map</td><td class="py-1 text-slate-600 dark:text-slate-400">Object mapping public IP → ISP label</td></tr>
                    </table>
                </div>

                <div>
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">Top-level fields</h3>
                    <table class="w-full text-xs">
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">business_name</td><td class="py-1 text-slate-600 dark:text-slate-400">Page / org name in navbar</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">business_logo</td><td class="py-1 text-slate-600 dark:text-slate-400">Path or URL to logo image</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">refresh_rate</td><td class="py-1 text-slate-600 dark:text-slate-400">Poll interval in ms (min 3000)</td></tr>
                        <tr class="border-b border-slate-100 dark:border-slate-700"><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">alert_sound</td><td class="py-1 text-slate-600 dark:text-slate-400"><code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">true</code> / <code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">false</code></td></tr>
                        <tr><td class="py-1 pr-3 font-mono text-indigo-600 dark:text-indigo-400">browser_notify</td><td class="py-1 text-slate-600 dark:text-slate-400"><code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">true</code> / <code class="bg-slate-100 dark:bg-slate-700 px-0.5 rounded">false</code></td></tr>
                    </table>
                </div>

                <div class="md:col-span-2">
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">Environment variables (override config)</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2"><code class="text-indigo-600 dark:text-indigo-400">APP_AUTH_REQUIRED</code><div class="text-slate-500 mt-0.5">true / false</div></div>
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2"><code class="text-indigo-600 dark:text-indigo-400">APP_USERNAME</code><div class="text-slate-500 mt-0.5">Admin username</div></div>
                        <div class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2"><code class="text-indigo-600 dark:text-indigo-400">APP_PASSWORD</code><div class="text-slate-500 mt-0.5">Admin password</div></div>
                    </div>
                </div>

                <div class="md:col-span-2">
                    <h3 class="font-semibold text-slate-600 dark:text-slate-400 mb-2 text-xs uppercase tracking-wide">URL parameters</h3>
                    <div class="flex flex-wrap gap-2 text-xs">
                        <span class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5"><code class="text-indigo-600 dark:text-indigo-400">?hide_navbar=1</code> — hide navigation bar</span>
                        <span class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5"><code class="text-indigo-600 dark:text-indigo-400">?debug=1</code> — show diagnostics overlay</span>
                        <span class="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5"><code class="text-indigo-600 dark:text-indigo-400">?lang=es</code> — switch language</span>
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
var _rawEdited = false;

// ── Tab switching ────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.getElementById('tab-' + this.dataset.tab).classList.remove('hidden');
        this.classList.add('active');
        // Sync raw JSON view when switching to it
        if (this.dataset.tab === 'raw' && !_rawEdited) {
            document.getElementById('raw-json').value = JSON.stringify(buildConfig(), null, 2);
        }
    });
});

// Mark raw JSON as user-edited if they type in it
document.getElementById('raw-json').addEventListener('input', function() { _rawEdited = true; });

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
        + '<td><select class="tbl-input" data-field="tag"><option value="item">item</option><option value="entry">entry</option></select></td>'
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
        version: v('cfg-version')
        // author is read-only — preserved from the original config
    });
    cfg.network = Object.assign(cfg.network || {}, {
        gateway:    v('cfg-gateway'),
        public_dns: v('cfg-public-dns'),
        domain:     v('cfg-domain'),
        isp_map:    buildIspMap()
    });
    cfg.refresh_rate    = parseInt(v('cfg-refresh-rate')) || 30000;
    cfg.alert_sound     = chk('cfg-alert-sound');
    cfg.browser_notify  = chk('cfg-browser-notify');
    cfg.require_auth    = chk('cfg-require-auth');
    cfg.internal_hosts  = buildHosts();
    cfg.RSS             = buildRss();
    cfg.business_name   = v('cfg-business-name');
    cfg.business_logo   = v('cfg-business-logo');
    cfg.footer_message  = v('cfg-footer-message');
    return cfg;
}

// ── Save ────────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', function() {
    var json;
    if (_rawEdited) {
        // Raw JSON tab was edited — use it directly
        try { JSON.parse(document.getElementById('raw-json').value); }
        catch(e) { showStatus('Invalid JSON: ' + e.message, false); return; }
        json = document.getElementById('raw-json').value;
    } else {
        json = JSON.stringify(buildConfig(), null, 2);
    }
    document.getElementById('save-json-input').value = json;
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

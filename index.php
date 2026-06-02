<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
session_start();

if (isset($_GET['logout'])) {
    session_destroy();
    header("Location: index.php");
    exit();
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$configPath = __DIR__ . '/include/configuration.json';
$json = @file_get_contents($configPath);
if ($json === false) { http_response_code(500); exit('Error reading the JSON file'); }
$json_data = json_decode($json, true);
if ($json_data === null) { http_response_code(500); exit('Error decoding the JSON file'); }

function rate_limit($key, $limit = 5, $window = 300) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $session_key = "rate_limit_{$key}_{$ip}";
    if (!isset($_SESSION[$session_key])) $_SESSION[$session_key] = [];
    $_SESSION[$session_key] = array_filter($_SESSION[$session_key], fn($ts) => $ts > (time() - $window));
    if (count($_SESSION[$session_key]) >= $limit) return false;
    $_SESSION[$session_key][] = time();
    return true;
}

$auth_env      = getenv('APP_AUTH_REQUIRED');
// Env var takes precedence; otherwise fall back to require_auth in config.json
$auth_required = ($auth_env !== false && $auth_env !== '')
    ? filter_var($auth_env, FILTER_VALIDATE_BOOLEAN)
    : ($json_data['require_auth'] ?? true);
$admin_user    = getenv('APP_USERNAME') ?: 'admin';
$admin_pass    = getenv('APP_PASSWORD') ?: 'changeme';

if ($auth_required === false) $_SESSION['authenticated'] = true;

if (isset($_POST['login'])) {
    if (!rate_limit('login', 5, 300)) {
        $login_error = "Too many login attempts. Please wait and try again.";
        $show_login_modal = true;
    } elseif ($_POST['username'] === $admin_user && $_POST['password'] === $admin_pass) {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        header("Location: index.php");
        exit();
    } else {
        $login_error = "Invalid credentials.";
        $show_login_modal = true;
    }
}

$network        = $json_data['network']        ?? [];
$refresh_rate   = $json_data['refresh_rate']   ?? 30000;
$alert_sound    = $json_data['alert_sound']    ?? false;
$internal_hosts = $json_data['internal_hosts'] ?? [];
$rss_feeds      = $json_data['RSS']            ?? [];

// Branding (support both old and new config structure)
$branding       = $json_data['branding']       ?? [];
$business_name  = $branding['business_name'] ?? $json_data['business_name'] ?? 'Status Page';
$business_logo  = $branding['business_logo'] ?? $json_data['business_logo'] ?? '';
$company_url    = $branding['company_url']   ?? '';
$support_email  = $branding['support_email'] ?? '';
$support_phone  = $branding['support_phone'] ?? '';
$footer_message = $branding['footer_message'] ?? $json_data['footer_message'] ?? '';
$announcement   = $branding['announcement_banner'] ?? '';
$announcement_type = $branding['announcement_type'] ?? 'info';

// Theme colors
$theme          = $json_data['theme']         ?? [];
$primary_color  = $theme['primary_color']  ?? '#6366f1';
$accent_color   = $theme['accent_color']   ?? '#06b6d4';
$success_color  = $theme['success_color']  ?? '#10b981';
$warning_color  = $theme['warning_color']  ?? '#f59e0b';
$error_color    = $theme['error_color']    ?? '#ef4444';

// SLA configuration
$sla            = $json_data['sla']           ?? ['enabled' => false];
$sla_enabled    = $sla['enabled'] ?? false;
$sla_target     = $sla['uptime_target'] ?? 99.9;

$meta           = $json_data['meta']           ?? [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SESSION['authenticated'] ?? false)) {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        http_response_code(403); exit('Invalid CSRF token');
    }
    if (isset($_POST['backup']) && $_POST['backup'] === "1") {
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="Status Page - Config Backup.json"');
        header('Content-Length: ' . strlen($json));
        echo $json; exit();
    }
    $jsonInput = $_POST['json'] ?? '';
    if ($jsonInput !== '') {
        json_decode($jsonInput);
        if (json_last_error() !== JSON_ERROR_NONE) { header("Location: index.php?Error=InvalidJSON"); exit(); }
        file_put_contents($configPath, $jsonInput);
        header("Location: index.php?Saved=true"); exit();
    }
}

$supported_langs = ['en' => 'English', 'es' => 'Español'];
$lang = $_GET['lang'] ?? ($_COOKIE['lang'] ?? 'en');
if (!array_key_exists($lang, $supported_langs)) $lang = 'en';
setcookie('lang', $lang, time() + 3600 * 24 * 30, '/');
$lang_strings = [
    'en' => [
        'status_page' => 'Status Page', 'login' => 'Login', 'logout' => 'Logout',
        'username' => 'Username', 'password' => 'Password',
        'edit_config' => 'Edit Configuration', 'backup_config' => 'Backup Configuration',
        'save_changes' => 'Save Changes', 'close' => 'Close',
        'auto_refresh' => 'Auto-Refresh', 'interval' => 'Interval (ms)',
        'dark_mode' => 'Dark Mode', 'light_mode' => 'Light Mode',
        'incidents' => 'Incidents', 'subscribe' => 'Subscribe', 'email' => 'Email',
        'subscribe_service' => 'Subscribe to Service Updates', 'select_service' => 'Select Services',
        'submit' => 'Submit', 'all_systems_operational' => 'All Systems Operational',
        'issues_detected' => 'Issues Detected In Your Environment',
        'notices' => 'Notices', 'internally_hosted' => 'Internally Hosted Services',
        'local_area' => 'Local-Area Network', 'wide_area' => 'Wide-Area Network',
        'service' => 'Service', 'loading' => 'Loading...'
    ],
    'es' => [
        'status_page' => 'Página de Estado', 'login' => 'Iniciar sesión', 'logout' => 'Cerrar sesión',
        'username' => 'Usuario', 'password' => 'Contraseña',
        'edit_config' => 'Editar Configuración', 'backup_config' => 'Respaldar Configuración',
        'save_changes' => 'Guardar Cambios', 'close' => 'Cerrar',
        'auto_refresh' => 'Auto-Actualizar', 'interval' => 'Intervalo (ms)',
        'dark_mode' => 'Modo Oscuro', 'light_mode' => 'Modo Claro',
        'incidents' => 'Incidentes', 'subscribe' => 'Suscribirse', 'email' => 'Correo electrónico',
        'subscribe_service' => 'Suscribirse a Actualizaciones', 'select_service' => 'Seleccionar Servicios',
        'submit' => 'Enviar', 'all_systems_operational' => 'Todos los sistemas operativos',
        'issues_detected' => 'Problemas detectados en su entorno',
        'notices' => 'Avisos', 'internally_hosted' => 'Servicios Internos',
        'local_area' => 'Red de Área Local', 'wide_area' => 'Red de Área Amplia',
        'service' => 'Servicio', 'loading' => 'Cargando...'
    ]
];
$t = $lang_strings[$lang];

// Dark mode: ?dark=1 forces on, ?dark=0 forces off, otherwise use cookie
if (isset($_GET['dark'])) {
    $dark_mode = $_GET['dark'] === '1' ? 'on' : 'off';
    setcookie('dark_mode', $dark_mode, time() + 31536000, '/');
} else {
    $dark_mode = $_COOKIE['dark_mode'] ?? 'off';
}
$is_dark    = $dark_mode === 'on';
$is_admin   = isset($_SESSION['authenticated']) && $_SESSION['authenticated'];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['remove_incident']) && $is_admin) {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        http_response_code(403); exit('Invalid CSRF token');
    }
    $incidentsFile = __DIR__ . '/include/incidents.json';
    $incidents = file_exists($incidentsFile) ? (json_decode(file_get_contents($incidentsFile), true) ?: []) : [];
    $idx = intval($_POST['remove_incident']);
    if (isset($incidents[$idx])) {
        array_splice($incidents, $idx, 1);
        file_put_contents($incidentsFile, json_encode($incidents, JSON_PRETTY_PRINT));
        exit('OK');
    }
    http_response_code(404); exit('Incident not found');
}

$hide_navbar = isset($_GET['hide_navbar']) && $_GET['hide_navbar'] === '1';
$debug_mode  = ($_GET['debug'] ?? '') === '1';

// Shared Tailwind input / button classes
$input_cls  = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm';
$label_cls  = 'block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1';
$btn_p      = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';
$btn_primary   = "$btn_p bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500";
$btn_success   = "$btn_p bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500";
$btn_warning   = "$btn_p bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-400";
$btn_danger    = "$btn_p bg-red-600 hover:bg-red-700 text-white focus:ring-red-500";
$btn_secondary = "$btn_p bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 focus:ring-slate-400";

// Local asset detection — populated by download-assets.ps1
$local_tw = file_exists(__DIR__ . '/assets/tailwind.min.js');
$local_fa = file_exists(__DIR__ . '/assets/fontawesome/css/all.min.css');
$local_jq = file_exists(__DIR__ . '/assets/jquery.min.js');
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang) ?>"<?= $is_dark ? ' class="dark"' : '' ?>>
<head>
    <meta charset="UTF-8">
    <title><?= htmlspecialchars($business_name) ?> | <?= $t['status_page'] ?></title>
    <link rel="icon" type="image/x-icon" href="images/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <?php if (!$local_tw && !$local_fa && !$local_jq): ?>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
    <link rel="preconnect" href="https://cdnjs.cloudflare.com">
    <link rel="preconnect" href="https://ajax.googleapis.com">
    <?php endif; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&display=swap">
    <?php if ($local_tw): ?>
    <script src="assets/tailwind.min.js"></script>
    <?php else: ?>
    <script src="https://cdn.tailwindcss.com"></script>
    <?php endif; ?>
    <script>tailwind.config = { darkMode: 'class', theme: { extend: { fontFamily: { sans: ['Inter','system-ui','-apple-system','sans-serif'] } } } }</script>
    <style>
        :root {
            --primary-color: <?= htmlspecialchars($primary_color) ?>;
            --accent-color: <?= htmlspecialchars($accent_color) ?>;
            --success-color: <?= htmlspecialchars($success_color) ?>;
            --warning-color: <?= htmlspecialchars($warning_color) ?>;
            --error-color: <?= htmlspecialchars($error_color) ?>;
        }
    </style>
    <?php if ($local_fa): ?>
    <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
    <?php else: ?>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">
    <?php endif; ?>
    <link href="status-page.css" rel="stylesheet">
</head>
<body class="bg-slate-50 text-slate-900 dark:text-slate-100 font-sans antialiased"
    data-csrf="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>"
    data-all-systems-operational="<?= htmlspecialchars($t['all_systems_operational']) ?>"
    data-issues-detected="<?= htmlspecialchars($t['issues_detected']) ?>"
    data-light-mode="<?= htmlspecialchars($t['light_mode']) ?>"
    data-dark-mode="<?= htmlspecialchars($t['dark_mode']) ?>"
    data-admin="<?= $is_admin ? 'true' : 'false' ?>"
    data-local-area="<?= htmlspecialchars($t['local_area']) ?>"
    data-wide-area="<?= htmlspecialchars($t['wide_area']) ?>"
    data-loading="<?= htmlspecialchars($t['loading']) ?>"
    data-service="<?= htmlspecialchars($t['service']) ?>"
    data-alert-sound="<?= $alert_sound ? 'true' : 'false' ?>"
    data-browser-notify="<?= !empty($json_data['browser_notify']) ? 'true' : 'false' ?>">

<?php if (!$hide_navbar): ?>

<!-- ── Announcement Banner ───────────────────────────────────────────── -->
<?php if ($announcement): ?>
<div class="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-3">
    <div class="max-w-screen-xl mx-auto flex items-center gap-3">
        <i class="fa-solid fa-bell text-blue-600 dark:text-blue-400 flex-shrink-0"></i>
        <span class="text-sm text-blue-900 dark:text-blue-100"><?= htmlspecialchars($announcement) ?></span>
    </div>
</div>
<?php endif; ?>

<!-- ── Navbar ─────────────────────────────────────────────────────────── -->
<nav class="border-b border-slate-200 dark:border-slate-800/60 shadow-sm dark:shadow-lg">
    <div class="max-w-screen-xl mx-auto px-4">
        <div class="flex items-center justify-between h-14">

            <!-- Brand -->
            <div class="flex items-center gap-3">
                <?php if ($business_logo): ?>
                    <img src="<?= htmlspecialchars($business_logo) ?>" alt="Logo"
                        class="bg-white rounded-lg px-2 py-1 max-h-9 object-contain border border-slate-200 dark:border-transparent">
                <?php endif; ?>
                <div class="flex flex-col gap-0.5">
                    <span class="text-slate-900 dark:text-white font-semibold text-base tracking-tight leading-none"><?= htmlspecialchars($business_name) ?></span>
                    <?php if ($sla_enabled): ?>
                        <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">SLA <?= htmlspecialchars((string)$sla_target) ?>%</span>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Desktop controls -->
            <div class="hidden md:flex items-center gap-1.5">

                <!-- Language -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 rounded-lg h-8 overflow-hidden">
                    <span class="px-2.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap border-r border-slate-200 dark:border-slate-700/60 h-full flex items-center">
                        <?= $lang === 'es' ? 'Idioma' : 'Lang' ?>
                    </span>
                    <select id="langSelect" class="bg-transparent text-slate-700 dark:text-slate-300 text-[11px] px-2 h-8 border-0 outline-none cursor-pointer appearance-none">
                        <?php foreach ($supported_langs as $code => $label): ?>
                            <option value="<?= $code ?>" <?= $lang === $code ? 'selected' : '' ?> class="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"><?= $label ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Auto-refresh -->
                <div class="flex items-center bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 rounded-lg h-8 overflow-hidden">
                    <label class="flex items-center gap-1.5 px-2.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium border-r border-slate-200 dark:border-slate-700/60 h-full cursor-pointer whitespace-nowrap">
                        <input type="checkbox" id="refreshToggle" checked class="accent-indigo-500 w-3 h-3">
                        <?= $t['auto_refresh'] ?>
                    </label>
                    <div class="flex items-center px-2 gap-1">
                        <input type="number" id="refreshInterval" value="<?= (int)$refresh_rate ?>" min="3000" step="500"
                            class="bg-transparent text-slate-700 dark:text-slate-200 text-[11px] w-14 text-right outline-none"
                            title="<?= $t['interval'] ?>">
                        <span class="text-slate-400 dark:text-slate-600 text-[11px]">ms</span>
                    </div>
                </div>

                <!-- Theme toggle -->
                <button id="darkModeToggle" type="button"
                    class="flex items-center justify-center h-8 w-8 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    title="<?= $is_dark ? $t['light_mode'] : $t['dark_mode'] ?>">
                    <i class="fa-solid fa-moon text-xs dm-icon"></i>
                    <span class="dm-label sr-only"><?= $t['dark_mode'] ?></span>
                </button>

                <?php if ($is_admin): ?>
                    <!-- Divider -->
                    <div class="h-5 w-px bg-slate-200 dark:bg-slate-700/60 mx-0.5"></div>
                    <button type="button" onclick="openConfigModal()"
                        class="flex items-center justify-center h-8 w-8 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs transition-colors"
                        title="<?= $t['edit_config'] ?>">
                        <i class="fa-solid fa-gear"></i>
                    </button>
                    <?php if ($auth_required): ?>
                        <a href="?logout=1"
                            class="flex items-center gap-1.5 h-8 px-3 bg-slate-100 dark:bg-slate-800/70 hover:bg-red-50 dark:hover:bg-red-900/30 border border-slate-200 dark:border-slate-700/60 hover:border-red-200 dark:hover:border-red-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium transition-colors">
                            <i class="fa-solid fa-right-from-bracket text-xs"></i>
                            <span class="hidden lg:inline"><?= $t['logout'] ?></span>
                        </a>
                    <?php endif; ?>
                <?php else: ?>
                    <!-- Divider -->
                    <div class="h-5 w-px bg-slate-200 dark:bg-slate-700/60 mx-0.5"></div>
                    <button type="button" onclick="openModal('loginModal')"
                        class="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium transition-colors shadow-sm">
                        <i class="fa-solid fa-right-to-bracket text-xs"></i>
                        <span><?= $t['login'] ?></span>
                    </button>
                <?php endif; ?>
            </div>

            <!-- Mobile hamburger -->
            <button id="mobile-menu-btn" type="button"
                class="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-bars"></i>
            </button>
        </div>

        <!-- Mobile menu -->
        <div id="mobile-menu" class="hidden md:hidden pb-4 flex flex-col gap-2.5 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div class="flex items-center gap-2">
                <label class="text-xs text-slate-500 dark:text-slate-400 font-medium"><?= $lang === 'es' ? 'Idioma' : 'Language' ?></label>
                <select id="langSelectMobile" onchange="document.getElementById('langSelect').value=this.value; document.getElementById('langSelect').dispatchEvent(new Event('change'));"
                    class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2 py-1.5">
                    <?php foreach ($supported_langs as $code => $label): ?>
                        <option value="<?= $code ?>" <?= $lang === $code ? 'selected' : '' ?>><?= $label ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="flex items-center gap-2">
                <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer font-medium">
                    <input type="checkbox" id="refreshToggleMobile" checked class="accent-indigo-500"
                        onchange="document.getElementById('refreshToggle').checked=this.checked; document.getElementById('refreshToggle').dispatchEvent(new Event('change'));">
                    <?= $t['auto_refresh'] ?>
                </label>
                <input type="number" value="<?= (int)$refresh_rate ?>" min="3000" step="500"
                    class="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2 py-1.5 w-20"
                    onchange="document.getElementById('refreshInterval').value=this.value; document.getElementById('refreshInterval').dispatchEvent(new Event('change'));">
                <span class="text-slate-400 dark:text-slate-600 text-xs">ms</span>
            </div>
            <div class="flex flex-wrap gap-2 pt-0.5">
                <button id="darkModeToggleMobile" type="button" onclick="document.getElementById('darkModeToggle').click();"
                    class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-medium">
                    <i class="fa-solid fa-moon text-xs"></i> <?= $t['dark_mode'] ?>
                </button>
                <?php if ($is_admin): ?>
                    <button type="button" onclick="openConfigModal()"
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-medium">
                        <i class="fa-solid fa-gear text-xs"></i> <?= $t['edit_config'] ?>
                    </button>
                    <?php if ($auth_required): ?>
                        <a href="?logout=1" class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
                            <i class="fa-solid fa-right-from-bracket text-xs"></i><?= $t['logout'] ?>
                        </a>
                    <?php endif; ?>
                <?php else: ?>
                    <button type="button" onclick="openModal('loginModal')"
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 rounded-lg text-white text-xs font-medium">
                        <i class="fa-solid fa-right-to-bracket text-xs"></i><?= $t['login'] ?>
                    </button>
                <?php endif; ?>
            </div>
        </div>
    </div>
</nav>
<?php endif; ?>

<!-- ── Alerts ─────────────────────────────────────────────────────────── -->
<?php if (isset($_GET['Saved'])): ?>
<div id="saved-alert" class="max-w-screen-xl mx-auto px-4 mt-4">
    <div class="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-sm">
        <span><i class="fa-solid fa-circle-check mr-1.5"></i>Configuration saved successfully.</span>
        <button onclick="document.getElementById('saved-alert').remove()" class="ml-4 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 text-xl leading-none font-light">&times;</button>
    </div>
</div>
<?php endif; ?>
<?php if (isset($_GET['Error'])): ?>
<div class="max-w-screen-xl mx-auto px-4 mt-4">
    <div class="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
        <i class="fa-solid fa-circle-xmark"></i> Invalid JSON. Please check your configuration.
    </div>
</div>
<?php endif; ?>

<!-- ── Main Content ───────────────────────────────────────────────────── -->
<main class="page-content max-w-screen-xl mx-auto px-4 py-6 w-full">

    <!-- Status Banner -->
    <div id="all_status" data-status="loading"
        class="rounded-2xl p-6 mb-2 text-center text-2xl font-bold flex items-center justify-center gap-3 shadow-md text-white"
        style="position:relative">
        <span id="statusIcon" class="text-3xl" style="display:none;"></span>
        <span id="webTicker"><b><?= $t['loading'] ?></b></span>
        <span id="live-indicator" style="display:none;position:absolute;right:1rem;top:50%;transform:translateY(-50%)"
              class="flex items-center gap-1.5 text-xs font-semibold tracking-widest opacity-80">
            <span class="sp-ping-dot"></span>
            LIVE
        </span>
    </div>

    <!-- Last updated row -->
    <div class="flex justify-end items-center mb-4 pr-1 h-5">
        <span id="last-updated-wrap" style="display:none" class="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <i class="fa-regular fa-clock text-[10px]"></i>
            <span id="last-updated-text"></span>
        </span>
    </div>

    <!-- Incidents (hidden when empty) -->
    <div id="incidents_container" class="hidden rounded-2xl p-5 mb-5" style="background:linear-gradient(135deg,rgba(251,146,60,0.12) 0%,rgba(239,68,68,0.08) 100%);border:1px solid rgba(251,146,60,0.4);box-shadow:0 4px 20px rgba(251,146,60,0.12)">
        <h5 class="flex items-center gap-2 text-base font-semibold mb-3" style="color:#c2410c">
            <i class="fa-solid fa-triangle-exclamation text-amber-500"></i> <?= $t['incidents'] ?>
        </h5>
        <div id="incidents_area"></div>
    </div>

    <!-- Network Status (skeleton) -->
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm px-5 py-4 mb-5 sp-panel" id="network_status_placeholder">
        <div class="flex flex-wrap justify-between items-center gap-4">
            <div class="flex items-center gap-3">
                <div class="skeleton h-3.5 rounded w-36"></div>
                <div class="skeleton h-3.5 rounded w-20"></div>
            </div>
            <div class="flex items-center gap-3">
                <div class="skeleton h-3.5 rounded w-36"></div>
                <div class="skeleton h-3.5 rounded w-48"></div>
            </div>
        </div>
    </div>

    <!-- Services (skeleton) -->
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 mb-5 sp-panel">
        <div class="flex items-center justify-between mb-4">
            <h5 class="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                <i class="fa-solid fa-server text-indigo-500"></i> <?= $t['internally_hosted'] ?>
            </h5>
            <button type="button" onclick="openOutageLog()"
                class="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50">
                <i class="fa-solid fa-clock-rotate-left text-[11px]"></i>
                <?= $lang === 'es' ? 'Historial' : 'Outage History' ?>
            </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3" id="services_placeholder">
            <?php for ($i = 0; $i < 4; $i++): ?>
            <div class="service-card">
                <div class="flex items-start justify-between gap-1.5 mb-2">
                    <div class="skeleton h-3 rounded w-3/4"></div>
                    <div class="skeleton h-3 rounded-full w-12 flex-shrink-0"></div>
                </div>
                <div class="skeleton h-4 rounded-full w-10"></div>
                <div class="skeleton h-2.5 rounded w-full mt-2"></div>
            </div>
            <?php endfor; ?>
        </div>
    </div>

    <!-- Notices / RSS (skeleton) -->
    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-5 sp-panel">
        <h5 class="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">
            <i class="fa-solid fa-circle-exclamation text-amber-500"></i> <?= $t['notices'] ?>
        </h5>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3" id="rss_area">
            <?php for ($i = 0; $i < 3; $i++): ?>
            <div class="rss-feed-box p-3 flex flex-col justify-center gap-1.5 pointer-events-none" style="background:#f1f5f9;min-height:80px">
                <div class="skeleton h-3 rounded w-1/2 mx-auto"></div>
                <div class="skeleton h-2.5 rounded w-full"></div>
                <div class="skeleton h-2.5 rounded w-3/4 mx-auto"></div>
            </div>
            <?php endfor; ?>
        </div>
    </div>

</main>

<!-- ── Floating actions ──────────────────────────────────────────────── -->
<div class="fixed bottom-5 right-5 z-30 flex flex-col gap-2.5 w-44">
    <?php if ($is_admin): ?>
    <button type="button" onclick="openModal('createIncidentModal')"
        class="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500 shadow-lg hover:shadow-xl rounded-xl text-white text-sm font-medium transition-all hover:-translate-y-0.5 active:translate-y-0">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span><?= $t['incidents'] ?></span>
    </button>
    <?php endif; ?>
    <button type="button" onclick="openModal('subscribeModal')"
        class="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 shadow-lg hover:shadow-xl rounded-xl text-white text-sm font-medium transition-all hover:-translate-y-0.5 active:translate-y-0">
        <i class="fa-solid fa-bell"></i>
        <span><?= $t['subscribe'] ?></span>
    </button>
</div>

<!-- ── Footer ─────────────────────────────────────────────────────────── -->
<footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 mt-6">
    <div class="max-w-screen-xl mx-auto px-4">
        <!-- Footer links -->
        <div class="flex flex-col sm:flex-row justify-center gap-6 mb-4 text-sm text-slate-600 dark:text-slate-400">
            <div class="flex items-center gap-2">
                <i class="fa-brands fa-github text-slate-600 dark:text-slate-400"></i>
                <a href="https://github.com/brandonsanders48/simple-status-page" target="_blank" rel="noopener"
                   class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    GitHub
                </a>
            </div>
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-bug text-slate-500 dark:text-slate-500"></i>
                <a href="https://github.com/brandonsanders48/simple-status-page/issues/new" target="_blank" rel="noopener"
                   class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    Submit Issue
                </a>
            </div>
            <?php if ($support_phone): ?>
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-phone text-slate-500 dark:text-slate-500"></i>
                    <span><?= htmlspecialchars($support_phone) ?></span>
                </div>
            <?php endif; ?>
        </div>
        
        <!-- Footer message and version -->
        <div class="flex flex-col sm:flex-row justify-center items-center gap-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-4">
            <span><?= htmlspecialchars($footer_message) ?></span>
            <?php if (!empty($meta['version'])): ?>
                <span class="text-slate-400 dark:text-slate-600">•</span>
                <span>Config v<?= htmlspecialchars($meta['version']) ?>
                    <?php if (!empty($meta['author'])): ?>
                        <span class="text-slate-400 dark:text-slate-600">•</span>
                        <a href="https://github.com/brandonsanders48" target="_blank" rel="noopener" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            <?= htmlspecialchars($meta['author']) ?>
                        </a>
                    <?php endif; ?>
                </span>
            <?php endif; ?>
        </div>
    </div>
</footer>

<!-- ────────────────────────────────────────────────────────────────────
     MODALS  (all use sp-modal class for scroll-lock detection)
───────────────────────────────────────────────────────────────────── -->

<!-- Shared modal close helper accessible inline -->
<script>
function openModal(id){const e=document.getElementById(id);if(!e)return;e.classList.remove('hidden');document.body.style.overflow='hidden';}
function closeModal(id){const e=document.getElementById(id);if(e)e.classList.add('hidden');if(!document.querySelector('.sp-modal:not(.hidden)'))document.body.style.overflow='';}
</script>

<!-- Subscribe Modal -->
<div id="subscribeModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('subscribeModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700/50">
        <div class="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700/60">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-bell text-emerald-600 dark:text-emerald-400"></i>
                </div>
                <div>
                    <h5 class="font-semibold text-slate-900 dark:text-white text-sm"><?= $lang === 'es' ? 'Suscribirse a alertas' : 'Subscribe to Alerts' ?></h5>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5"><?= $lang === 'es' ? 'Notificaciones por correo' : 'Get emailed when services go down' ?></p>
                </div>
            </div>
            <button onclick="closeModal('subscribeModal')" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none mt-0.5">&times;</button>
        </div>
        <div class="px-6 py-5">
            <form id="subscribeForm" class="space-y-4">
                <div>
                    <label for="subscribeEmail" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $t['email'] ?></label>
                    <input type="email" id="subscribeEmail" name="email" placeholder="you@example.com" required
                        class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition">
                </div>
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"><?= $t['select_service'] ?></label>
                        <button type="button" id="selectAllSvcs" class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"><?= $lang === 'es' ? 'Todo' : 'Select all' ?></button>
                    </div>
                    <div class="max-h-[360px] overflow-y-auto modal-scroll rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
                        <?php foreach ($internal_hosts as $service): ?>
                        <label class="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors">
                            <input type="checkbox" name="service[]" value="<?= htmlspecialchars($service['name']) ?>"
                                class="w-4 h-4 rounded accent-emerald-500 flex-shrink-0">
                            <span class="text-sm text-slate-800 dark:text-slate-200 font-medium flex-1"><?= htmlspecialchars($service['name']) ?></span>
                            <?php if (!empty($service['description'])): ?>
                            <span class="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[110px]"><?= htmlspecialchars($service['description']) ?></span>
                            <?php endif; ?>
                        </label>
                        <?php endforeach; ?>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-1">
                    <button type="button" onclick="closeModal('subscribeModal');openModal('manageSubModal')"
                        class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors">
                        <i class="fa-solid fa-gear text-xs"></i> <?= $lang === 'es' ? 'Administrar' : 'Manage' ?>
                    </button>
                    <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                        <?= $t['subscribe'] ?>
                    </button>
                </div>
            </form>
            <div id="subscribeMsg" class="mt-3 text-sm"></div>
        </div>
    </div>
</div>

<!-- Manage Subscription Modal -->
<div id="manageSubModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('manageSubModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700/50">
        <!-- Header -->
        <div class="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700/50">
            <div class="w-9 h-9 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <i class="fa-solid fa-bell-slash text-red-500 dark:text-red-400"></i>
            </div>
            <div class="flex-1">
                <h5 class="font-semibold text-slate-900 dark:text-white text-sm"><?= $lang === 'es' ? 'Administrar Suscripciones' : 'Manage Subscriptions' ?></h5>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5"><?= $lang === 'es' ? 'Busca y administra tus alertas' : 'Look up and manage your alerts' ?></p>
            </div>
            <button onclick="closeModal('manageSubModal')" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none mt-0.5">&times;</button>
        </div>
        <!-- Body -->
        <div class="px-6 py-5 space-y-4">
            <div>
                <label for="manageEmail" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $t['email'] ?></label>
                <div class="flex gap-2">
                    <input type="email" id="manageEmail" name="email" placeholder="you@example.com" required
                        class="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition">
                    <button type="button" id="manageSubLookup"
                        class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap">
                        <i class="fa-solid fa-magnifying-glass mr-1.5"></i><?= $lang === 'es' ? 'Buscar' : 'Look Up' ?>
                    </button>
                </div>
            </div>
            <div id="manageSubMsg"></div>
            <div id="manageSubResults" class="hidden">
                <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2"><?= $lang === 'es' ? 'Suscripciones activas' : 'Active subscriptions' ?></div>
                <ul id="manageSubList" class="space-y-2 max-h-56 overflow-y-auto modal-scroll rounded-lg border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40"></ul>
            </div>
        </div>
        <!-- Footer -->
        <div class="flex items-center justify-between px-6 pb-5 pt-1 gap-2">
            <button type="button" id="manageSubUnsubAll"
                class="hidden px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                <i class="fa-solid fa-trash-can mr-1.5"></i><?= $lang === 'es' ? 'Darse de baja de todas' : 'Unsubscribe from All' ?>
            </button>
            <span class="flex-1"></span>
            <button type="button" onclick="closeModal('manageSubModal');openModal('subscribeModal')"
                class="<?= $btn_secondary ?>">
                <i class="fa-solid fa-arrow-left mr-1"></i><?= $lang === 'es' ? 'Atrás' : 'Back' ?>
            </button>
        </div>
    </div>
</div>

<!-- Login Modal -->
<div id="loginModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('loginModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700/50">
        <div class="px-6 pt-6 pb-4 text-center">
            <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <i class="fa-solid fa-lock text-indigo-600 dark:text-indigo-400 text-lg"></i>
            </div>
            <h5 class="text-lg font-bold text-slate-900 dark:text-white"><?= $t['login'] ?></h5>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5"><?= $lang === 'es' ? 'Se requiere acceso de administrador' : 'Admin access required' ?></p>
        </div>
        <div class="px-6 pb-6">
            <?php if (isset($login_error)): ?>
                <div class="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 rounded-lg px-3 py-2.5 text-sm mb-4">
                    <i class="fa-solid fa-circle-xmark flex-shrink-0"></i> <?= htmlspecialchars($login_error) ?>
                </div>
            <?php endif; ?>
            <form method="post" autocomplete="off" class="space-y-3">
                <div>
                    <label for="loginUsername" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $t['username'] ?></label>
                    <div class="relative">
                        <i class="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                        <input type="text" id="loginUsername" name="username" required autocomplete="username"
                            class="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition">
                    </div>
                </div>
                <div>
                    <label for="loginPassword" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $t['password'] ?></label>
                    <div class="relative">
                        <i class="fa-solid fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                        <input type="password" id="loginPassword" name="password" required autocomplete="current-password"
                            class="w-full pl-8 pr-9 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition">
                        <button type="button" tabindex="-1"
                            onclick="var i=document.getElementById('loginPassword');i.type=i.type==='password'?'text':'password';this.querySelector('i').className=i.type==='password'?'fa-solid fa-eye text-xs':'fa-solid fa-eye-slash text-xs'"
                            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                            <i class="fa-solid fa-eye text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="pt-2">
                    <button type="submit" name="login"
                        class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2">
                        <i class="fa-solid fa-right-to-bracket text-xs"></i>
                        <?= $t['login'] ?>
                    </button>
                </div>
            </form>
            <button onclick="closeModal('loginModal')" class="w-full mt-2 py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <?= $lang === 'es' ? 'Cancelar' : 'Cancel' ?>
            </button>
        </div>
    </div>
</div>

<!-- Edit Config Modal -->
<div id="addModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('addModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h5 class="text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <i class="fa-solid fa-gear text-blue-500"></i> <?= $t['edit_config'] ?>
            </h5>
            <button onclick="closeModal('addModal')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>
        <div class="px-6 py-5 modal-scroll overflow-y-auto max-h-[80vh]">
            <form method="post" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token']) ?>">
                <label class="<?= $label_cls ?> mb-2">configuration.json</label>
                <textarea id="configJson" name="json" spellcheck="false"><?= htmlspecialchars($json) ?></textarea>
                <div class="flex justify-end gap-2 mt-4">
                    <button type="submit" name="backup" value="1" class="<?= $btn_secondary ?>">
                        <i class="fa-solid fa-download mr-1"></i><?= $t['backup_config'] ?>
                    </button>
                    <button type="submit" class="<?= $btn_primary ?>">
                        <i class="fa-solid fa-floppy-disk mr-1"></i><?= $t['save_changes'] ?>
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Create Incident Modal -->
<div id="createIncidentModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('createIncidentModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700/50">
        <div class="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700/60">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400"></i>
                </div>
                <div>
                    <h5 class="font-semibold text-slate-900 dark:text-white text-sm"><?= $lang === 'es' ? 'Crear Incidente' : 'Create Incident' ?></h5>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5"><?= $lang === 'es' ? 'Publicar una alerta de servicio' : 'Post a service alert to the status page' ?></p>
                </div>
            </div>
            <button onclick="closeModal('createIncidentModal')" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none mt-0.5">&times;</button>
        </div>
        <div class="px-6 py-5">
            <form id="createIncidentForm" class="space-y-3">
                <div>
                    <label for="incidentTitle" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $lang === 'es' ? 'Título' : 'Title' ?></label>
                    <input type="text" id="incidentTitle" name="title" required placeholder="<?= $lang === 'es' ? 'Ej. Interrupción del servicio de correo' : 'e.g. Email service outage' ?>"
                        class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition">
                </div>
                <div>
                    <label for="incidentSeverity" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $lang === 'es' ? 'Severidad' : 'Severity' ?></label>
                    <select id="incidentSeverity" name="severity"
                        class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition">
                        <option value="degraded"><?= $lang === 'es' ? 'Degradado' : 'Degraded Performance' ?></option>
                        <option value="outage"><?= $lang === 'es' ? 'Interrupción' : 'Outage' ?></option>
                        <option value="maintenance"><?= $lang === 'es' ? 'Mantenimiento' : 'Scheduled Maintenance' ?></option>
                        <option value="resolved"><?= $lang === 'es' ? 'Resuelto' : 'Resolved' ?></option>
                    </select>
                </div>
                <div>
                    <label for="incidentDescription" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $lang === 'es' ? 'Descripción' : 'Description' ?></label>
                    <textarea id="incidentDescription" name="description" rows="3" required placeholder="<?= $lang === 'es' ? 'Describe el problema...' : 'Describe what is happening and affected services...' ?>"
                        class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition resize-none"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label for="incidentStartTime" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5"><?= $lang === 'es' ? 'Inicio' : 'Start Time' ?></label>
                        <input type="datetime-local" id="incidentStartTime" name="start_time" value="<?= date('Y-m-d\TH:i') ?>" required
                            class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition dark:[color-scheme:dark]">
                    </div>
                    <div>
                        <label for="incidentEndTime" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                            <?= $lang === 'es' ? 'Fin' : 'End Time' ?> <span class="normal-case font-normal text-slate-400">(<?= $lang === 'es' ? 'opcional' : 'optional' ?>)</span>
                        </label>
                        <input type="datetime-local" id="incidentEndTime" name="end_time"
                            class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600/70 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm transition dark:[color-scheme:dark]">
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" onclick="closeModal('createIncidentModal')"
                        class="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                        <?= $lang === 'es' ? 'Cancelar' : 'Cancel' ?>
                    </button>
                    <button type="submit"
                        class="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5">
                        <i class="fa-solid fa-circle-exclamation text-xs"></i>
                        <?= $lang === 'es' ? 'Publicar' : 'Post Incident' ?>
                    </button>
                </div>
            </form>
            <div id="createIncidentMsg" class="mt-3 text-sm"></div>
        </div>
    </div>
</div>

<!-- Remove Incident Confirmation Modal -->
<div id="removeIncidentModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('removeIncidentModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700/50">
        <div class="px-6 pt-6 pb-4 text-center">
            <div class="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                <i class="fa-solid fa-trash text-red-600 dark:text-red-400 text-lg"></i>
            </div>
            <h5 class="text-lg font-bold text-slate-900 dark:text-white"><?= $lang === 'es' ? 'Eliminar Incidente' : 'Remove Incident' ?></h5>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1"><?= $lang === 'es' ? 'Esta acción no se puede deshacer.' : 'This cannot be undone.' ?></p>
        </div>
        <div class="px-6 pb-6 flex flex-col gap-2">
            <button type="button" id="confirmRemoveIncident"
                class="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-trash text-xs"></i>
                <?= $lang === 'es' ? 'Sí, eliminar' : 'Yes, Remove' ?>
            </button>
            <button type="button" onclick="closeModal('removeIncidentModal')"
                class="w-full py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <?= $lang === 'es' ? 'Cancelar' : 'Cancel' ?>
            </button>
        </div>
    </div>
</div>

<!-- Outage History Modal -->
<div id="outageLogModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('outageLogModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700/50 flex flex-col max-h-[80vh]">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/60 flex-shrink-0">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                    <i class="fa-solid fa-clock-rotate-left text-indigo-600 dark:text-indigo-400 text-sm"></i>
                </div>
                <h5 class="font-bold text-slate-900 dark:text-white"><?= $lang === 'es' ? 'Historial de Interrupciones' : 'Outage History' ?></h5>
            </div>
            <button onclick="closeModal('outageLogModal')" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none">&times;</button>
        </div>
        <div class="overflow-y-auto flex-1 px-6 py-4">
            <div id="outageLogBody">
                <p class="text-sm text-slate-400 text-center py-6"><?= $lang === 'es' ? 'Cargando...' : 'Loading...' ?></p>
            </div>
        </div>
    </div>
</div>

<!-- RSS Feed Modal -->
<div id="rssFeedModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
     onclick="if(event.target===this)closeModal('rssFeedModal')">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h5 class="text-base font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <i class="fa-solid fa-rss text-orange-500"></i>
                <span id="rssFeedModalTitle"><?= $lang === 'es' ? 'Fuente RSS' : 'RSS Feed' ?></span>
            </h5>
            <button onclick="closeModal('rssFeedModal')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
        </div>
        <div id="rssFeedModalBody" class="px-6 py-5 modal-scroll overflow-y-auto max-h-[60vh]"></div>
    </div>
</div>


<!-- ── Config popup modal (iframe) ──────────────────────────────── -->
<div id="configModal" class="sp-modal hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
    <div class="bg-white dark:bg-[#0d1b30] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-transparent dark:border-slate-600/40"
         style="width:96vw;max-width:1140px;height:93vh">
        <iframe id="config-iframe" src="" style="flex:1;border:0;min-height:0;width:100%"></iframe>
    </div>
</div>
<script>
function openConfigModal() {
    var iframe = document.getElementById('config-iframe');
    if (!iframe.getAttribute('data-loaded')) {
        iframe.src = 'config.php?embed=1';
        iframe.setAttribute('data-loaded','1');
    }
    openModal('configModal');
}
window.closeConfigModal = function(reload) {
    closeModal('configModal');
    var iframe = document.getElementById('config-iframe');
    iframe.removeAttribute('data-loaded'); // force fresh load next open
    iframe.src = '';
    if (reload) location.reload();
};
</script>

<script>window.showLoginModal = <?= !empty($show_login_modal) ? 'true' : 'false' ?>;</script>
<?php if ($local_jq): ?>
<script src="assets/jquery.min.js"></script>
<?php else: ?>
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
<script>window.jQuery || document.write('<script src="https:\/\/cdn.jsdelivr.net\/npm\/jquery@3.7.1\/dist\/jquery.min.js"><\/script>')</script>
<?php endif; ?>
<script src="status-page.js"></script>

<?php if ($debug_mode): ?>
<!-- ── Debug overlay (visible in Yodeck — no external deps) ─────────── -->
<style>
#sp-debug { position:fixed;bottom:0;left:0;right:0;background:#0f172a;color:#94a3b8;font-family:monospace;font-size:11px;padding:8px 12px;z-index:99999;border-top:3px solid #334155;max-height:50vh;overflow-y:auto;line-height:1.65 }
#sp-debug .ok  { color:#34d399 }
#sp-debug .err { color:#f87171 }
#sp-debug .wrn { color:#fbbf24 }
#sp-debug h4   { color:#f1f5f9;font-size:12px;font-weight:bold;margin:4px 0 2px }
#sp-debug pre  { background:#1e293b;color:#7dd3fc;padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin:4px 0;font-size:10px;max-height:120px;overflow-y:auto }
</style>
<div id="sp-debug">
    <h4>&#x1F50D; Status Page Debug &mdash; <span id="spd-url"></span></h4>
    <div id="spd-js">&#x23F3; JS initializing&hellip;</div>
    <div id="spd-assets"></div>
    <div id="spd-tw">&#x23F3; Tailwind&hellip;</div>
    <div id="spd-jq">&#x23F3; jQuery&hellip;</div>
    <div id="spd-fa">&#x23F3; Font Awesome&hellip;</div>
    <div id="spd-fetch">&#x23F3; fetch API&hellip;</div>
    <div id="spd-dom">&#x23F3; DOM elements&hellip;</div>
    <div id="spd-status">&#x23F3; status_ajax.php&hellip;</div>
    <div id="spd-rss">&#x23F3; rss_ajax.php&hellip;</div>
    <div id="spd-inc">&#x23F3; incidents.json&hellip;</div>
    <h4>Execution trace (updates live):</h4>
    <pre id="spd-log">waiting for status-page.js&hellip;</pre>
</div>
<script>
(function(){
    var OK='<span class="ok">&#x2705;</span>', NO='<span class="err">&#x274C;</span>', WN='<span class="wrn">&#x26A0;</span>';
    function set(id,icon,msg){ var e=document.getElementById(id); if(e) e.innerHTML=icon+' '+msg; }
    document.getElementById('spd-url').textContent = window.location.href;

    set('spd-js',    OK, 'JavaScript is running');
    set('spd-fetch', window.fetch ? OK : NO, 'fetch: ' + (window.fetch ? 'available' : 'NOT available'));
    set('spd-assets', OK,
        'PHP local-asset flags &mdash; tw:<?= $local_tw?'YES':'NO' ?> fa:<?= $local_fa?'YES':'NO' ?> jq:<?= $local_jq?'YES':'NO' ?>');

    // DOM element check
    var ids = ['all_status','network_status_placeholder','services_placeholder','rss_area','incidents_area'];
    var missing = ids.filter(function(id){ return !document.getElementById(id); });
    set('spd-dom', missing.length ? NO : OK,
        missing.length ? 'Missing elements: ' + missing.join(', ') : 'All ' + ids.length + ' placeholder elements found');

    // Delayed checks (give scripts time to run)
    setTimeout(function(){
        set('spd-tw', window.tailwind ? OK : NO,
            window.tailwind ? 'Tailwind loaded' : 'Tailwind NOT loaded — no CSS');
        set('spd-jq', window.jQuery ? OK : WN,
            window.jQuery ? 'jQuery v'+jQuery.fn.jquery : 'jQuery NOT loaded (display still uses fetch)');

        var fa=document.createElement('i');
        fa.className='fa-solid fa-circle-check';
        fa.style.cssText='position:absolute;left:-9999px';
        document.body.appendChild(fa);
        var w=fa.offsetWidth;
        document.body.removeChild(fa);
        set('spd-fa', w>0 ? OK : NO, w>0 ? 'Font Awesome loaded (w='+w+'px)' : 'Font Awesome NOT loaded');
    }, 1500);

    // Live trace log — poll window._spLog every 500ms
    setInterval(function(){
        var log = window._spLog;
        var el  = document.getElementById('spd-log');
        if (el && log && log.length) el.textContent = log.join('\n');
    }, 500);

    // Endpoint tests
    if (!window.fetch) return;
    function testEp(id, url) {
        fetch(url+'?cb='+Date.now())
            .then(function(r){ return r.text().then(function(t){ return {s:r.status,t:t}; }); })
            .then(function(r){
                if(r.s!==200){ set(id,NO,url+': HTTP '+r.s+' &mdash; '+r.t.substr(0,100)); return; }
                try {
                    var j=JSON.parse(r.t);
                    var info=j.services ? 'services='+j.services.length+' local_ok='+j.local_ok+' wide_ok='+j.wide_ok
                           : Array.isArray(j) ? 'array['+j.length+']' : r.t.substr(0,80);
                    set(id,OK,url+': OK &mdash; '+info);
                } catch(e){ set(id,WN,url+': HTTP 200 but invalid JSON &mdash; '+r.t.substr(0,100)); }
            })
            .catch(function(e){ set(id,NO,url+': FETCH FAILED &mdash; '+e.message); });
    }
    testEp('spd-status','include/status_ajax.php');
    testEp('spd-rss',   'include/rss_ajax.php');
    testEp('spd-inc',   'include/incidents.json');
})();
</script>
<?php endif; ?>
</body>
</html>

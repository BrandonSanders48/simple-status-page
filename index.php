<?php
// Strict types and error reporting for better standards
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

// Start session for CSRF protection
session_start();


if (isset($_GET['logout'])) {
    session_destroy();
    header("Location: index.php");
    exit();
}

// --- CSRF Token ---
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// --- Load Configuration ---
$configPath = __DIR__ . '/include/configuration.json';
$json = @file_get_contents($configPath);
if ($json === false) {
    http_response_code(500);
    exit('Error reading the JSON file');
}
$json_data = json_decode($json, true);
if ($json_data === null) {
    http_response_code(500);
    exit('Error decoding the JSON file');
}

// --- Simple Rate Limiting for Login and Subscription ---
function rate_limit($key, $limit = 5, $window = 300) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $session_key = "rate_limit_{$key}_{$ip}";
    if (!isset($_SESSION[$session_key])) {
        $_SESSION[$session_key] = [];
    }
    // Remove old attempts
    $_SESSION[$session_key] = array_filter($_SESSION[$session_key], function($ts) use ($window) {
        return $ts > (time() - $window);
    });
    if (count($_SESSION[$session_key]) >= $limit) {
        return false;
    }
    $_SESSION[$session_key][] = time();
    return true;
}

// --- Authentication (simple session-based) ---
// Auth required flag: default true, can be overridden by env variable
$auth_required = getenv('APP_AUTH_REQUIRED') !== false 
    ? filter_var(getenv('APP_AUTH_REQUIRED'), FILTER_VALIDATE_BOOLEAN) 
    : true;
// Use environment variables if set, otherwise JSON, otherwise default
$admin_user = getenv('APP_USERNAME') ?: ($json_data['auth']['username'] ?? 'admin');
$admin_pass = getenv('APP_PASSWORD') ?: ($json_data['auth']['password'] ?? 'changeme');


if (isset($_POST['login'])) {
    if (!rate_limit('login', 5, 300)) { // 5 attempts per 5 minutes
        $login_error = "Too many login attempts. Please wait and try again.";
        $show_login_modal = true;
    } elseif ($_POST['username'] === $admin_user && $_POST['password'] === $admin_pass) {
        session_regenerate_id(true); // Prevent session fixation
        $_SESSION['authenticated'] = true;
        header("Location: index.php");
        exit();
    } else {
        $login_error = "Invalid credentials.";
        $show_login_modal = true;
    }
}

// --- Use new structure for easier access ---
$network = $json_data['network'] ?? [];
$refresh_rate = $json_data['refresh_rate'] ?? 3000;
$alert_sound = $json_data['alert_sound'] ?? false;
$internal_hosts = $json_data['internal_hosts'] ?? [];
$rss_feeds = $json_data['RSS'] ?? [];
$providers = $json_data['providers'] ?? [];
$business_name = $json_data['business_name'] ?? 'Status Page';
$business_logo = $json_data['business_logo'] ?? '';
$footer_message = $json_data['footer_message'] ?? '';
$meta = $json_data['meta'] ?? [];

// --- Handle Configuration Save/Backup (admin only) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_SESSION['authenticated']) && $_SESSION['authenticated']) {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        http_response_code(403);
        exit('Invalid CSRF token');
    }
    if (isset($_POST['backup']) && $_POST['backup'] === "1") {
        $filename = "Status Page - Config Backup.json";
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($json));
        echo $json;
        exit();
    }
    $jsonInput = $_POST['json'] ?? '';
    if ($jsonInput !== '') {
        json_decode($jsonInput);
        if (json_last_error() !== JSON_ERROR_NONE) {
            header("Location: index.php?Error=InvalidJSON");
            exit();
        }
        file_put_contents($configPath, $jsonInput);
        header("Location: index.php?Saved=true");
        exit();
    }
}

// --- Language Support (simple) ---
$supported_langs = ['en' => 'English', 'es' => 'Español'];
$lang = $_GET['lang'] ?? ($_COOKIE['lang'] ?? 'en');
if (!array_key_exists($lang, $supported_langs)) $lang = 'en';
setcookie('lang', $lang, time() + 3600 * 24 * 30, '/');
$lang_strings = [
    'en' => [
        'status_page' => 'Status Page',
        'login' => 'Login',
        'logout' => 'Logout',
        'username' => 'Username',
        'password' => 'Password',
        'edit_config' => 'Edit Configuration',
        'backup_config' => 'Backup Configuration',
        'save_changes' => 'Save Changes',
        'close' => 'Close',
        'refreshing' => 'Refreshing Data...',
        'config_saved' => 'Configuration saved successfully.',
        'invalid_json' => 'Invalid JSON format. Please correct and try again.',
        'auto_refresh' => 'Auto-Refresh',
        'interval' => 'Interval (ms)',
        'dark_mode' => 'Dark Mode',
        'light_mode' => 'Light Mode',
        'incidents' => 'Incidents',
        'subscribe' => 'Subscribe',
        'email' => 'Email',
        'subscribe_service' => 'Subscribe to Service Updates',
        'select_service' => 'Select Service',
        'submit' => 'Submit',
        'all_systems_operational' => 'All Systems Operational',
        'issues_detected' => 'Issues Detected In Your Environment',
        'notices' => 'Notices',
        'internally_hosted' => 'Internally Hosted Services',
        'local_area' => 'Local-Area Network',
        'wide_area' => 'Wide-Area Network',
        'system_status' => 'System Status',
        'failure' => 'Failure',
        'unknown_isp' => 'Unknown ISP',
        'service' => 'Service',
        'loading' => 'Loading...'
    ],
    'es' => [
        'status_page' => 'Página de Estado',
        'login' => 'Iniciar sesión',
        'logout' => 'Cerrar sesión',
        'username' => 'Usuario',
        'password' => 'Contraseña',
        'edit_config' => 'Editar Configuración',
        'backup_config' => 'Respaldar Configuración',
        'save_changes' => 'Guardar Cambios',
        'close' => 'Cerrar',
        'refreshing' => 'Actualizando datos...',
        'config_saved' => 'Configuración guardada exitosamente.',
        'invalid_json' => 'Formato JSON inválido. Corrija y vuelva a intentar.',
        'auto_refresh' => 'Auto-Actualizar',
        'interval' => 'Intervalo (ms)',
        'dark_mode' => 'Modo Oscuro',
        'light_mode' => 'Modo Claro',
        'incidents' => 'Incidentes',
        'subscribe' => 'Suscribirse',
        'email' => 'Correo electrónico',
        'subscribe_service' => 'Suscribirse a Actualizaciones de Servicio',
        'select_service' => 'Seleccionar Servicio',
        'submit' => 'Enviar',
        'all_systems_operational' => 'Todos los sistemas operativos',
        'issues_detected' => 'Problemas detectados en su entorno',
        'notices' => 'Avisos',
        'internally_hosted' => 'Servicios Internos',
        'local_area' => 'Red de Área Local',
        'wide_area' => 'Red de Área Amplia',
        'system_status' => 'Estado del Sistema',
        'failure' => 'Fallo',
        'unknown_isp' => 'ISP desconocido',
        'service' => 'Servicio',
        'loading' => 'Cargando...'
    ]
];
$t = $lang_strings[$lang];

// --- Dark Mode Preference ---
$dark_mode = $_COOKIE['dark_mode'] ?? 'off';

// --- Incident Remove Handler (AJAX) ---
if (
    $_SERVER['REQUEST_METHOD'] === 'POST' &&
    isset($_POST['remove_incident']) &&
    isset($_SESSION['authenticated']) && $_SESSION['authenticated']
) {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== $_SESSION['csrf_token']) {
        http_response_code(403); exit('Invalid CSRF token');
    }
    $incidentsFile = __DIR__ . '/include/incidents.json';
    $incidents = [];
    if (file_exists($incidentsFile)) {
        $incidents = json_decode(file_get_contents($incidentsFile), true);
        if (!is_array($incidents)) $incidents = [];
    }
    $idx = intval($_POST['remove_incident']);
    if (isset($incidents[$idx])) {
        array_splice($incidents, $idx, 1);
        file_put_contents($incidentsFile, json_encode($incidents, JSON_PRETTY_PRINT));
        exit('OK');
    } else {
        http_response_code(404); exit('Incident not found');
    }
}
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang) ?>">
<head>
    <meta charset="UTF-8">
    <title><?= htmlspecialchars($business_name) ?> <?= $t['status_page'] ?></title>
    <link rel="icon" type="image/x-icon" href="images/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" rel="stylesheet">
    <style>
		html, body {
            height: 100%;
        }
        body {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            padding-bottom: 40px;
            background: #f8f9fa;
        }
        .container.mt-4 {
            flex: 1 0 auto;
        }
        footer {
            flex-shrink: 0;
            margin-top: auto;
        }
        body.dark-mode {
            background: #181a1b !important;
            color: #e0e0e0;
        }
        body.dark-mode .modal-content,
        body.dark-mode .pageContainer {
            background-color: #23272b !important;
            color: #e0e0e0;
        }
        body.dark-mode .alert {
            background-color: #23272b !important;
            color: #e0e0e0;
        }
        .card {
            background: #fff;
        }
        .modal-content {
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
}
    #services_placeholder .card {
        min-height: 140px;
        transition: box-shadow 0.2s;
    }
    #services_placeholder .card:hover {
        box-shadow: 0 6px 24px rgba(0,0,0,0.13);
    }
    #services_placeholder .badge,
#services_placeholder .tag,
#services_placeholder .status-tag {
    background: #f1f3f5 !important;
    color: #333 !important;
    font-weight: 500;
    border: 1px solid #e0e0e0 !important;
}
    </style>
</head>
<body class="<?= $dark_mode === 'on' ? 'dark-mode' : '' ?>"
    data-csrf="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>"
    data-all-systems-operational="<?= $t['all_systems_operational'] ?>"
    data-issues-detected="<?= $t['issues_detected'] ?>"
    data-light-mode="<?= $t['light_mode'] ?>"
    data-dark-mode="<?= $t['dark_mode'] ?>" 
	data-admin="<?= (isset($_SESSION['authenticated']) && $_SESSION['authenticated']) ? 'true' : 'false' ?>"
	data-local-area="<?= htmlspecialchars($t['local_area']) ?>"
    data-wide-area="<?= htmlspecialchars($t['wide_area']) ?>"
    data-loading="<?= htmlspecialchars($t['loading']) ?>"
	data-service="<?= htmlspecialchars($t['service']) ?>"
>
    <nav class="navbar navbar-expand-lg navbar-dark" style="background: #212529; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div class="container-fluid">
            <span class="navbar-brand d-flex align-items-center">
                <?php if ($business_logo): ?>
                    <img 
                        src="<?= htmlspecialchars($business_logo) ?>" 
                        alt="Logo"
                        style="background:#fff; border-radius:12px; padding:6px 12px; margin-right:10px; max-height:40px;"
                    >
                <?php endif; ?>
                simple-status-page
            </span>
            <!-- Add toggler for mobile -->
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarResponsive" aria-controls="navbarResponsive" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <!-- Responsive content -->
            <div class="collapse navbar-collapse" id="navbarResponsive">
                <!-- Navbar Buttons: All grouped and responsive -->
<div class="ms-auto d-flex flex-wrap align-items-center justify-content-end gap-2" style="width:100%;">
    <!-- Language Selector -->
    <div class="d-flex align-items-center me-2 mb-2 mb-lg-0" style="min-width: 220px; height:32px;">
        <span class="input-group-text" style="min-width: 110px; height:32px; display: flex; align-items: center; gap: 6px; border-radius: 6px 0 0 6px; background: #343a40; color: #fff; border: 1px solid #23272b; padding-top:0; padding-bottom:0;">
            <?= $lang === 'es' ? 'Idioma' : 'Language' ?>
        </span>
        <div style="background: #f8f9fa; border: 1px solid #ced4da; border-radius: 0 6px 6px 0; display: flex; align-items: center; padding: 0 8px 0 6px; margin-left: -1px; height:32px;">
            <select name="lang" id="langSelect" class="form-select form-select-sm border-0 bg-transparent text-dark"
                style="width: 110px; min-width: 90px; box-shadow: none; padding-left: 0; height:28px;">
                <?php foreach ($supported_langs as $code => $label): ?>
                    <option value="<?= $code ?>" <?= $lang === $code ? 'selected' : '' ?>><?= $label ?></option>
                <?php endforeach; ?>
            </select>
        </div>
    </div>
    <!-- Auto-Refresh Controls -->
    <div class="d-flex align-items-center me-2 mb-2 mb-lg-0" style="min-width: 220px; height:32px;">
        <span class="input-group-text" style="min-width: 110px; height:32px; display: flex; align-items: center; gap: 6px; border-radius: 6px 0 0 6px; background: #343a40; color: #fff; border: 1px solid #23272b; padding-top:0; padding-bottom:0;">
            <input type="checkbox" id="refreshToggle" checked style="margin-right:6px;vertical-align:middle;">
            <?= $t['auto_refresh'] ?>
        </span>
        <div style="background: #f8f9fa; border: 1px solid #ced4da; border-radius: 0 6px 6px 0; display: flex; align-items: center; padding: 0 8px 0 6px; margin-left: -1px; height:32px;">
            <input type="number" id="refreshInterval" value="<?= (int)$refresh_rate ?>" min="3000" step="500"
                class="form-control form-control-sm border-0 bg-transparent text-dark"
                style="width:70px;min-width:60px; text-align:right; background:transparent; box-shadow:none; height:28px;"
                title="<?= $t['interval'] ?>"
                aria-label="<?= $t['interval'] ?>">
            <span style="margin-left:2px; font-size:0.95em; color:#555;">ms</span>
        </div>
    </div>
    <!-- All Main Buttons Grouped -->
    <div class="d-flex flex-row flex-wrap gap-2 align-items-center mb-2 mb-lg-0">
        <!-- Subscribe Button -->
        <button class="btn btn-success btn-sm d-flex align-items-center" type="button" data-bs-toggle="modal" data-bs-target="#subscribeModal" style="min-width: 100px; max-height:32px;">
            <i class="fa-solid fa-envelope"></i>
            <span class="ms-1"><?= $t['subscribe'] ?></span>
        </button>
        <?php if (isset($_SESSION['authenticated']) && $_SESSION['authenticated']): ?>
            <!-- Create Incident Button -->
            <button title="Create Incident" type="button" class="btn btn-warning btn-sm d-flex align-items-center" data-bs-toggle="modal" data-bs-target="#createIncidentModal" style="min-width: 100px; max-height:32px;">
                <i class="fa-solid fa-plus"></i> <span class="ms-1"><?= $t['incidents'] ?></span>
            </button>
            <!-- Edit Config Button -->
            <button title="Edit Configuration" type="button" class="btn btn-secondary btn-sm d-flex align-items-center" data-bs-toggle="modal" data-bs-target="#addModal" style="min-width: 40px; max-height:32px;">
                &nbsp;<i class="fa-solid fa-gear"></i>&nbsp;
            </button>
            <!-- Logout Button -->
            <a href="?logout=1" class="btn btn-danger btn-sm" style="min-width: 70px; max-height:32px;"><?= $t['logout'] ?></a>
        <?php else: ?>
            <!-- Login Button -->
            <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#loginModal" style="min-width: 70px; max-height:32px;"><?= $t['login'] ?></button>
        <?php endif; ?>
    </div>
</div>
            </div>
        </div>
    </nav>

    <div class="container mt-4">
        <div class="card shadow-sm mb-4" style="border-radius: 18px;">
            <div class="card-body">
                <!-- Dynamic Status Placeholders -->
                <div id="all_status" class="alert alert-success text-center d-flex align-items-center justify-content-center" role="alert" style="font-size:26px;">
    <span id="statusIcon" style="display:none;" class="me-2"></span>
    <span id="webTicker"><b>...</b></span>
</div>
<div class="alert alert-light border" role="alert" id="network_status_placeholder" style="color:#333;">
    <div class="d-flex justify-content-between align-items-center flex-wrap" style="gap: 16px;">
        <h6 class="mb-0" style="font-weight:500; color:#444;">
            <?= $t['local_area'] ?>:
            <span style="color:#888; margin-left:8px;" id="local_area_status">...</span>
        </h6>
        <h6 class="mb-0" style="font-weight:500; color:#444;">
            <?= $t['wide_area'] ?>:
            <span style="color:#888; margin-left:8px;" id="wide_area_status">...</span>
        </h6>
    </div>
</div>
<h5 class="mt-4 mb-2">
    <i class="fa-solid fa-server text-primary"></i> <?= $t['internally_hosted'] ?>
</h5>
<hr>
<div class="row g-3" id="services_placeholder">
    <div class="text-center w-100"><?= $t['loading'] ?></div>
    <!-- Service cards will be injected here by JS -->
</div>
                <h5 style="margin-top:20px"><i style="color:orange" class="fa-solid fa-circle-exclamation"></i> &nbsp;<?= $t['notices'] ?></h5>
                <hr>
                <div class="row" id="rss_area">
                    <div class="text-center"><?= $t['loading'] ?></div>
                </div>
                <div id="incidents_container" class="container mt-4" style="transition:opacity 0.5s;">
                    <h5>
                        <i class="fa-solid fa-triangle-exclamation text-warning"></i> <?= $t['incidents'] ?>
                    </h5>
                    <hr>
                    <div id="incidents_area"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Subscription Modal -->
<div class="modal fade" id="subscribeModal" tabindex="-1" aria-labelledby="subscribeModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content" style="border-radius: 12px;">
            <div class="modal-header">
                <h5 class="modal-title" id="subscribeModalLabel">
                    <i class="fa-solid fa-envelope text-primary"></i> <?= $t['subscribe_service'] ?>
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
            </div>
            <div class="modal-body">
                <form id="subscribeForm" class="row g-2 align-items-end">
                    <div class="col-12">
                        <label for="subscribeEmail" class="form-label"><?= $t['email'] ?></label>
                        <input type="email" class="form-control" id="subscribeEmail" name="email" placeholder="<?= $t['email'] ?>" required>
                    </div>
                    <div class="col-12">
                        <label for="subscribeService" class="form-label"><?= $t['select_service'] ?></label>
                        <select id="subscribeService" name="service[]" class="form-select" multiple required size="10" style="min-height: 260px;">
                            <?php foreach ($internal_hosts as $service): ?>
                                <option value="<?= htmlspecialchars($service['name']) ?>">
                                    <?= $t['service'] ?>: <?= htmlspecialchars($service['name']) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <div class="form-text"><?= $lang === 'es' ? 'Mantenga presionada Ctrl (Windows) o Cmd (Mac) para seleccionar varios.' : 'Hold Ctrl (Windows) or Cmd (Mac) to select multiple.' ?></div>
                    </div>
                    <div class="col-12 mt-3 text-end">
                        <button type="submit" class="btn btn-success px-4"><?= $t['subscribe'] ?></button>
                        <button type="button" class="btn btn-outline-secondary px-4 ms-2" data-bs-target="#manageSubModal" data-bs-toggle="modal" data-bs-dismiss="modal">
                            <i class="fa-solid fa-gear"></i> <?= $lang === 'es' ? 'Administrar' : 'Manage' ?>
                        </button>
                    </div>
                </form>
                <div id="subscribeMsg" class="mt-3"></div>
            </div>
        </div>
    </div>
</div>

<!-- Manage Subscription Modal -->
<div class="modal fade" id="manageSubModal" tabindex="-1" aria-labelledby="manageSubModalLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content" style="border-radius: 12px;">
            <div class="modal-header">
                <h5 class="modal-title" id="manageSubModalLabel">
                    <i class="fa-solid fa-gear text-primary"></i> <?= $lang === 'es' ? 'Administrar Suscripciones' : 'Manage Subscriptions' ?>
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
            </div>
            <div class="modal-body">
                <form id="manageSubForm" class="row g-2 align-items-end">
                    <div class="col-12">
                        <label for="manageEmail" class="form-label"><?= $t['email'] ?></label>
                        <input type="email" class="form-control" id="manageEmail" name="email" placeholder="<?= $t['email'] ?>" required>
                    </div>
                    <div class="col-12">
                        <label for="manageAction" class="form-label"><?= $lang === 'es' ? 'Acción' : 'Action' ?></label>
                        <select id="manageAction" name="action" class="form-select" required>
                            <option value="view"><?= $lang === 'es' ? 'Ver Suscripciones' : 'View Subscriptions' ?></option>
                            <option value="unsubscribe"><?= $lang === 'es' ? 'Darse de baja de todas' : 'Unsubscribe from All' ?></option>
                        </select>
                    </div>
                    <div class="col-12 mt-3 text-end">
                        <button type="submit" class="btn btn-primary px-4"><?= $t['submit'] ?></button>
                        <button type="button" class="btn btn-secondary ms-2" data-bs-target="#subscribeModal" data-bs-toggle="modal" data-bs-dismiss="modal">
                            <i class="fa-solid fa-arrow-left"></i> <?= $lang === 'es' ? 'Atrás' : 'Back' ?>
                        </button>
                    </div>
                </form>
                <div id="manageSubMsg" class="mt-3"></div>
                <div id="manageSubResults" class="mt-3"></div>
            </div>
        </div>
    </div>
</div>

    <!-- Login Modal -->
<div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content" style="border-radius: 12px;">
      <div class="modal-header">
        <h5 class="modal-title" id="loginModalLabel">
          <i class="fa-solid fa-user-lock text-primary"></i> <?= $t['login'] ?>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
      </div>
      <div class="modal-body">
        <?php if (isset($login_error)): ?>
          <div class="alert alert-danger"><?= htmlspecialchars($login_error) ?></div>
        <?php endif; ?>
        <form method="post" autocomplete="off">
          <div class="mb-3">
            <label for="loginUsername" class="form-label"><?= $t['username'] ?></label>
            <input type="text" class="form-control" id="loginUsername" name="username" required>
          </div>
          <div class="mb-3">
            <label for="loginPassword" class="form-label"><?= $t['password'] ?></label>
            <input type="password" class="form-control" id="loginPassword" name="password" required>
          </div>
          <div class="text-end">
            <button type="submit" name="login" class="btn btn-primary"><?= $t['login'] ?></button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

    <!-- Edit Configuration Modal -->
<div class="modal fade" id="addModal" tabindex="-1" aria-labelledby="addModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content" style="border-radius: 12px;">
      <div class="modal-header">
        <h5 class="modal-title" id="addModalLabel">
          <i class="fa-solid fa-gear text-primary"></i> <?= $t['edit_config'] ?>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
      </div>
      <div class="modal-body">
        <form method="post" autocomplete="off">
          <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token']) ?>">
          <div class="mb-3">
            <label for="configJson" class="form-label">configuration.json</label>
            <textarea class="form-control" id="configJson" name="json" rows="15"><?= htmlspecialchars($json) ?></textarea>
          </div>
          <div class="text-end">
            <button type="submit" class="btn btn-primary"><?= $t['save_changes'] ?></button>
            <button type="submit" name="backup" value="1" class="btn btn-secondary"><?= $t['backup_config'] ?></button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<!-- Create Incident Modal -->
<div class="modal fade" id="createIncidentModal" tabindex="-1" aria-labelledby="createIncidentModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content" style="border-radius: 12px;">
      <div class="modal-header">
        <h5 class="modal-title" id="createIncidentModalLabel">
          <i class="fa-solid fa-triangle-exclamation text-warning"></i> <?= $t['incidents'] ?>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
      </div>
      <div class="modal-body">
        <form id="createIncidentForm" class="row g-2">
          <div class="col-12">
            <label for="incidentTitle" class="form-label"><?= $lang === 'es' ? 'Título' : 'Title' ?></label>
            <input type="text" class="form-control" id="incidentTitle" name="title" required>
          </div>
          <div class="col-12">
            <label for="incidentDescription" class="form-label"><?= $lang === 'es' ? 'Descripción' : 'Description' ?></label>
            <textarea class="form-control" id="incidentDescription" name="description" rows="3" required></textarea>
          </div>
          <div class="col-12">
            <label for="incidentTime" class="form-label"><?= $lang === 'es' ? 'Hora' : 'Time' ?></label>
            <input type="text" class="form-control" id="incidentTime" name="time" value="<?= date('Y-m-d H:i') ?>" required>
            <div class="form-text"><?= $lang === 'es' ? 'Edite si es necesario (ej. "2025-11-19 14:00")' : 'Edit if needed (e.g. "2025-11-19 14:00")' ?></div>
          </div>
          <div class="col-12 text-end mt-2">
            <button type="submit" class="btn btn-warning"><?= $lang === 'es' ? 'Crear' : 'Create' ?></button>
          </div>
        </form>
        <div id="createIncidentMsg" class="mt-3"></div>
      </div>
    </div>
  </div>
</div>

<!-- Remove Incident Confirmation Modal -->
<div class="modal fade" id="removeIncidentModal" tabindex="-1" aria-labelledby="removeIncidentModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius: 12px;">
            <div class="modal-header">
                <h5 class="modal-title" id="removeIncidentModalLabel">
                    <i class="fa fa-trash text-danger"></i> <?= $lang === 'es' ? 'Eliminar Incidente' : 'Remove Incident' ?>
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
            </div>
            <div class="modal-body">
                <?= $lang === 'es' ? '¿Está seguro de que desea eliminar este incidente?' : 'Are you sure you want to remove this incident?' ?>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><?= $lang === 'es' ? 'Cancelar' : 'Cancel' ?></button>
                <button type="button" id="confirmRemoveIncident" class="btn btn-danger"><?= $lang === 'es' ? 'Eliminar' : 'Remove' ?></button>
            </div>
        </div>
    </div>
</div>

<!-- RSS Feed Modal -->
<div class="modal fade" id="rssFeedModal" tabindex="-1" aria-labelledby="rssFeedModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content" style="border-radius: 12px;">
      <div class="modal-header">
        <h5 class="modal-title" id="rssFeedModalLabel">
          <i class="fa-solid fa-rss text-primary"></i>
          <!-- Use translated label -->
          <span id="rssFeedModalTitle"><?= $lang === 'es' ? 'Fuente RSS' : 'RSS Feed' ?></span>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
      </div>
      <div class="modal-body" id="rssFeedModalBody" style="max-height:60vh;overflow-y:auto;">
        <!-- RSS feed content will be loaded here -->
      </div>
    </div>
  </div>
</div>

    <footer class="bg-light py-3 mt-4 border-top">
        <div class="container">
            <div class="text-center small text-muted"><?= htmlspecialchars($footer_message) ?></div>
            <?php if (!empty($meta['version'])): ?>
                <div class="text-center small text-secondary">
                    Config v<?= htmlspecialchars($meta['version']) ?><?= !empty($meta['author']) ? ' &mdash; ' . htmlspecialchars($meta['author']) : '' ?>
                </div>
            <?php endif; ?>
        </div>
    </footer>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.webticker/3.0.0/jquery.webticker.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <script src="status-page.js"></script>
</body>
</html>

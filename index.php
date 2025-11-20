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

// --- Authentication (simple session-based) ---
$auth_required = true;
$admin_user = $json_data['auth']['username'] ?? 'admin';
$admin_pass = $json_data['auth']['password'] ?? 'changeme';

if (isset($_POST['login'])) {
    if ($_POST['username'] === $admin_user && $_POST['password'] === $admin_pass) {
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
            header("Location: index.php?Error=InvalidJSON&access=true");
            exit();
        }
        file_put_contents($configPath, $jsonInput);
        header("Location: index.php?Saved=true&access=true");
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
        'system_status' => 'System Status'
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
        'system_status' => 'Estado del Sistema'
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
    <link rel="stylesheet" href="index.css" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
    <style>
        body.dark-mode {
            background-color: #181a1b !important;
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
    </style>
</head>
<body class="<?= $dark_mode === 'on' ? 'dark-mode' : '' ?>">
    <nav class="navbar navbar-expand-lg navbar-light bg-light">
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
            <div class="ms-auto d-flex align-items-center">
                <!-- Language Selector -->
                <div class="input-group input-group-sm align-items-center me-2" style="width: 240px; min-width: 240px;">
                    <span class="input-group-text" id="langLabel" style="min-width: 100px;"><?= $lang === 'es' ? 'Idioma' : 'Language' ?></span>
                    <select name="lang" id="langSelect" class="form-select form-select-sm" style="min-width: 110px;">
                        <?php foreach ($supported_langs as $code => $label): ?>
                            <option value="<?= $code ?>" <?= $lang === $code ? 'selected' : '' ?>><?= $label ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <!-- Dark Mode Button -->
                <button id="toggle-dark" type="button" class="btn btn-outline-secondary btn-sm me-2" style="color:#212529;border-color:#dee2e6 !important;min-width: 90px;">
                    <?= $dark_mode === 'on' ? $t['light_mode'] : $t['dark_mode'] ?>
                </button>
                <!-- Auto-Refresh Controls -->
                <div class="input-group input-group-sm align-items-center me-2" style="min-width: 220px;">
                    <label class="input-group-text" for="refreshToggle" style="min-width: 110px; display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" id="refreshToggle" checked style="margin-right:6px;vertical-align:middle;">
                        <?= $t['auto_refresh'] ?>
                    </label>
                    <input type="number" id="refreshInterval" value="<?= (int)$refresh_rate ?>" min="1000" step="500"
                        class="form-control form-control-sm"
                        style="width:90px;min-width:90px;"
                        title="<?= $t['interval'] ?>"
                        aria-label="<?= $t['interval'] ?>">
                    <span class="input-group-text" style="min-width: 40px;">ms</span>
                </div>
                <!-- Subscribe Button -->
                <button class="btn btn-outline-success btn-sm me-2" type="button" data-bs-toggle="modal" data-bs-target="#subscribeModal" style="min-width: 120px; max-height:32px; display:flex; align-items:center;">
                    <i class="fa-solid fa-envelope"></i> <span class="ms-1"><?= $t['subscribe'] ?></span>
                </button>
                <?php if (isset($_SESSION['authenticated']) && $_SESSION['authenticated']): ?>
                    <button title="Create Incident" type="button" class="btn btn-outline-warning btn-sm me-2" data-bs-toggle="modal" data-bs-target="#createIncidentModal" style="min-width: 120px; max-height:32px; display:flex; align-items:center;">
                        <i class="fa-solid fa-plus"></i> <span class="ms-1"><?= $t['incidents'] ?></span>
                    </button>                                  
                    <button title="Edit Configuration" type="button" class="btn btn-outline-dark btn-sm me-2" data-bs-toggle="modal" data-bs-target="#addModal" style="min-width: 40px; max-height:32px;">
                        <i class="fa-solid fa-gear"></i>
                    </button>
                    <a href="?logout=1" class="btn btn-outline-danger btn-sm" style="min-width: 70px; max-height:32px;"><?= $t['logout'] ?></a>                 
                <?php else: ?>
                    <button class="btn btn-outline-primary btn-sm" data-bs-toggle="modal" data-bs-target="#loginModal" style="min-width: 70px; max-height:32px;"><?= $t['login'] ?></button>
                <?php endif; ?>
            </div>
        </div>
    </nav>

    <div class="container mt-4">
        <!-- Dynamic Status Placeholders -->
        <div id="all_status" style="font-size:26px" class="alert alert-success text-center" role="alert">
            <span id="webTicker"><b>...</b></span>
        </div>
        <div class="alert alert-default" style="border: 1px solid grey" role="alert" id="network_status_placeholder">
            <h6><?= $t['local_area'] ?><span style="color:gray;float:right">...</span></h6>
            <hr>
            <h6><?= $t['wide_area'] ?><span style="color:gray;float:right">...</span></h6>
        </div>
        <h5><?= $t['internally_hosted'] ?></h5>
        <hr>
        <div class="row" id="services_placeholder">
            <div class="text-center">Loading services...</div>
        </div>
        <h5 style="margin-top:20px"><i style="color:orange" class="fa-solid fa-circle-exclamation"></i> &nbsp;<?= $t['notices'] ?></h5>
        <hr>
        <div class="row" id="rss_area">
            <div class="text-center">Loading notices...</div>
        </div>
        <div id="incidents_container" class="container mt-4" style="transition:opacity 0.5s;">
            <h5>
                <i class="fa-solid fa-triangle-exclamation text-warning"></i> <?= $t['incidents'] ?>
            </h5>
            <hr>
            <div id="incidents_area"></div>
        </div>
    </div>

    <!-- Subscription Modal -->
<div class="modal fade" id="subscribeModal" tabindex="-1" aria-labelledby="subscribeModalLabel" aria-hidden="true">
    <div class="modal-dialog">
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
                        <select id="subscribeService" name="service[]" class="form-select" multiple required size="4">
                            <?php foreach ($internal_hosts as $service): ?>
                                <option value="<?= htmlspecialchars($service['name']) ?>"><?= htmlspecialchars($service['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <div class="form-text">Hold Ctrl (Windows) or Cmd (Mac) to select multiple.</div>
                    </div>
                    <div class="col-12 mt-3 text-end">
                        <button type="submit" class="btn btn-success px-4"><?= $t['subscribe'] ?></button>
                        <button type="button" class="btn btn-outline-secondary px-4 ms-2" data-bs-target="#manageSubModal" data-bs-toggle="modal" data-bs-dismiss="modal">
                            <i class="fa-solid fa-gear"></i> Manage
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
                    <i class="fa-solid fa-gear text-primary"></i> Manage Subscriptions
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
                        <label for="manageAction" class="form-label">Action</label>
                        <select id="manageAction" name="action" class="form-select" required>
                            <option value="view">View Subscriptions</option>
                            <option value="unsubscribe">Unsubscribe from All</option>
                        </select>
                    </div>
                    <div class="col-12 mt-3 text-end">
                        <button type="submit" class="btn btn-primary px-4">Submit</button>
                        <button type="button" class="btn btn-secondary ms-2" data-bs-target="#subscribeModal" data-bs-toggle="modal" data-bs-dismiss="modal">
                            <i class="fa-solid fa-arrow-left"></i> Back
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
            <label for="incidentTitle" class="form-label">Title</label>
            <input type="text" class="form-control" id="incidentTitle" name="title" required>
          </div>
          <div class="col-12">
            <label for="incidentDescription" class="form-label">Description</label>
            <textarea class="form-control" id="incidentDescription" name="description" rows="3" required></textarea>
          </div>
          <div class="col-12">
            <label for="incidentTime" class="form-label">Time</label>
            <input type="text" class="form-control" id="incidentTime" name="time" value="<?= date('Y-m-d H:i') ?>" required>
            <div class="form-text">Edit if needed (e.g. "2025-11-19 14:00")</div>
          </div>
          <div class="col-12 text-end mt-2">
            <button type="submit" class="btn btn-warning">Create</button>
          </div>
        </form>
        <div id="createIncidentMsg" class="mt-3"></div>
      </div>
    </div>
  </div>
</div>

    <footer>
        <hr>
        <div class="text-center"><?= htmlspecialchars($footer_message) ?></div>
        <?php if (!empty($meta['version'])): ?>
            <div class="text-center" style="font-size:12px;color:#aaa;">
                Config v<?= htmlspecialchars($meta['version']) ?><?= !empty($meta['author']) ? ' &mdash; ' . htmlspecialchars($meta['author']) : '' ?>
            </div>
        <?php endif; ?>
    </footer>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.webticker/3.0.0/jquery.webticker.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <script>
const csrfToken = '<?= htmlspecialchars($_SESSION['csrf_token']) ?>';
const isAdmin = <?= (isset($_SESSION['authenticated']) && $_SESSION['authenticated']) ? 'true' : 'false' ?>;

// --- Dynamic: Incidents ---
function loadIncidents() {
    $.getJSON('include/incidents.json', function(data) {
        if (!data || !data.length) {
            $('#incidents_area').html('<div class="alert alert-success"><?= $t['all_systems_operational'] ?></div>');
        } else {
            let html = '';
            data.forEach(function(incident, idx) {
                html += `
                <div class="alert alert-warning shadow-sm mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <div class="d-flex align-items-center">
                            <i class="fa-solid fa-circle-exclamation text-warning me-2"></i>
                            <b>${incident.title}</b>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="text-end text-muted me-2" style="font-size:12px; min-width: 120px;">
                                <small>${incident.time}</small>
                            </div>
                            ${isAdmin ? `
                                <button class="btn btn-sm btn-danger remove-incident-btn" data-idx="${idx}" title="Remove Incident">
                                    <i class="fa fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div>${incident.description}</div>
                </div>`;
            });
            $('#incidents_area').html(html);
        }
    }).fail(function() {
        $('#incidents_area').html('');
    });
}

// --- Dynamic: Network Status and Services ---
function loadStatus() {
    $.getJSON('include/status_ajax.php', function(data) {
        $('#network_status_placeholder').html(
            `<h6><?= $t['local_area'] ?><span style="color:${data.local_color};float:right">${data.local_text}</span></h6>
            <hr>
            <h6><?= $t['wide_area'] ?><span style="color:${data.wide_color};float:right">${data.wide_text}</span></h6>`
        );
        let html = '';
        data.services.forEach(function(service) {
            html += `<div class="col-md-3 col-lg-3 col-sm-6 col-xl-3">
                <div style="padding:10px" class="statusContainer">
                    <div class="statusHeader">
                        <div style="display:inline">${service.status_icon}</div> &nbsp;&nbsp;
                        <h5 style="display:inline" class="statusTitle">${service.title}&nbsp;</h5>
                    </div>
                    <div class="statusSubtitle">
                        <div class="sectionUrl"><span>${service.type} Service</span></div>
                        ${service.desc ? `<div class="sectionUrl" style="font-size:12px;color:#888">${service.desc}</div>` : ''}
                    </div>
                </div>
            </div>`;
        });
        $('#services_placeholder').html(html);
        if (data.errors === 0) {
            $('#all_status').removeClass('alert-danger').addClass('alert-success');
            $('#webTicker').html('<b><?= $t['all_systems_operational'] ?></b>');
        } else {
            $('#all_status').removeClass('alert-success').addClass('alert-danger');
            $('#webTicker').html('<b><?= $t['issues_detected'] ?></b>');
        }
    });
}

// --- Dynamic: RSS Notices ---
function loadRSS() {
    $.getJSON('include/rss_ajax.php', function(data) {
        let html = '';
        data.forEach(function(feed) {
            let bg2 = "background:#e2e3e5;color:#41464b;border-radius:10px;";
            const low = [
    "maintenance", "scheduled", "planned", "notice", "update", "info", "informational"
];
const medium = [
    "unavailable", "inaccessible", "difficulty", "difficulties", "slow", "slowness", "trouble", "degraded", "delay", "delays", "partial", "unstable", "intermittent"
];
const high = [
    "error", "errors", "problem", "problems", "issue", "issues", "outage", "outages", "critical", "fault", "down", "failure", "failures", "disruption", "disruptions", "major"
];
            let item_short = feed.item.length > 75 ? feed.item.substring(0, 72) + "..." : feed.item;
            medium.forEach(word => { if (item_short.toLowerCase().includes(word)) bg2 = "background:#fff3cd;color:#856404;border-radius:10px;"; });
            high.forEach(word => { if (item_short.toLowerCase().includes(word)) bg2 = "background:#fddddd;color:maroon;border-radius:10px;"; });
            html += `
                <div style="height:100%;overflow:hidden;text-align:center" class="col-md-4 col-lg-4 col-sm-6 col-xl-4">
                    <div style="margin:5px;height:110px;padding:10px;text-align:center;${bg2}">
                        <div><h5>${feed.name}&nbsp;</h5></div>
                        <div title="${feed.item}">${item_short}</div>
                        ${feed.desc ? `<div style="font-size:12px;color:#888">${feed.desc}</div>` : ''}
                    </div>
                </div>
            `;
        });
        $('#rss_area').html(html);
    }).fail(function() {
        $('#rss_area').html('<div class="text-center text-danger">Failed to load notices.</div>');
    });
}

// --- Remove Incident Modal ---
let removeIncidentIdx = null;

// Show modal and store index
$(document).on('click', '.remove-incident-btn', function() {
    removeIncidentIdx = $(this).data('idx');
    $('#removeIncidentModal').modal('show');
});

// Confirm removal with fade out
$(document).on('click', '#confirmRemoveIncident', function() {
    if (removeIncidentIdx === null) return;
    // Find the incident alert div to fade out
    const $incidentDiv = $('.remove-incident-btn[data-idx="' + removeIncidentIdx + '"]').closest('.alert');
    $.ajax({
        url: '', // same page
        type: 'POST',
        data: {
            remove_incident: removeIncidentIdx,
            csrf_token: csrfToken
        },
        success: function() {
            $('#removeIncidentModal').modal('hide');
            $incidentDiv.fadeOut(400, function() {
                $(this).remove();
                // If no more incidents, reload to show "All Systems Operational"
                if ($('#incidents_area').children('.alert').length === 0) {
                    loadIncidents();
                }
            });
            removeIncidentIdx = null;
        },
        error: function(xhr) {
            alert(xhr.responseText || 'Failed to remove incident.');
        }
    });
});

// --- Dark Mode Toggle ---
document.getElementById('toggle-dark').onclick = function() {
    document.body.classList.toggle('dark-mode');
    document.cookie = 'dark_mode=' + (document.body.classList.contains('dark-mode') ? 'on' : 'off') + ';path=/;max-age=31536000';
    this.textContent = document.body.classList.contains('dark-mode') ? '<?= $t['light_mode'] ?>' : '<?= $t['dark_mode'] ?>';
};

// --- Create Incident ---
$('#createIncidentForm').on('submit', function(e) {
    e.preventDefault();
    $.post('include/create_incident.php', $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken), function(data) {
        $('#createIncidentMsg').html('<div class="alert alert-success">Incident created!</div>');
        $('#createIncidentForm')[0].reset();
        setTimeout(function() {
            $('#createIncidentModal').modal('hide');
            $('#createIncidentMsg').html('');
            loadIncidents();
        }, 1000);
    }).fail(function(xhr) {
        $('#createIncidentMsg').html('<div class="alert alert-danger">'+(xhr.responseText || 'Failed to create incident.')+'</div>');
    });
});

// --- Subscribe Form Submission ---
$('#subscribeForm').on('submit', function(e) {
    e.preventDefault();
    var form = $(this);
    var formData = form.serializeArray();
    // Manually collect all selected services
    var services = $('#subscribeService').val() || [];
    // Remove any existing 'service' fields
    formData = formData.filter(f => f.name !== 'service[]');
    // Add each selected service
    services.forEach(function(s) {
        formData.push({name: 'service[]', value: s});
    });
    formData.push({name: 'csrf_token', value: csrfToken});
    $.post('include/subscribe.php', $.param(formData), function(response) {
        $('#subscribeMsg').html('<div class="alert alert-success">' + response.message + '</div>');
        $('#subscribeForm')[0].reset();
    }, 'json').fail(function(xhr) {
        let msg = 'Failed to subscribe.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        $('#subscribeMsg').html('<div class="alert alert-danger">' + msg + '</div>');
    });
});

// --- Manage Subscription Form Submission ---
$('#manageSubForm').on('submit', function(e) {
    e.preventDefault();
    var data = $(this).serialize() + '&csrf_token=' + encodeURIComponent(csrfToken);
    $('#manageSubMsg').html('');
    $('#manageSubResults').html('');
    $.post('include/manage_subscribe.php', data, function(response) {
        // Hide or show buttons based on action
        const action = $('#manageAction').val();
        if (action === 'view') {
            $('#manageSubForm button[type="submit"]').hide();
            $('#manageSubForm button[data-bs-target="#subscribeModal"]').hide();
        } else {
            $('#manageSubForm button[type="submit"]').show();
            $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
        }

        if (response.status === 'success' && response.subscriptions) {
            let html = '<ul class="list-unstyled">';
            response.subscriptions.forEach(function(sub) {
                html += `
                <li class="d-flex align-items-center justify-content-between" style="background:#e2e3e5;border: 1px solid #888;border-radius:5px;padding-left:7px;margin-bottom:2px;margin-bottom:5px;">
                    <span>${sub}</span>
                    <button class="btn btn-sm btn-danger unsubscribe-service-btn" data-service="${encodeURIComponent(sub)}">Unsubscribe</button>
                </li>`;
            });
            html += '</ul>';
            $('#manageSubResults').html(html);
        }
        $('#manageSubMsg').html('<div class="alert alert-' + (response.status === 'success' ? 'success' : 'danger') + '">' + response.message + '</div>');
        if (response.status === 'success' && response.action === 'unsubscribe') {
            $('#manageSubResults').html('');
        }
    }, 'json').fail(function(xhr) {
        let msg = 'Failed to process request.';
        if (xhr.responseJSON && xhr.responseJSON.message) msg = xhr.responseJSON.message;
        $('#manageSubMsg').html('<div class="alert alert-danger">' + msg + '</div>');
    });
});

//Language selection change
$('#langSelect').on('change', function() {
    // Set cookie for language (so it persists)
    document.cookie = 'lang=' + this.value + ';path=/;max-age=31536000';
    // Reload page with lang param (preserve other params)
    const params = new URLSearchParams(window.location.search);
    params.set('lang', this.value);
    window.location.search = '?' + params.toString();
});

// Show/hide buttons when action changes
$('#manageAction').on('change', function() {
    if ($(this).val() === 'view') {
        $('#manageSubForm button[type="submit"]').hide();
        $('#manageSubForm button[data-bs-target="#subscribeModal"]').hide();
    } else {
        $('#manageSubForm button[type="submit"]').show();
        $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
    }
});

// On modal open, reset buttons to visible
$('#manageSubModal').on('show.bs.modal', function() {
    $('#manageSubForm button[type="submit"]').show();
    $('#manageSubForm button[data-bs-target="#subscribeModal"]').show();
});

// --- Auto-Refresh Logic ---
let refreshInterval = parseInt($('#refreshInterval').val(), 10) || 60000;
let incidentsTimer, statusTimer, rssTimer;

// Save refresh interval to localStorage when changed
function saveRefreshInterval(val) {
    localStorage.setItem('refreshInterval', val);
}

// Load refresh interval from localStorage if available
function loadRefreshInterval() {
    const saved = localStorage.getItem('refreshInterval');
    if (saved && !isNaN(saved)) {
        $('#refreshInterval').val(saved);
        refreshInterval = parseInt(saved, 10);
    }
}

function startAutoRefresh() {
    clearInterval(incidentsTimer);
    clearInterval(statusTimer);
    clearInterval(rssTimer);
    if ($('#refreshToggle').is(':checked')) {
        incidentsTimer = setInterval(loadIncidents, refreshInterval);
        statusTimer = setInterval(loadStatus, refreshInterval);
        rssTimer = setInterval(loadRSS, refreshInterval);
    }
}

// Update and save interval on change or Enter
$('#refreshInterval').on('change keyup', function(e) {
    if (e.type === 'change' || e.key === 'Enter') {
        refreshInterval = parseInt($(this).val(), 10) || 60000;
        saveRefreshInterval(refreshInterval);
        startAutoRefresh();
    }
});
$('#refreshToggle').on('change', function() {
    startAutoRefresh();
});

$(document).ready(function() {
    loadRefreshInterval();
    loadIncidents();
    loadStatus();
    loadRSS();
    startAutoRefresh();
<?php if (!empty($show_login_modal)): ?>
    $('#loginModal').modal('show');
<?php endif; ?>
});
    </script>
    <!-- Remove Incident Confirmation Modal -->
    <div class="modal fade" id="removeIncidentModal" tabindex="-1" aria-labelledby="removeIncidentModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius: 12px;">
          <div class="modal-header">
            <h5 class="modal-title" id="removeIncidentModalLabel">
              <i class="fa fa-trash text-danger"></i> Remove Incident
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            Are you sure you want to remove this incident?
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" id="confirmRemoveIncident" class="btn btn-danger">Remove</button>
          </div>
        </div>
      </div>
    </div>
    <?php if (!empty($show_login_modal)): ?>
    <script>
    $(function() {
        $('#loginModal').modal('show');
    });
    </script>
    <?php endif; ?>
</body>
</html>

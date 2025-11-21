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
// Auth required flag: default true, can be overridden by env variable
$auth_required = getenv('APP_AUTH_REQUIRED') !== false 
    ? filter_var(getenv('APP_AUTH_REQUIRED'), FILTER_VALIDATE_BOOLEAN) 
    : true;
// Use environment variables if set, otherwise JSON, otherwise default
$admin_user = getenv('APP_USERNAME') ?: ($json_data['auth']['username'] ?? 'admin');
$admin_pass = getenv('APP_PASSWORD') ?: ($json_data['auth']['password'] ?? 'changeme');


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
<body class="<?= $dark_mode === 'on' ? 'dark-mode' : '' ?>"
      data-csrf="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>"
    data-admin="<?= $is_admin ? 'true' : 'false' ?>"
    data-all-systems-operational="<?= $t['all_systems_operational'] ?>"
    data-issues-detected="<?= $t['issues_detected'] ?>"
    data-light-mode="<?= $t['light_mode'] ?>"
    data-dark-mode="<?= $t['dark_mode'] ?>"
>
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
                        <select id="subscribeService" name="service[]" class="form-select" multiple required size="10" style="min-height: 260px;"> <!-- size and min-height increased -->
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

<!-- RSS Feed Modal -->
<div class="modal fade" id="rssFeedModal" tabindex="-1" aria-labelledby="rssFeedModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content" style="border-radius: 12px;">
      <div class="modal-header">
        <h5 class="modal-title" id="rssFeedModalLabel">
          <i class="fa-solid fa-rss text-primary"></i> <span id="rssFeedModalTitle"></span>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?= $t['close'] ?>"></button>
      </div>
      <div class="modal-body" id="rssFeedModalBody" style="max-height:60vh;overflow-y:auto;">
        <!-- RSS feed content will be loaded here -->
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
    <script src="status-page.js"></script>
</body>
</html>

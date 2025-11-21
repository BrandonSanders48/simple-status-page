<?php
session_start();
$lang = $_GET['lang'] ?? ($_COOKIE['lang'] ?? 'en');
$lang_strings = [
    'en' => [
        'back' => 'Back',
        'config_usage' => 'Configuration & Usage Instructions',
        'general_info' => 'General Information',
        'business_name' => 'Business Name',
        'logo' => 'Logo',
        'footer_message' => 'Footer Message',
        'authentication' => 'Authentication',
        'admin_login' => 'Admin Login',
        'change_values' => 'Change these values to secure your status page.',
        'env_overrides' => 'Environment Variable Overrides',
        'app_auth_required' => 'APP_AUTH_REQUIRED (true/false): Require authentication for admin features.',
        'app_username' => 'APP_USERNAME: Override admin username.',
        'app_password' => 'APP_PASSWORD: Override admin password.',
        'smtp_user' => 'SMTP_USER: SMTP username (set only from environment variable).',
        'smtp_pass' => 'SMTP_PASS: SMTP password (set only from environment variable).',
        'email_settings' => 'Email Settings',
        'purpose' => 'Purpose',
        'subscription_notifications' => 'Used for subscription notifications.',
        'configuration' => 'Configuration',
        'from' => 'The sender address for outgoing emails.',
        'reply_to' => 'The reply-to address.',
        'smtp' => 'SMTP server details (host, port, username, password, secure).',
        'update_email' => 'Update these values to match your organization\'s email server.',
        'network_checks' => 'Network Checks',
        'lan' => 'Local Area Network (LAN)',
        'gateway' => 'The IP address of your network gateway (e.g., 192.168.1.1). The status page will ping this address to check LAN connectivity.',
        'domain' => 'Your internal domain name (optional, for display).',
        'wan' => 'Wide Area Network (WAN)',
        'public_dns' => 'A public DNS server (e.g., 8.8.8.8) to check internet connectivity.',
        'isp_map' => 'Map public IPs to ISP names for display.',
        'internal_hosts' => 'Internal Hosts Monitoring',
        'monitor_services' => 'Monitor internal or external services (servers, websites, etc.).',
        'each_entry' => 'Each entry in "internal_hosts" should include:',
        'host' => 'Hostname or IP to check.',
        'port' => 'Port number (use null for ICMP ping).',
        'type' => 'Service type (e.g., DNS, HTTPS, Ping).',
        'name' => 'Display name for the service.',
        'description' => 'Short description.',
        'example' => 'Example',
        'ping_note' => 'If "port" is null, the service will be checked with a ping (ICMP).',
        'rss_feeds' => 'RSS Feeds',
        'display_status' => 'Display status from third-party providers.',
        'each_rss' => 'Each entry in "RSS" should include:',
        'rss_host' => 'RSS feed URL.',
        'rss_name' => 'Provider name.',
        'rss_tag' => 'XML tag to parse (usually item or entry).',
        'rss_description' => 'Short description.',
        'refresh_rate' => 'Refresh Rate',
        'refresh_key' => 'Key: "refresh_rate"',
        'refresh_value' => 'Value: Time in milliseconds between automatic status checks (e.g., 30000 for 30 seconds).',
        'alerts' => 'Alerts: Sound & Browser Notifications',
        'alert_sound' => 'Alert Sound ("alert_sound"):',
        'alert_sound_desc' => 'true or false to enable/disable sound on service status change.',
        'browser_notify' => 'Browser Notifications ("browser_notify"):',
        'browser_notify_desc' => 'true or false to enable/disable browser notifications on service status change.',
        'how_it_works' => 'How it works:',
        'alert_explain' => 'When enabled, your browser will play a sound and/or show a notification if a monitored service goes up or down.',
        'test_notification' => 'Test Notification',
        'allow_notifications' => 'You may need to allow notifications in your browser when prompted.',
        'sound_note' => 'Note: Sound may only play after you interact with the page due to browser security.',
        'meta_info' => 'Meta Information',
        'versioning' => 'For versioning and documentation.',
        'fields' => 'Fields:',
        'version' => 'Config version.',
        'meta_description' => 'Description of the config.',
        'author' => 'Author or team.',
        'page_url' => 'URL of your status page.',
        'edit_config' => 'How to Edit Configuration',
        'login_admin' => 'Log in as admin.',
        'open_editor' => 'Click the gear icon to open the configuration editor.',
        'edit_json' => 'Edit the JSON as needed.',
        'save_refresh' => 'Save changes and refresh the page.',
        'tips' => 'Tips',
        'docker' => 'For Docker/Kubernetes:',
        'docker_tip' => 'Ensure the ping utility is installed in your container for ICMP checks.',
        'security' => 'Security:',
        'security_tip' => 'Change default admin credentials and SMTP passwords.',
        'testing' => 'Testing:',
        'testing_tip' => 'Use the "Test" services to verify your setup.',
        'hide_navbar' => 'Hide Navbar:',
        'hide_navbar_tip' => 'Add ?hide_navbar=1 to the URL to hide the navigation bar.',
        'example_url' => 'Example: index.php?hide_navbar=1',
        'customization' => 'For further customization, edit the configuration.json file directly or use the web editor as admin.',
    ],
    'es' => [
        'back' => 'Atrás',
        'config_usage' => 'Configuración e Instrucciones de Uso',
        'general_info' => 'Información General',
        'business_name' => 'Nombre de la Empresa',
        'logo' => 'Logo',
        'footer_message' => 'Mensaje de Pie de Página',
        'authentication' => 'Autenticación',
        'admin_login' => 'Inicio de Sesión de Administrador',
        'change_values' => 'Cambie estos valores para asegurar su página de estado.',
        'env_overrides' => 'Variables de Entorno',
        'app_auth_required' => 'APP_AUTH_REQUIRED (true/false): Requiere autenticación para funciones de administrador.',
        'app_username' => 'APP_USERNAME: Sobrescribe el usuario administrador.',
        'app_password' => 'APP_PASSWORD: Sobrescribe la contraseña de administrador.',
        'smtp_user' => 'SMTP_USER: Usuario SMTP (solo desde variable de entorno).',
        'smtp_pass' => 'SMTP_PASS: Contraseña SMTP (solo desde variable de entorno).',
        'email_settings' => 'Configuración de Correo',
        'purpose' => 'Propósito',
        'subscription_notifications' => 'Usado para notificaciones de suscripción.',
        'configuration' => 'Configuración',
        'from' => 'Dirección del remitente para correos salientes.',
        'reply_to' => 'Dirección de respuesta.',
        'smtp' => 'Detalles del servidor SMTP (host, puerto, usuario, contraseña, seguro).',
        'update_email' => 'Actualice estos valores para que coincidan con el servidor de correo de su organización.',
        'network_checks' => 'Verificaciones de Red',
        'lan' => 'Red de Área Local (LAN)',
        'gateway' => 'La IP de su gateway de red (ej: 192.168.1.1). La página hará ping a esta dirección para comprobar la conectividad LAN.',
        'domain' => 'Su dominio interno (opcional, solo para mostrar).',
        'wan' => 'Red de Área Amplia (WAN)',
        'public_dns' => 'Un DNS público (ej: 8.8.8.8) para comprobar la conectividad a Internet.',
        'isp_map' => 'Mapea IPs públicas a nombres de ISP para mostrar.',
        'internal_hosts' => 'Monitoreo de Hosts Internos',
        'monitor_services' => 'Monitorea servicios internos o externos (servidores, sitios web, etc.).',
        'each_entry' => 'Cada entrada en "internal_hosts" debe incluir:',
        'host' => 'Host o IP a comprobar.',
        'port' => 'Número de puerto (use null para ping ICMP).',
        'type' => 'Tipo de servicio (ej: DNS, HTTPS, Ping).',
        'name' => 'Nombre para mostrar del servicio.',
        'description' => 'Descripción corta.',
        'example' => 'Ejemplo',
        'ping_note' => 'Si "port" es null, el servicio se comprobará con ping (ICMP).',
        'rss_feeds' => 'Fuentes RSS',
        'display_status' => 'Muestra el estado de proveedores externos.',
        'each_rss' => 'Cada entrada en "RSS" debe incluir:',
        'rss_host' => 'URL de la fuente RSS.',
        'rss_name' => 'Nombre del proveedor.',
        'rss_tag' => 'Etiqueta XML a analizar (usualmente item o entry).',
        'rss_description' => 'Descripción corta.',
        'refresh_rate' => 'Frecuencia de Actualización',
        'refresh_key' => 'Clave: "refresh_rate"',
        'refresh_value' => 'Valor: Tiempo en milisegundos entre comprobaciones automáticas (ej: 30000 para 30 segundos).',
        'alerts' => 'Alertas: Sonido y Notificaciones del Navegador',
        'alert_sound' => 'Sonido de Alerta ("alert_sound"):',
        'alert_sound_desc' => 'true o false para activar/desactivar sonido en cambios de estado.',
        'browser_notify' => 'Notificaciones del Navegador ("browser_notify"):',
        'browser_notify_desc' => 'true o false para activar/desactivar notificaciones del navegador en cambios de estado.',
        'how_it_works' => 'Cómo funciona:',
        'alert_explain' => 'Si está habilitado, su navegador reproducirá un sonido y/o mostrará una notificación si un servicio monitoreado cambia de estado.',
        'test_notification' => 'Probar Notificación',
        'allow_notifications' => 'Puede que deba permitir notificaciones en su navegador cuando se le solicite.',
        'sound_note' => 'Nota: El sonido solo puede reproducirse después de interactuar con la página por seguridad del navegador.',
        'meta_info' => 'Información Meta',
        'versioning' => 'Para versionado y documentación.',
        'fields' => 'Campos:',
        'version' => 'Versión de la configuración.',
        'meta_description' => 'Descripción de la configuración.',
        'author' => 'Autor o equipo.',
        'page_url' => 'URL de su página de estado.',
        'edit_config' => 'Cómo Editar la Configuración',
        'login_admin' => 'Inicie sesión como administrador.',
        'open_editor' => 'Haga clic en el engranaje para abrir el editor de configuración.',
        'edit_json' => 'Edite el JSON según sea necesario.',
        'save_refresh' => 'Guarde los cambios y recargue la página.',
        'tips' => 'Consejos',
        'docker' => 'Para Docker/Kubernetes:',
        'docker_tip' => 'Asegúrese de que el comando ping esté instalado en su contenedor para comprobaciones ICMP.',
        'security' => 'Seguridad:',
        'security_tip' => 'Cambie las credenciales de administrador y contraseñas SMTP predeterminadas.',
        'testing' => 'Pruebas:',
        'testing_tip' => 'Use los servicios "Test" para verificar su configuración.',
        'hide_navbar' => 'Ocultar Barra de Navegación:',
        'hide_navbar_tip' => 'Agregue ?hide_navbar=1 a la URL para ocultar la barra de navegación.',
        'example_url' => 'Ejemplo: index.php?hide_navbar=1',
        'customization' => 'Para más personalización, edite el archivo configuration.json directamente o use el editor web como administrador.',
    ]
];
$t = $lang_strings[$lang] ?? $lang_strings['en'];
?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($lang) ?>">
<head>
    <meta charset="UTF-8">
    <title>Simple Status Page – <?= $t['config_usage'] ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="images/favicon.ico">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" rel="stylesheet">
    <meta charset="UTF-8">
    <style>
body {
    background: #f8f9fa;
    font-family: 'Roboto', Arial, sans-serif;
}
.tip {
    background: #e9f7ef;
    border-left: 5px solid #28a745;
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    margin-top: 2rem;
    font-size: 1.1em;
}
.section-card {
    border-radius: 1rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    height: 100%;
    display: flex;
    flex-direction: column;
}
.section-card .card-header {
    background: #212529;
    color: #fff;
    border-radius: 1rem 1rem 0 0;
    font-size: 1.15em;
    font-weight: 500;
}
.section-card .card-body {
    background: #fff;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}
pre {
    background: #f1f3f5;
    border-radius: 0.5rem;
    padding: 1rem;
}
/* Make columns flex so cards in the same row match height */
.row.g-4 > [class^="col-"] {
    display: flex;
    flex-direction: column;
}
@media (max-width: 991.98px) {
    .row.g-4 > [class^="col-"] {
        display: block;
    }
    .section-card {
        height: auto;
    }
}
@media (max-width: 576px) {
    .section-card {
        margin-bottom: 1rem;
    }
}
    </style>
    <script>
    // Browser Notification Help
    document.addEventListener('DOMContentLoaded', function() {
        // Only show the demo button if browser supports notifications
        if ("Notification" in window) {
            const btn = document.getElementById('test-notify-btn');
            if (btn) {
                btn.style.display = '';
                btn.onclick = function() {
                    if (Notification.permission === "default") {
                        Notification.requestPermission().then(function(permission) {
                            if (permission === "granted") {
                                new Notification("Test Notification", {
                                    body: "Browser notifications are enabled and working!",
                                    icon: "images/favicon.ico"
                                });
                            }
                        });
                    } else if (Notification.permission === "granted") {
                        new Notification("Test Notification", {
                            body: "Browser notifications are enabled and working!",
                            icon: "images/favicon.ico"
                        });
                    } else {
                        alert("Notifications are blocked in your browser.");
                    }
                };
            }
        }
    });
    </script>
</head>
<body>
  <div class="container py-4">
    <div class="mb-3">
      <a href="index.php" class="btn btn-outline-secondary">
        <i class="fa fa-arrow-left me-1"></i> <?= $t['back'] ?>
      </a>
    </div>
    <div class="mb-4 text-center">
      <h1 class="display-5 fw-bold mb-2"><span class="text-success"><i class="fa-solid fa-circle-check"></i></span> simple-status-page</h1>
      <p class="lead"><?= $t['config_usage'] ?></p>
      <hr>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-info-circle me-2"></i>1. <?= $t['general_info'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['business_name'] ?>:</b><br>
                <?= $t['business_name'] ?> (<code>"business_name"</code>), <?= $t['logo'] ?> (<code>"business_logo"</code>), <?= $t['footer_message'] ?> (<code>"footer_message"</code>)
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-user-shield me-2"></i>2. <?= $t['authentication'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['admin_login'] ?>:</b><br>
                <span class="badge bg-warning text-dark mt-2"><?= $t['change_values'] ?></span>
              </li>
              <li class="list-group-item">
                <b><?= $t['env_overrides'] ?></b><br>
                <ul>
                  <li><code><?= $t['app_auth_required'] ?></code></li>
                  <li><code><?= $t['app_username'] ?></code></li>
                  <li><code><?= $t['app_password'] ?></code></li>
                  <li><code><?= $t['smtp_user'] ?></code></li>
                  <li><code><?= $t['smtp_pass'] ?></code></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-envelope me-2"></i>3. <?= $t['email_settings'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['purpose'] ?>:</b><br>
                <?= $t['subscription_notifications'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['configuration'] ?>:</b>
                <ul>
                  <li><code>"from"</code>: <?= $t['from'] ?></li>
                  <li><code>"reply_to"</code>: <?= $t['reply_to'] ?></li>
                  <li><code>"smtp"</code>: <?= $t['smtp'] ?></li>
                </ul>
                <span class="badge bg-info text-dark mt-2"><?= $t['update_email'] ?></span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-network-wired me-2"></i>4. <?= $t['network_checks'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['lan'] ?>:</b>
                <ul>
                  <li><code>"gateway"</code>: <?= $t['gateway'] ?></li>
                  <li><code>"domain"</code>: <?= $t['domain'] ?></li>
                </ul>
              </li>
              <li class="list-group-item"><b><?= $t['wan'] ?>:</b>
                <ul>
                  <li><code>"public_dns"</code>: <?= $t['public_dns'] ?></li>
                  <li><code>"isp_map"</code>: <?= $t['isp_map'] ?></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-server me-2"></i>5. <?= $t['internal_hosts'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['purpose'] ?>:</b><br>
                <?= $t['monitor_services'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['configuration'] ?>:</b><br>
                <?= $t['each_entry'] ?>
                <ul>
                  <li><code>"host"</code>: <?= $t['host'] ?></li>
                  <li><code>"port"</code>: <?= $t['port'] ?></li>
                  <li><code>"type"</code>: <?= $t['type'] ?></li>
                  <li><code>"name"</code>: <?= $t['name'] ?></li>
                  <li><code>"description"</code>: <?= $t['description'] ?></li>
                </ul>
                <div class="mt-2"><b><?= $t['example'] ?>:</b></div>
                <pre><code>{
  "host": "8.8.8.8",
  "port": null,
  "type": "Ping",
  "name": "DR Site",
  "description": "Disaster Recovery Site ping test."
}</code></pre>
                <?= $t['ping_note'] ?>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-rss me-2"></i>6. <?= $t['rss_feeds'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['purpose'] ?>:</b><br>
                <?= $t['display_status'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['configuration'] ?>:</b><br>
                <?= $t['each_rss'] ?>
                <ul>
                  <li><code>"host"</code>: <?= $t['rss_host'] ?></li>
                  <li><code>"name"</code>: <?= $t['rss_name'] ?></li>
                  <li><code>"tag"</code>: <?= $t['rss_tag'] ?></li>
                  <li><code>"description"</code>: <?= $t['rss_description'] ?></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-clock-rotate-left me-2"></i>7. <?= $t['refresh_rate'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['refresh_key'] ?></b></li>
              <li class="list-group-item"><b><?= $t['refresh_value'] ?></b></li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-bell me-2"></i>8. <?= $t['alerts'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item">
                <b><?= $t['alert_sound'] ?></b><br>
                <?= $t['alert_sound_desc'] ?>
              </li>
              <li class="list-group-item">
                <b><?= $t['browser_notify'] ?></b><br>
                <?= $t['browser_notify_desc'] ?>
              </li>
              <li class="list-group-item">
                <b><?= $t['how_it_works'] ?></b><br>
                <?= $t['alert_explain'] ?><br>
                <button id="test-notify-btn" class="btn btn-info btn-sm mt-2" style="display:none;">
                  <i class="fa fa-bell"></i> <?= $t['test_notification'] ?>
                </button>
                <div class="form-text mt-2">
                  <?= $t['allow_notifications'] ?><br>
                  <b><?= $t['sound_note'] ?></b>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12 col-lg-6">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-file-lines me-2"></i>9. <?= $t['meta_info'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['purpose'] ?>:</b><br>
                <?= $t['versioning'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['fields'] ?></b>
                <ul>
                  <li><code>"version"</code>: <?= $t['version'] ?></li>
                  <li><code>"description"</code>: <?= $t['meta_description'] ?></li>
                  <li><code>"author"</code>: <?= $t['author'] ?></li>
                  <li><code>"page_url"</code>: <?= $t['page_url'] ?></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-pen-to-square me-2"></i>10. <?= $t['edit_config'] ?></div>
          <div class="card-body">
            <ol class="list-group list-group-numbered">
              <li class="list-group-item"><?= $t['login_admin'] ?></li>
              <li class="list-group-item"><?= $t['open_editor'] ?></li>
              <li class="list-group-item"><?= $t['edit_json'] ?></li>
              <li class="list-group-item"><?= $t['save_refresh'] ?></li>
            </ol>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card section-card">
          <div class="card-header"><i class="fa-solid fa-lightbulb me-2"></i>11. <?= $t['tips'] ?></div>
          <div class="card-body">
            <ul class="list-group list-group-flush">
              <li class="list-group-item"><b><?= $t['docker'] ?></b><br>
                <?= $t['docker_tip'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['security'] ?></b><br>
                <?= $t['security_tip'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['testing'] ?></b><br>
                <?= $t['testing_tip'] ?>
              </li>
              <li class="list-group-item"><b><?= $t['hide_navbar'] ?></b><br>
                <?= $t['hide_navbar_tip'] ?> <br>
                <code><?= $t['example_url'] ?></code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="tip mt-4">
      <i class="fa-solid fa-wrench me-2"></i>
      <?= $t['customization'] ?>
    </div>
  </div>
</body>
</html>
<?php
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);

$network = $json_data['network'] ?? [];
$gateway = $network['gateway'] ?? '';
$public_dns = $network['public_dns'] ?? '';
$domain = $network['domain'] ?? '';
$isp_map = $network['isp_map'] ?? [];
$internal_hosts = $json_data['internal_hosts'] ?? [];

// --- Language Support ---
$supported_langs = ['en', 'es'];
$lang = $_GET['lang'] ?? ($_COOKIE['lang'] ?? 'en');
if (!in_array($lang, $supported_langs)) $lang = 'en';

$lang_strings = [
    'en' => [
        'failure' => 'Failure',
        'unknown_isp' => 'Unknown ISP',
        'operational' => 'Operational',
        'ip_unavailable' => 'IP Unavailable'
    ],
    'es' => [
        'failure' => 'Fallo',
        'unknown_isp' => 'ISP desconocido',
        'operational' => 'Operativo',
        'ip_unavailable' => 'IP no disponible'
    ]
];
$t = $lang_strings[$lang];

// Helper: Check TCP port or HTTP
function check_service($host, $port = 80) {
    $connection = @fsockopen($host, $port, $errno, $errstr, 2);
    if (is_resource($connection)) {
        fclose($connection);
        return true;
    }
    return false;
}

// Get public IP
function get_public_ip() {
    $ip = @file_get_contents('https://api.ipify.org');
    if ($ip && filter_var($ip, FILTER_VALIDATE_IP)) {
        return $ip;
    }
    return '';
}

$public_ip = get_public_ip();

// Wide-Area Network check
$isp_name = '';
$isp_found = false;
if (!empty($isp_map) && is_array($isp_map)) {
    foreach ($isp_map as $ip => $name) {
        if ($public_ip === $ip) {
            $isp_name = $name;
            $isp_found = true;
            break;
        }
    }
}
$wide_result = check_service($public_dns, 53); // DNS port check
$wide_text = $public_ip
    ? ($isp_found ? "$isp_name ($public_ip)" : "{$t['unknown_isp']} ($public_ip)") . ": " . ($wide_result ? $t['operational'] : $t['failure'])
    : $t['ip_unavailable'];
$wide_color = $wide_result ? "green" : "red";

// Local-Area Network check
$local_result = check_service($gateway, 80); // HTTP port check on gateway
$local_text = $local_result ? $t['operational'] : $t['failure'];
$local_color = $local_result ? "green" : "red";

// Services
$services = [];
$errors = 0;
foreach ($internal_hosts as $value) {
    $host = $value['host'] ?? '';
    $port = !empty($value['port']) ? (int)$value['port'] : 80;
    $ok = check_service($host, $port);
    $status = $ok
        ? '<i style="font-size:30px;color:green" class="fa-solid fa-square-check"></i>'
        : '<i style="font-size:30px;color:red" class="fa-solid fa-square-xmark"></i>';
    if (!$ok) $errors++;
    $services[] = [
        'status_icon' => $status,
        'title' => $value['name'] ?? $host,
        'type' => htmlspecialchars($value['type'] ?? ''),
        'desc' => !empty($value['description']) ? htmlspecialchars($value['description']) : ''
    ];
}

// Output JSON
echo json_encode([
    'wide_text' => $wide_text,
    'wide_color' => $wide_color,
    'local_text' => $local_text,
    'local_color' => $local_color,
    'services' => $services,
    'errors' => $errors
]);

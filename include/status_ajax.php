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

// Helper: Check TCP port, HTTP, or ICMP ping if port is null
function check_service($host, $port = 80) {
    if ($port === null) {
        // ICMP ping (cross-platform: Linux, Windows, K8s containers)
        $host = escapeshellarg($host);
        if (stripos(PHP_OS, 'WIN') === 0) {
            // Windows: -n 1 (one ping), -w 2000 (timeout ms)
            $cmd = "ping -n 1 -w 2000 $host";
        } else {
            // Linux/K8s: -c 1 (one ping), -W 2 (timeout sec)
            $cmd = "ping -c 1 -W 2 $host";
        }
        exec($cmd, $output, $result);
        return $result === 0;
    } else {
        $connection = @fsockopen($host, $port, $errno, $errstr, 2);
        if (is_resource($connection)) {
            fclose($connection);
            return true;
        }
        return false;
    }
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

// Local-Area Network check
$local_result = check_service($gateway, null); // ICMP ping check on gateway

// Set text and color for local and wide area network independently
$local_text = $local_result ? $t['operational'] : $t['failure'];
$local_color = $local_result ? "green" : "red";
$wide_text = ($public_ip
    ? ($isp_found ? "$isp_name ($public_ip)" : "{$t['unknown_isp']} ($public_ip)")
    : $t['ip_unavailable']) . ": " . ($wide_result ? $t['operational'] : $t['failure']);
$wide_color = $wide_result ? "green" : "red";

// Services
$services = [];
$errors = 0;
foreach ($internal_hosts as $value) {
    $host = $value['host'] ?? '';
    $port = array_key_exists('port', $value) ? (is_null($value['port']) ? null : (int)$value['port']) : 80;
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

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

// Helper: Check port
function check_port($host, $port, $domain = '') {
    $fqdn = $domain ? $host . '.' . $domain : $host;
    $connection = @fsockopen($fqdn, $port, $errno, $errstr, 2);
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

// Wide-Area Network
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
exec("ping -n 1 " . escapeshellarg($public_dns), $output, $result);

if ($public_ip) {
    if ($isp_found) {
        $wide_text = $isp_name . " ($public_ip): " . ($result === 0 ? "Operational" : "Failure");
    } else {
        $wide_text = "Unknown ISP ($public_ip): " . ($result === 0 ? "Operational" : "Failure");
    }
} else {
    $wide_text = "IP Unavailable: " . ($result === 0 ? "Operational" : "Failure");
}
$wide_color = $result === 0 ? "green" : "red";

// Local-Area Network
exec("ping -n 1 " . escapeshellarg($gateway), $output, $result);
$local_text = $result === 0 ? "Operational" : "Failure";
$local_color = $result === 0 ? "green" : "red";

// Services
$services = [];
$errors = 0;
foreach ($internal_hosts as $value) {
    $status = '';
    $ok = false;
    if (!empty($value['port'])) {
        $ok = check_port($value['host'], (int)$value['port'], $domain);
    } else {
        exec("ping -n 2 " . escapeshellarg($value['host']), $output, $result);
        $ok = $result === 0;
    }
    $status = $ok
        ? '<i style="font-size:30px;color:green" class="fa-solid fa-square-check"></i>'
        : '<i style="font-size:30px;color:red" class="fa-solid fa-square-xmark"></i>';
    if (!$ok) $errors++;
    $services[] = [
        'status_icon' => $status,
        'title' => !empty($value['name']) ? $value['name'] : $value['host'],
        'type' => htmlspecialchars($value['type'] ?? ''),
        'desc' => !empty($value['description']) ? htmlspecialchars($value['description']) : ''
    ];
}

echo json_encode([
    'wide_text' => $wide_text,
    'wide_color' => $wide_color,
    'local_text' => $local_text,
    'local_color' => $local_color,
    'services' => $services,
    'errors' => $errors
]);
<?php
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);

// --- Language Support ---
$supported_langs = ['en', 'es'];
$lang = $_GET['lang'] ?? ($_COOKIE['lang'] ?? 'en');
if (!in_array($lang, $supported_langs)) $lang = 'en';

// --- Cache (30 seconds, per language) ---
$cacheFile = sys_get_temp_dir() . '/status_cache_v3_' . $lang . '.json';
$cacheTTL = 30;
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    echo file_get_contents($cacheFile);
    exit;
}

$network = $json_data['network'] ?? [];
$gateway = $network['gateway'] ?? '';
$public_dns = $network['public_dns'] ?? '';
$isp_map = $network['isp_map'] ?? [];
$internal_hosts = $json_data['internal_hosts'] ?? [];

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

// Helper: Check TCP port (non-blocking connect via curl for parallelism),
// or ICMP ping if port is null.
function check_service($host, $port = 80) {
    if ($port === null) {
        $escaped = escapeshellarg($host);
        if (stripos(PHP_OS, 'WIN') === 0) {
            $cmd = "ping -n 1 -w 2000 $escaped";
        } else {
            $cmd = "ping -c 1 -W 2 $escaped";
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

// Parallel TCP checks via curl_multi; falls back to sequential fsockopen for pings.
function check_services_parallel(array $hosts): array {
    $tcp = [];
    $ping = [];
    foreach ($hosts as $i => $value) {
        $port = array_key_exists('port', $value) ? (is_null($value['port']) ? null : (int)$value['port']) : 80;
        if ($port === null) {
            $ping[$i] = $value;
        } else {
            $tcp[$i] = ['host' => $value['host'] ?? '', 'port' => $port];
        }
    }

    // Run TCP checks in parallel with curl_multi
    $results = [];
    if (!empty($tcp) && function_exists('curl_multi_init')) {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($tcp as $i => $info) {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => 'tcp://' . $info['host'] . ':' . $info['port'],
                CURLOPT_CONNECT_ONLY   => true,
                CURLOPT_TIMEOUT        => 2,
                CURLOPT_CONNECTTIMEOUT => 2,
                CURLOPT_RETURNTRANSFER => true,
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[$i] = $ch;
        }
        $running = null;
        do {
            curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 0.1);
        } while ($running > 0);
        foreach ($handles as $i => $ch) {
            $results[$i] = (curl_errno($ch) === 0);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    } else {
        // fallback: sequential
        foreach ($tcp as $i => $info) {
            $results[$i] = check_service($info['host'], $info['port']);
        }
    }

    // Sequential ping checks (exec is inherently sequential)
    foreach ($ping as $i => $value) {
        $results[$i] = check_service($value['host'] ?? '', null);
    }

    return $results;
}

// Get public IP
function get_public_ip() {
    $ctx = stream_context_create(['http' => ['timeout' => 3]]);
    $ip = @file_get_contents('https://api.ipify.org', false, $ctx);
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
$wide_result = check_service($public_dns, 53);
$local_result = check_service($gateway, null);

$local_text = $local_result ? $t['operational'] : $t['failure'];
$local_color = $local_result ? "#10b981" : "#ef4444";
$wide_text = ($public_ip
    ? ($isp_found ? "$isp_name ($public_ip)" : "{$t['unknown_isp']} ($public_ip)")
    : $t['ip_unavailable']) . ": " . ($wide_result ? $t['operational'] : $t['failure']);
$wide_color  = $wide_result  ? "#10b981" : "#ef4444";

// Services — parallel TCP checks
$service_results = check_services_parallel($internal_hosts);
$services = [];
$errors = 0;
foreach ($internal_hosts as $i => $value) {
    $ok = $service_results[$i] ?? false;
    $status = $ok
        ? '<i style="font-size:28px;color:#10b981" class="fa-solid fa-circle-check"></i>'
        : '<i style="font-size:28px;color:#ef4444" class="fa-solid fa-circle-xmark"></i>';
    if (!$ok) $errors++;
    $services[] = [
        'status_icon' => $status,
        'title'       => $value['name'] ?? ($value['host'] ?? ''),
        'type'        => htmlspecialchars($value['type'] ?? ''),
        'desc'        => !empty($value['description']) ? htmlspecialchars($value['description']) : '',
        'host'        => htmlspecialchars($value['host'] ?? ''),
        'port'        => $port === null ? 'ping' : (string)$port,
    ];
}

$output = json_encode([
    'wide_text'   => $wide_text,
    'wide_color'  => $wide_color,
    'wide_ok'     => $wide_result,
    'local_text'  => $local_text,
    'local_color' => $local_color,
    'local_ok'    => $local_result,
    'services'    => $services,
    'errors'      => $errors
]);

file_put_contents($cacheFile, $output);
echo $output;

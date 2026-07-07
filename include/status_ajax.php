<?php
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);

// --- Cache (30 seconds) ---
$cacheFile = sys_get_temp_dir() . '/status_cache_v4.json';
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

// Load downtime history written by the cron checker
$_histFile = __DIR__ . '/cron/service_status.json';
$_histRaw  = file_exists($_histFile) ? json_decode(file_get_contents($_histFile), true) : [];
$serviceHistory = [];
if (is_array($_histRaw)) {
    foreach ($_histRaw as $k => $v) {
        $serviceHistory[$k] = is_array($v) ? $v : ['status' => $v];
    }
}


// A service is "HTTP checked" (real request + status code) rather than just a raw
// TCP handshake when its configured type mentions http/https: a webserver/proxy
// can keep accepting TCP connections while the application behind it is erroring out,
// so a plain port-open check would falsely report it as up.
function is_http_type($value) {
    return isset($value['type']) && stripos($value['type'], 'http') !== false;
}

function http_scheme_for($value, $port) {
    if (isset($value['type']) && stripos($value['type'], 'https') !== false) return 'https';
    if ((int)$port === 443) return 'https';
    return 'http';
}

// Helper: Check TCP port (non-blocking connect via curl for parallelism),
// ICMP ping if port is null, or a real HTTP request if $isHttp is true.
function check_service($host, $port = 80, $isHttp = false, $scheme = 'http') {
    if ($port === null) {
        $escaped = escapeshellarg($host);
        if (stripos(PHP_OS, 'WIN') === 0) {
            $cmd = "ping -n 1 -w 2000 $escaped";
        } else {
            $cmd = "ping -c 1 -W 2 $escaped";
        }
        exec($cmd, $output, $result);
        return $result === 0;
    } elseif ($isHttp) {
        return check_http($host, $port, $scheme);
    } else {
        $connection = @fsockopen($host, $port, $errno, $errstr, 2);
        if (is_resource($connection)) {
            fclose($connection);
            return true;
        }
        return false;
    }
}

// Real HTTP(S) health check: a service only counts as up if it actually returns a
// non-5xx response, not merely if the TCP port accepts a connection.
function check_http($host, $port, $scheme = 'http') {
    if (!function_exists('curl_init')) return false;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $scheme . '://' . $host . ':' . $port . '/',
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_NOBODY         => false,
    ]);
    curl_exec($ch);
    $errno = curl_errno($ch);
    $code  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $errno === 0 && $code > 0 && $code < 500;
}

// Parallel checks via curl_multi (raw TCP connect or real HTTP request); falls back
// to sequential checks for pings and when curl_multi is unavailable.
function check_services_parallel(array $hosts): array {
    $tcp = [];
    $http = [];
    $ping = [];
    foreach ($hosts as $i => $value) {
        $port = array_key_exists('port', $value) ? (is_null($value['port']) ? null : (int)$value['port']) : 80;
        if ($port === null) {
            $ping[$i] = $value;
        } elseif (is_http_type($value)) {
            $http[$i] = ['host' => $value['host'] ?? '', 'port' => $port, 'scheme' => http_scheme_for($value, $port)];
        } else {
            $tcp[$i] = ['host' => $value['host'] ?? '', 'port' => $port];
        }
    }

    $results = [];
    if ((!empty($tcp) || !empty($http)) && function_exists('curl_multi_init')) {
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
            $handles[$i] = ['ch' => $ch, 'http' => false];
        }
        foreach ($http as $i => $info) {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $info['scheme'] . '://' . $info['host'] . ':' . $info['port'] . '/',
                CURLOPT_TIMEOUT        => 4,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_RETURNTRANSFER => true,
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[$i] = ['ch' => $ch, 'http' => true];
        }
        $running = null;
        do {
            curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 0.1);
        } while ($running > 0);
        foreach ($handles as $i => $h) {
            $ch = $h['ch'];
            if ($h['http']) {
                $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $results[$i] = curl_errno($ch) === 0 && $code > 0 && $code < 500;
            } else {
                $results[$i] = (curl_errno($ch) === 0);
            }
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    } else {
        // fallback: sequential
        foreach ($tcp as $i => $info) {
            $results[$i] = check_service($info['host'], $info['port']);
        }
        foreach ($http as $i => $info) {
            $results[$i] = check_http($info['host'], $info['port'], $info['scheme']);
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
$local_result = !empty($gateway)    ? check_service($gateway, null)  : null;
$wide_result  = !empty($public_dns) ? check_service($public_dns, 53) : null;

$local_text  = $local_result === null ? 'Not configured' : ($local_result ? 'Operational' : 'Failure');
$local_color = $local_result === null ? '#94a3b8' : ($local_result ? '#10b981' : '#ef4444');
$wide_text   = $wide_result === null
    ? 'Not configured'
    : (($public_ip
        ? ($isp_found ? "$isp_name ($public_ip)" : "Unknown ISP ($public_ip)")
        : 'IP Unavailable') . ': ' . ($wide_result ? 'Operational' : 'Failure'));
$wide_color  = $wide_result === null ? '#94a3b8' : ($wide_result ? '#10b981' : '#ef4444');

// Services, parallel TCP checks
$service_results = check_services_parallel($internal_hosts);
$services = [];
$errors = 0;
$updatedHistory = $serviceHistory;
foreach ($internal_hosts as $i => $value) {
    $ok      = $service_results[$i] ?? false;
    $svcPort = array_key_exists('port', $value) ? (is_null($value['port']) ? null : (int)$value['port']) : 80;
    $name    = $value['name'] ?? ($value['host'] ?? '');
    $curStr  = $ok ? 'up' : 'down';

    $prev    = $serviceHistory[$name] ?? ['status' => null, 'last_down_at' => null, 'last_down_duration_s' => null, 'went_down_at' => null];
    $prevStr = $prev['status'] ?? null;

    $hist = [
        'status'               => $curStr,
        'last_down_at'         => $prev['last_down_at']         ?? null,
        'last_down_duration_s' => $prev['last_down_duration_s'] ?? null,
        'went_down_at'         => $prev['went_down_at']         ?? null,
    ];

    if ($curStr === 'down' && $prevStr !== 'down') {
        $hist['went_down_at'] = time();
        $hist['last_down_at'] = time();
    } elseif ($curStr === 'up' && $prevStr === 'down' && !empty($prev['went_down_at'])) {
        $hist['last_down_duration_s'] = time() - (int)$prev['went_down_at'];
        $hist['went_down_at']         = null;
        // Append to outage log
        $_logFile = __DIR__ . '/cron/outage_log.json';
        $_log = file_exists($_logFile) ? json_decode(file_get_contents($_logFile), true) : [];
        if (!is_array($_log)) $_log = [];
        array_unshift($_log, [
            'service'      => $name,
            'went_down_at' => (int)$prev['went_down_at'],
            'came_up_at'   => time(),
            'duration_s'   => $hist['last_down_duration_s'],
        ]);
        if (count($_log) > 200) $_log = array_slice($_log, 0, 200);
        @file_put_contents($_logFile, json_encode($_log, JSON_PRETTY_PRINT));
    }

    $updatedHistory[$name] = $hist;

    $status = $ok
        ? '<i style="font-size:28px;color:#10b981" class="fa-solid fa-circle-check"></i>'
        : '<i style="font-size:28px;color:#ef4444" class="fa-solid fa-circle-xmark"></i>';
    if (!$ok) $errors++;
    $visible = $value['visible'] ?? true;
    if ($visible) {
        $services[] = [
            'status_icon'          => $status,
            'title'                => $name,
            'type'                 => htmlspecialchars($value['type'] ?? ''),
            'desc'                 => !empty($value['description']) ? htmlspecialchars($value['description']) : '',
            'host'                 => htmlspecialchars($value['host'] ?? ''),
            'port'                 => $svcPort === null ? 'ping' : (string)$svcPort,
            'last_down_at'         => $hist['last_down_at'],
            'last_down_duration_s' => $hist['last_down_duration_s'],
            'went_down_at'         => $hist['went_down_at'],
        ];
    }
}

// Persist downtime history so tooltip data survives across cache refreshes
@file_put_contents($_histFile, json_encode($updatedHistory, JSON_PRETTY_PRINT));

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

<?php
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);
$rss_feeds = $json_data['RSS'] ?? [];

// --- Cache (5 minutes, keyed by feed config so additions/removals invalidate immediately) ---
$cacheKey  = md5(json_encode($rss_feeds));
$cacheFile = sys_get_temp_dir() . '/rss_cache_' . $cacheKey . '.json';
$cacheTTL  = 300;
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
    echo file_get_contents($cacheFile);
    exit;
}

// Fetch all RSS feeds in parallel via curl_multi
function fetchAllRSS(array $feeds): array {
    if (empty($feeds)) return [];

    $results = array_fill(0, count($feeds), '');

    if (!function_exists('curl_multi_init')) {
        // fallback: sequential
        $ctx = stream_context_create(['http' => ['timeout' => 5]]);
        foreach ($feeds as $i => $x) {
            $results[$i] = @file_get_contents($x['host'], false, $ctx) ?: '';
        }
        return $results;
    }

    $mh = curl_multi_init();
    $handles = [];
    foreach ($feeds as $i => $x) {
        $ch = curl_init($x['host']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT      => 'StatusPage/1.0',
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
        $results[$i] = curl_multi_getcontent($ch) ?: '';
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    return $results;
}

function parseRSSItem(string $xmlString, string $tag): string {
    if (!$xmlString) return '';
    $rss = @simplexml_load_string($xmlString, null, LIBXML_NOERROR);
    if (!$rss) return '';
    if ($tag === "item" && isset($rss->channel->item)) {
        foreach ($rss->channel->item as $item) {
            return (string)$item->title;
        }
    } elseif ($tag === "entry" && isset($rss->entry)) {
        foreach ($rss->entry as $entry) {
            return (string)$entry->title;
        }
    }
    return '';
}

$rawFeeds = fetchAllRSS($rss_feeds);

$result = [];
foreach ($rss_feeds as $i => $x) {
    $item = parseRSSItem($rawFeeds[$i] ?? '', $x['tag'] ?? 'item');
    $result[] = [
        'name' => $x['name'] ?? '',
        'item' => $item ?: 'No notices',
        'desc' => !empty($x['description']) ? $x['description'] : '',
        'link' => $x['host'] ?? '',
    ];
}

$output = json_encode($result);
file_put_contents($cacheFile, $output);
echo $output;

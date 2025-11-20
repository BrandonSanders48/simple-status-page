<?php
header('Content-Type: application/json');

$configPath = __DIR__ . '/configuration.json';
$json = @file_get_contents($configPath);
$json_data = json_decode($json, true);
$rss_feeds = $json_data['RSS'] ?? [];

// Helper: Get first item title from RSS/Atom
function getRSSItem($url, $tag) {
    $rss = @simplexml_load_file($url);
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

$result = [];
foreach ($rss_feeds as $x) {
    $item = getRSSItem($x['host'], $x['tag'] ?? 'item');
    $desc = !empty($x['description']) ? $x['description'] : '';
    $result[] = [
        'name' => $x['name'] ?? '',
        'item' => $item ?: 'No notices',
        'desc' => $desc
    ];
}

echo json_encode($result);
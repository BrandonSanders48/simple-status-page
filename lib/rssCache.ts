import Parser from "rss-parser";
import { db } from "./db/client";
import { rssFeeds } from "./db/schema";
import { asc } from "drizzle-orm";

export interface RssCardPayload {
  name: string;
  item: string;
  desc: string | null;
  link: string;
}

const TTL_MS = 5 * 60 * 1000;
let cache: { data: RssCardPayload[]; expiresAt: number } | null = null;
let inflight: Promise<RssCardPayload[]> | null = null;

const parser = new Parser({ timeout: 5000 });

async function fetchOne(host: string): Promise<string> {
  try {
    const feed = await parser.parseURL(host);
    return feed.items?.[0]?.title?.trim() || "No notices";
  } catch {
    return "No notices";
  }
}

async function computeRss(): Promise<RssCardPayload[]> {
  const feeds = db.select().from(rssFeeds).orderBy(asc(rssFeeds.sortOrder)).all();
  const items = await Promise.all(feeds.map((f) => fetchOne(f.host)));
  return feeds.map((f, i) => ({
    name: f.name,
    item: items[i] ?? "No notices",
    desc: f.description,
    link: f.host,
  }));
}

/** Cached (5 min) RSS snapshot, with in-flight de-dupe like the status cache. */
export async function getRss(): Promise<RssCardPayload[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (inflight) return inflight;

  inflight = computeRss()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateRssCache(): void {
  cache = null;
}

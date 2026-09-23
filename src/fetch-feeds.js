import Parser from "rss-parser";

import { mapPool } from "./pool.js";

const TIMEOUT_MS = 10_000;
const RETRIES = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; jev_news/0.1; +https://github.com/dezigozi/jev_news)";

// Google ニュースの <source>（媒体名）を拾う
const parser = new Parser({ customFields: { item: ["source"] } });

export async function fetchText(url, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = TIMEOUT_MS,
  retries = RETRIES
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error?.name === "TimeoutError" ? new Error(`${timeoutMs}ms 以内に応答なし`) : error;
    }
  }
  throw lastError;
}

function sourceName(source) {
  if (!source) return "";
  if (typeof source === "string") return source.trim();
  return String(source._ ?? "").trim();
}

// Google ニュースの見出しは「見出し - 媒体名」。媒体名が分かっているときだけ末尾を外す
export function stripSourceSuffix(title, source) {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

export async function parseFeed(xml, feed) {
  const parsed = await parser.parseString(xml);
  const items = [];
  for (const item of parsed.items ?? []) {
    const rawTitle = String(item.title ?? "").replace(/\s+/g, " ").trim();
    const link = String(item.link ?? "").trim();
    if (!rawTitle || !/^https?:\/\//.test(link)) continue;
    const source = sourceName(item.source) || feed.name;
    const date = item.isoDate ? new Date(item.isoDate) : null;
    items.push({
      title: stripSourceSuffix(rawTitle, sourceName(item.source)),
      link,
      source,
      published: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      feed: feed.id,
      lang: feed.lang,
      hint: feed.hint
    });
  }
  return items;
}

// 1本こけても全体は止めない。失敗は report に残す
export async function fetchAllFeeds(feeds, { maxPerFeed = Infinity, concurrency = 6, ...fetchOptions } = {}) {
  const report = [];
  const perFeed = await mapPool(feeds, concurrency, async (feed) => {
    const started = Date.now();
    try {
      const items = (await parseFeed(await fetchText(feed.url, fetchOptions), feed)).slice(0, maxPerFeed);
      report.push({ id: feed.id, name: feed.name, ok: true, count: items.length, ms: Date.now() - started });
      return items;
    } catch (error) {
      report.push({ id: feed.id, name: feed.name, ok: false, count: 0, error: String(error?.message ?? error), ms: Date.now() - started });
      return [];
    }
  });
  const order = new Map(feeds.map((feed, index) => [feed.id, index]));
  report.sort((a, b) => order.get(a.id) - order.get(b.id));
  return { items: perFeed.flat(), report };
}

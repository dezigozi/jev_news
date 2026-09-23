import { createHash } from "node:crypto";

// 同じニュースかどうかを見るための正規化。全角半角・大小文字・空白・記号の差を消す
export function normalizeTitle(title) {
  return String(title).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function idOf(key) {
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

export function bigrams(text) {
  const set = new Set();
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  return set;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const gram of small) if (large.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const MAX_ALSO = 10;

function addAlso(record, source) {
  if (!source || source === record.source || record.also.includes(source) || record.also.length >= MAX_ALSO) return;
  record.also.push(source);
}

// 取ってきた見出しを state に混ぜる。既知なら lastSeen を更新、ほぼ同じ見出しなら「ほか◯件」に数える
export function mergeIntoState(state, rawItems, now, { threshold = 0.6 } = {}) {
  const records = Object.values(state.items);
  const grams = new Map(records.map((record) => [record.id, bigrams(normalizeTitle(record.title))]));
  const added = [];
  let known = 0;
  let merged = 0;

  for (const item of rawItems) {
    const key = normalizeTitle(item.title);
    if (key.length < 4) continue;
    const id = idOf(key);

    const existing = state.items[id];
    if (existing) {
      existing.lastSeen = now;
      addAlso(existing, item.source);
      known += 1;
      continue;
    }

    const itemGrams = bigrams(key);
    let near = null;
    for (const record of records) {
      if (record.lang !== item.lang) continue;
      const recordGrams = grams.get(record.id);
      const ratio = recordGrams.size / itemGrams.size;
      if (ratio < threshold || ratio > 1 / threshold) continue;
      if (jaccard(itemGrams, recordGrams) >= threshold) {
        near = record;
        break;
      }
    }
    if (near) {
      near.lastSeen = now;
      addAlso(near, item.source);
      merged += 1;
      continue;
    }

    const record = {
      id,
      title: item.title,
      link: item.link,
      source: item.source,
      feed: item.feed,
      lang: item.lang,
      hint: item.hint,
      published: item.published,
      firstSeen: now,
      lastSeen: now,
      genre: null,
      insight: null,
      buzz: null,
      tries: 0,
      ja: null,
      also: []
    };
    state.items[id] = record;
    records.push(record);
    grams.set(id, itemGrams);
    added.push(record);
  }

  return { added, known, merged };
}

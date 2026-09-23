import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_VERSION = 2;

export function emptyState() {
  return { version: STATE_VERSION, items: {} };
}

// 前回までの結果を読む。無い・壊れているときは空から始め、その理由を返す（呼び出し側がログに出す）
export function loadState(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return { state: emptyState(), problem: error.code === "ENOENT" ? "前回の結果が無い" : `前回の結果を読めない: ${error.message}` };
  }
  try {
    const state = JSON.parse(text);
    if (state?.version !== STATE_VERSION || typeof state.items !== "object" || state.items === null) {
      return { state: emptyState(), problem: `前回の結果の形が違う（version ${state?.version}）` };
    }
    return { state, problem: null };
  } catch (error) {
    return { state: emptyState(), problem: `前回の結果が壊れている: ${error.message}` };
  }
}

export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}

// しばらくフィードに出てこなくなった見出しを捨てる
export function prune(state, now, days) {
  const limit = new Date(now).getTime() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const [id, record] of Object.entries(state.items)) {
    if (new Date(record.lastSeen).getTime() < limit) {
      delete state.items[id];
      removed += 1;
    }
  }
  return removed;
}

// 画面に出す時刻。配信時刻が無い・未来になっているときは、初めて見つけた時刻を使う
export function displayTime(record, now) {
  if (record.published && record.published <= now) return record.published;
  return record.firstSeen;
}

// 画面用の JSON。サイズを抑えるためキーは短くする
export function toPublic(state, { now, genres, feedReport }) {
  const items = Object.values(state.items)
    .map((record) => ({
      id: record.id,
      t: record.title,
      u: record.link,
      s: record.source,
      g: record.genre ?? record.hint ?? null,
      i: record.insight,
      b: record.buzz ?? null,
      p: displayTime(record, now),
      ...(record.lang === "en" ? { en: true } : {}),
      ...(record.ja ? { ja: record.ja } : {}),
      ...(record.also.length ? { n: record.also.length } : {})
    }))
    .sort((a, b) => (a.p < b.p ? 1 : a.p > b.p ? -1 : 0));
  return {
    generatedAt: now,
    genres: genres.map(({ id, name, rank }) => ({ id, name, ...(rank ? { rank } : {}) })),
    feeds: feedReport.map(({ name, ok, count }) => ({ name, ok, count })),
    items
  };
}

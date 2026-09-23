// 毎時の本体：集める → 重複をまとめる → 新着を Jev で分類 → 英語を Groq で訳す → dist/ にサイトを書き出す
import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyAll, countTries, MAX_TRIES } from "./classify.js";
import { mergeIntoState } from "./dedupe.js";
import { FEEDS, MAX_ITEMS_PER_FEED } from "./feeds.js";
import { fetchAllFeeds } from "./fetch-feeds.js";
import { GENRES } from "./genres.js";
import { loadApiKey } from "./jev.js";
import { loadState, prune, toPublic, writeJsonAtomic } from "./state.js";
import { DEFAULT_GROQ_MODEL, translateAll } from "./translate.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STATE_FILE = join(ROOT, ".cache", "state.json");
const SITE_DIR = join(ROOT, "site");
const DIST_DIR = join(ROOT, "dist");

const RETENTION_DAYS = 5;
// 初回や Groq が止まっていた後に一度に訳しすぎないように
const TRANSLATE_LIMIT = 200;
// Jev の料金（入力 100 万トークンあたり。出力は無料）
const JEV_USD_PER_MTOK = 0.042;

function writeSite(data) {
  // 消すのは必ずこのリポの dist だけ
  if (basename(DIST_DIR) !== "dist" || !existsSync(join(ROOT, "package.json"))) {
    throw new Error(`dist の場所がおかしい: ${DIST_DIR}`);
  }
  rmSync(DIST_DIR, { recursive: true, force: true });
  cpSync(SITE_DIR, DIST_DIR, { recursive: true });
  const file = join(DIST_DIR, "data", "news.json");
  writeJsonAtomic(file, data);
  return statSync(file).size;
}

async function main() {
  const started = Date.now();
  const now = new Date().toISOString();
  const apiKey = loadApiKey();

  const { state, problem } = loadState(STATE_FILE);
  if (problem) console.warn(`[state] ${problem} → 空から始めて全件を分類する`);

  const { items: raw, report } = await fetchAllFeeds(FEEDS, { maxPerFeed: MAX_ITEMS_PER_FEED });
  for (const feed of report) {
    if (feed.ok) console.log(`[feed] ✓ ${feed.name} ${feed.count}本 ${feed.ms}ms`);
    else console.warn(`[feed] ✗ ${feed.name}: ${feed.error}`);
  }
  if (!report.some((feed) => feed.ok)) throw new Error("全フィードの取得に失敗した");

  const { added, known, merged } = mergeIntoState(state, raw, now);
  console.log(`[merge] 見出し ${raw.length}本 → 新着 ${added.length} / 既知 ${known} / ほぼ同じでまとめた ${merged}`);

  const pending = Object.values(state.items).filter((record) => record.genre === null && record.tries < MAX_TRIES);
  const feedNames = Object.fromEntries(FEEDS.map((feed) => [feed.id, feed.name]));
  const jevStarted = Date.now();
  const classified = await classifyAll(pending, { apiKey, feedNames });
  countTries(classified);
  const cost = (classified.usage.input_tokens / 1e6) * JEV_USD_PER_MTOK;
  console.log(
    `[jev] 分類 ${classified.ok}/${pending.length}本 ${((Date.now() - jevStarted) / 1000).toFixed(1)}秒 入力 ${classified.usage.input_tokens}トークン ≈ $${cost.toFixed(4)}`
  );
  for (const [message, count] of classified.errors) console.warn(`[jev] 失敗 ${count}本: ${message}`);

  const untranslated = Object.values(state.items).filter((record) => record.lang === "en" && !record.ja);
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    if (untranslated.length) console.warn(`[groq] GROQ_API_KEY が無いので英語 ${untranslated.length}本は訳さない`);
  } else if (untranslated.length) {
    const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
    const translated = await translateAll(untranslated.slice(0, TRANSLATE_LIMIT), { apiKey: groqKey, model });
    console.log(`[groq] 翻訳 ${translated.ok}/${Math.min(untranslated.length, TRANSLATE_LIMIT)}本（${model}）`);
    for (const message of translated.errors) console.warn(`[groq] 失敗: ${message}`);
  }

  const removed = prune(state, now, RETENTION_DAYS);
  writeJsonAtomic(STATE_FILE, state);

  const data = toPublic(state, { now, genres: GENRES, feedReport: report });
  const bytes = writeSite(data);
  const perGenre = GENRES.map((genre) => `${genre.name} ${data.items.filter((item) => item.g === genre.id).length}`).join(" / ");
  console.log(`[site] ${data.items.length}本（古いもの ${removed}本を削除）news.json ${(bytes / 1024).toFixed(0)}KB`);
  console.log(`[site] ${perGenre}`);
  console.log(`[done] ${((Date.now() - started) / 1000).toFixed(1)}秒`);

  // 分類が全滅したときは、Actions の実行を失敗にして気づけるようにする（サイトと state は書き出し済み）
  if (pending.length > 0 && classified.ok === 0) {
    throw new Error("Jev の分類が1本も通らなかった（キーか Jev 側の問題）");
  }
}

main().catch((error) => {
  console.error(`[build] 失敗: ${error?.message ?? error}`);
  process.exitCode = 1;
});

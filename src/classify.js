import { GENRES, GENRE_IDS } from "./genres.js";
import { askJev } from "./jev.js";
import { mapPool } from "./pool.js";

// 何回聞いても分類できない見出しは、そのうちあきらめる（フィードの仮ジャンルで表示される）
export const MAX_TRIES = 3;

export function buildQuestions(genres = GENRES) {
  return {
    genre: {
      type: "choice",
      instructions: "Pick the one genre this news headline belongs to. Judge by what the story is mainly about, not by the outlet or feed.",
      criteria: Object.fromEntries(genres.map((genre) => [genre.id, `${genre.name}: ${genre.desc}`]))
    },
    insight: {
      type: "noul",
      instructions:
        "Would reading this headline broaden the knowledge of a curious working adult — a new fact, trend, finding, or perspective worth knowing? Answer no for celebrity gossip, crime or accident details with no wider meaning, clickbait, sales promotions, or advertorials.",
      criteria: { true: "Yes, it broadens knowledge.", false: "No." }
    },
    buzz: {
      type: "noul",
      instructions:
        "Is this story likely to be widely talked about by the general public right now — celebrity news or scandal, a shocking crime, arrest or trial, a viral controversy, or a story everyone is discussing? Routine announcements and niche topics are no.",
      criteria: { true: "Yes, it is a hot topic people are talking about.", false: "No." }
    }
  };
}

export function stateText(record, feedName) {
  return `見出し: ${record.title}\n媒体: ${record.source}\n取得元: ${feedName ?? record.feed}`;
}

const round = (value) => Math.round(value * 1000) / 1000;

export function readAnswers(answers) {
  const probabilities = answers?.genre?.probabilities;
  const insight = answers?.insight?.noul;
  const buzz = answers?.buzz?.noul;
  if (!probabilities || typeof insight !== "number" || typeof buzz !== "number") return null;
  const [genre] = Object.entries(probabilities)
    .filter(([id]) => GENRE_IDS.includes(id))
    .sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!genre) return null;
  return { genre, insight: round(insight), buzz: round(buzz) };
}

export async function classifyAll(records, { apiKey, feedNames = {}, ask = askJev, concurrency = 16, genres = GENRES } = {}) {
  const questions = buildQuestions(genres);
  const usage = { input_tokens: 0, output_tokens: 0 };
  const errors = new Map();
  const failedRecords = [];
  let ok = 0;

  await mapPool(records, concurrency, async (record) => {
    try {
      const body = await ask({ apiKey, state: stateText(record, feedNames[record.feed]), questions });
      const result = readAnswers(body.answers);
      if (!result) throw new Error("Jev の答えに genre / insight / buzz が無い");
      record.genre = result.genre;
      record.insight = result.insight;
      record.buzz = result.buzz;
      ok += 1;
      for (const key of Object.keys(usage)) usage[key] += body.usage?.[key] ?? 0;
    } catch (error) {
      failedRecords.push(record);
      const message = String(error?.message ?? error);
      errors.set(message, (errors.get(message) ?? 0) + 1);
    }
  });

  return { ok, failedRecords, errors, usage };
}

// 一部だけ失敗したときは、その見出しの失敗回数を数える。
// 全部失敗したとき（Jev が落ちている・キーが違う）は見出しのせいではないので数えない
export function countTries(result) {
  if (result.ok === 0) return 0;
  for (const record of result.failedRecords) record.tries += 1;
  return result.failedRecords.length;
}

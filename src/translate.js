// 英語の見出しを Groq（OpenAI 互換 API）で日本語に訳す
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

const TIMEOUT_MS = 30_000;
const RETRIES = 2;
export const BATCH_SIZE = 40;

const SYSTEM_PROMPT = [
  "You translate English news headlines into natural, concise Japanese news headlines.",
  "Use the usual Japanese renderings of names, places, and organizations.",
  'Reply with JSON only: {"items":[{"id":"<id>","ja":"<Japanese headline>"}]} with exactly one entry per input id. No explanations.'
].join("\n");

export function buildRequest(batch, model) {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(batch.map((record) => ({ id: record.id, en: record.title }))) }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2
  };
  // gpt-oss は推論モデル。見出しの翻訳に長考は要らないので軽くする
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  return body;
}

// 頼んだ id のうち、ちゃんと訳が返ってきたものだけを採用する
export function readTranslations(content, batch) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq の返事が JSON として読めない");
  }
  const wanted = new Set(batch.map((record) => record.id));
  const result = new Map();
  for (const entry of Array.isArray(parsed?.items) ? parsed.items : []) {
    const ja = typeof entry?.ja === "string" ? entry.ja.trim() : "";
    if (wanted.has(entry?.id) && ja) result.set(entry.id, ja);
  }
  return result;
}

// 待つ時間。429 のときは Groq が retry-after（秒）で指定してくるので、それを守る（長すぎるときは60秒で打ち切る）
export function retryDelay(response, attempt) {
  const seconds = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 60) * 1000;
  return 1000 * 2 ** attempt;
}

async function callGroq(body, { apiKey, fetchImpl, sleep, timeoutMs, retries }) {
  let lastError;
  let delay = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(delay);
    delay = retryDelay(null, attempt);
    let response;
    try {
      response = await fetchImpl(GROQ_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = error?.name === "TimeoutError" ? new Error(`Groq が ${timeoutMs}ms 以内に応答なし`) : new Error(`Groq に接続できない: ${error?.message ?? error}`);
      continue;
    }
    if (response.ok) {
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Groq の返事に本文が無い");
      return { content, usage: json.usage };
    }
    lastError = new Error(`Groq API が HTTP ${response.status}`);
    if (response.status !== 429 && response.status < 500) throw lastError;
    delay = retryDelay(response, attempt);
  }
  throw lastError;
}

// 訳せた分だけ record.ja に入れる。訳せなかった分は次の回にもう一度
export async function translateAll(records, {
  apiKey,
  model = DEFAULT_GROQ_MODEL,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = TIMEOUT_MS,
  retries = RETRIES,
  batchSize = BATCH_SIZE
} = {}) {
  const errors = [];
  let ok = 0;
  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    try {
      const { content } = await callGroq(buildRequest(batch, model), { apiKey, fetchImpl, sleep, timeoutMs, retries });
      const translations = readTranslations(content, batch);
      for (const record of batch) {
        const ja = translations.get(record.id);
        if (ja) {
          record.ja = ja;
          ok += 1;
        }
      }
    } catch (error) {
      errors.push(String(error?.message ?? error));
    }
  }
  return { ok, failed: records.length - ok, errors };
}

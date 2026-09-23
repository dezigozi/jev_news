import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
export const KEY_FILE = join(homedir(), ".claude", "jev-review.env");

// 実測 0.2〜0.5 秒。混雑時の余裕を見て 15 秒で打ち切る
const TIMEOUT_MS = 15_000;
const RETRIES = 2;

// VSCode から起動すると .zshrc の export が届かんことがあるので、キーファイルも直接読む
export function loadApiKey(env = process.env, keyFile = KEY_FILE) {
  const fromEnv = env.JEV_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  let text;
  try {
    text = readFileSync(keyFile, "utf8");
  } catch (error) {
    throw new Error(`JEV_API_KEY が環境変数にも ${keyFile} にも無い（${error.code ?? error.message}）`);
  }
  const key = text.match(/^\s*(?:export\s+)?JEV_API_KEY\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error(`${keyFile} に JEV_API_KEY の値が無い`);
  return key;
}

export async function askJev({
  apiKey,
  state,
  questions,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = TIMEOUT_MS,
  retries = RETRIES
}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      console.error(`[jev] リトライ ${attempt}/${retries}: ${lastError.message}`);
      await sleep(300 * 2 ** (attempt - 1));
    }

    let response;
    try {
      response = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state, model: JEV_MODEL, questions }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = error?.name === "TimeoutError"
        ? new Error(`Jev が ${timeoutMs}ms 以内に応答せえへんかった`)
        : new Error(`Jev に接続できへん: ${error?.message ?? error}`);
      continue;
    }

    if (response.ok) {
      const body = await response.json();
      if (!body || typeof body.answers !== "object" || body.answers === null) {
        throw new Error("Jev の応答に answers が無い");
      }
      return body;
    }

    lastError = new Error(describeStatus(response.status, await readErrorType(response)));
    if (!isRetryable(response.status)) throw lastError;
  }
  throw lastError;
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}

function describeStatus(status, errorType) {
  if (status === 400 && errorType === "max_tokens_exceeded") {
    return "Jev の入力上限（約32kトークン）超え。paths を行範囲で絞るか、diff をやめて paths だけにして";
  }
  if (status === 401) return "Jev が API キーを拒否（~/.claude/jev-review.env を確認）";
  if (status === 422) return "Jev が質問の形を拒否（HTTP 422）";
  return `Jev API が HTTP ${status}${errorType ? ` (${errorType})` : ""}`;
}

async function readErrorType(response) {
  try {
    const body = await response.json();
    return typeof body?.detail?.error_type === "string" ? body.detail.error_type : undefined;
  } catch {
    // エラー本文が JSON やない（HTML の 502 など）。ステータスだけで報告する
    return undefined;
  }
}

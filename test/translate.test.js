import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRequest, GROQ_ENDPOINT, readTranslations, translateAll } from "../src/translate.js";

const en = (id, title) => ({ id, title, lang: "en", ja: null });

const reply = (content, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => ({ choices: [{ message: { content } }] })
});

describe("buildRequest", () => {
  it("JSON で返させ、gpt-oss のときだけ推論を軽くする", () => {
    const body = buildRequest([en("a", "Hello")], "openai/gpt-oss-120b");
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.reasoning_effort, "low");
    assert.deepEqual(JSON.parse(body.messages[1].content), [{ id: "a", en: "Hello" }]);
    assert.equal(buildRequest([en("a", "Hello")], "llama-3.3-70b-versatile").reasoning_effort, undefined);
  });
});

describe("readTranslations", () => {
  it("頼んだ id で中身のある訳だけを採る", () => {
    const batch = [en("a", "A"), en("b", "B")];
    const result = readTranslations(
      JSON.stringify({ items: [{ id: "a", ja: " 訳A " }, { id: "b", ja: "" }, { id: "zzz", ja: "よそ" }] }),
      batch
    );
    assert.deepEqual([...result], [["a", "訳A"]]);
    assert.throws(() => readTranslations("not json", batch), /JSON/);
    assert.equal(readTranslations("{}", batch).size, 0);
  });
});

describe("translateAll", () => {
  it("まとめて訳し、訳せなかった分は残す", async () => {
    const records = [en("a", "A"), en("b", "B"), en("c", "C")];
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      const ids = JSON.parse(JSON.parse(init.body).messages[1].content).map((item) => item.id);
      return reply(JSON.stringify({ items: ids.filter((id) => id !== "c").map((id) => ({ id, ja: `訳${id}` })) }));
    };
    const result = await translateAll(records, { apiKey: "gk", fetchImpl, batchSize: 2 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, GROQ_ENDPOINT);
    assert.equal(calls[0].auth, "Bearer gk");
    assert.deepEqual(records.map((r) => r.ja), ["訳a", "訳b", null]);
    assert.deepEqual(result, { ok: 2, failed: 1, errors: [] });
  });

  it("429 はリトライし、401 はすぐあきらめてエラーに残す", async () => {
    let calls = 0;
    const retrying = async () => {
      calls += 1;
      return calls === 1 ? reply("", 429) : reply(JSON.stringify({ items: [{ id: "a", ja: "訳" }] }));
    };
    const records = [en("a", "A")];
    const ok = await translateAll(records, { apiKey: "k", fetchImpl: retrying, sleep: async () => {} });
    assert.equal(ok.ok, 1);
    assert.equal(calls, 2);

    let denied = 0;
    const result = await translateAll([en("b", "B")], {
      apiKey: "bad",
      fetchImpl: async () => {
        denied += 1;
        return reply("", 401);
      },
      sleep: async () => {}
    });
    assert.equal(denied, 1);
    assert.deepEqual(result.errors, ["Groq API が HTTP 401"]);
  });
});

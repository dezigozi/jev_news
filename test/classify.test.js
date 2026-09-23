import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuestions, classifyAll, countTries, readAnswers, stateText } from "../src/classify.js";
import { GENRE_IDS } from "../src/genres.js";

const record = (id) => ({ id, title: `見出し${id}`, source: "A新聞", feed: "gn_top", genre: null, insight: null, tries: 0 });

describe("buildQuestions", () => {
  it("genre は全ジャンルの選択、insight と buzz ははい/いいえ", () => {
    const questions = buildQuestions();
    assert.equal(questions.genre.type, "choice");
    assert.deepEqual(Object.keys(questions.genre.criteria), GENRE_IDS);
    assert.equal(questions.insight.type, "noul");
    assert.equal(questions.buzz.type, "noul");
  });
});

describe("stateText", () => {
  it("見出し・媒体・取得元を渡す", () => {
    assert.equal(stateText(record("1"), "Googleニュース"), "見出し: 見出し1\n媒体: A新聞\n取得元: Googleニュース");
  });
});

describe("readAnswers", () => {
  it("一番確率の高いジャンルを選び、知らないジャンルは無視する", () => {
    assert.deepEqual(
      readAnswers({ genre: { probabilities: { unknown: 0.9, tech: 0.6, world: 0.1 } }, insight: { noul: 0.71234 }, buzz: { noul: 0.2 } }),
      { genre: "tech", insight: 0.712, buzz: 0.2 }
    );
    assert.equal(readAnswers({ genre: { probabilities: { tech: 1 } }, insight: { noul: 0.5 } }), null);
    assert.equal(readAnswers(undefined), null);
  });
});

describe("classifyAll", () => {
  it("成功したものに genre と insight を入れ、失敗は数えて返す", async () => {
    const records = [record("1"), record("2"), record("3")];
    const ask = async ({ state }) => {
      if (state.includes("見出し2")) throw new Error("Jev API が HTTP 500");
      return {
        answers: { genre: { probabilities: { science: 0.8, tech: 0.2 } }, insight: { noul: 0.9 }, buzz: { noul: 0.4 } },
        usage: { input_tokens: 100, output_tokens: 5 }
      };
    };
    const result = await classifyAll(records, { apiKey: "k", ask });
    assert.equal(result.ok, 2);
    assert.deepEqual(result.failedRecords.map((r) => r.id), ["2"]);
    assert.deepEqual(result.usage, { input_tokens: 200, output_tokens: 10 });
    assert.equal(result.errors.get("Jev API が HTTP 500"), 1);
    assert.equal(records[0].genre, "science");
    assert.equal(records[0].buzz, 0.4);
    assert.equal(records[1].genre, null);

    assert.equal(countTries(result), 1);
    assert.equal(records[1].tries, 1);
  });

  it("全部失敗したとき（Jev 側の問題）は見出しの失敗回数を増やさない", async () => {
    const records = [record("1"), record("2")];
    const result = await classifyAll(records, { apiKey: "k", ask: async () => { throw new Error("down"); } });
    assert.equal(result.ok, 0);
    assert.equal(countTries(result), 0);
    assert.deepEqual(records.map((r) => r.tries), [0, 0]);
  });
});

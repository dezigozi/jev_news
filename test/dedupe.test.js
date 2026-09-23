import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bigrams, idOf, jaccard, mergeIntoState, normalizeTitle } from "../src/dedupe.js";
import { emptyState } from "../src/state.js";

const raw = (title, source = "A新聞", lang = "ja") => ({
  title,
  link: `https://example.com/${encodeURIComponent(title)}`,
  source,
  published: null,
  feed: "gn_top",
  lang,
  hint: "domestic"
});

describe("normalizeTitle", () => {
  it("全角半角・大小文字・空白・記号の差を消す", () => {
    assert.equal(normalizeTitle("【速報】ＡＩ 規制、ＥＵで可決！"), normalizeTitle("【速報】AI規制 EUで可決!"));
    assert.equal(normalizeTitle("Hello, World"), "helloworld");
  });
});

describe("jaccard", () => {
  it("同じなら1、無関係なら0", () => {
    assert.equal(jaccard(bigrams("日銀が利上げ"), bigrams("日銀が利上げ")), 1);
    assert.equal(jaccard(bigrams("日銀が利上げ"), bigrams("台風が接近中")), 0);
  });
});

describe("mergeIntoState", () => {
  it("新しい見出しを足し、同じ見出しは lastSeen と別媒体だけ更新する", () => {
    const state = emptyState();
    const first = mergeIntoState(state, [raw("日銀が17年ぶりに利上げを決定")], "2026-09-23T00:00:00.000Z");
    assert.equal(first.added.length, 1);
    const id = idOf(normalizeTitle("日銀が17年ぶりに利上げを決定"));
    assert.equal(state.items[id].genre, null);
    assert.equal(state.items[id].tries, 0);

    const second = mergeIntoState(state, [raw("日銀が17年ぶりに利上げを決定", "B新聞")], "2026-09-23T01:00:00.000Z");
    assert.equal(second.added.length, 0);
    assert.equal(second.known, 1);
    assert.equal(state.items[id].lastSeen, "2026-09-23T01:00:00.000Z");
    assert.equal(state.items[id].firstSeen, "2026-09-23T00:00:00.000Z");
    assert.deepEqual(state.items[id].also, ["B新聞"]);
  });

  it("ほぼ同じ見出しは1本にまとめ、違う話は分ける", () => {
    const state = emptyState();
    const result = mergeIntoState(
      state,
      [
        raw("【速報】日銀が17年ぶりに利上げを決定"),
        raw("日銀が17年ぶりに利上げを決定", "B新聞"),
        raw("台風25号が沖縄に接近、暴風に警戒", "C新聞")
      ],
      "2026-09-23T00:00:00.000Z"
    );
    assert.equal(result.added.length, 2);
    assert.equal(result.merged, 1);
    const boj = Object.values(state.items).find((record) => record.title.includes("日銀"));
    assert.deepEqual(boj.also, ["B新聞"]);
  });

  it("言語が違えば、まとめない", () => {
    const state = emptyState();
    const now = "2026-09-23T00:00:00.000Z";
    const same = mergeIntoState(emptyState(), [raw("Japan central bank hikes rates", "X", "en"), raw("Japan central bank hikes rates again", "Y", "en")], now);
    assert.equal(same.merged, 1);
    const result = mergeIntoState(state, [raw("Japan central bank hikes rates", "X", "en"), raw("Japan central bank hikes rates again", "Y", "ja")], now);
    assert.equal(result.added.length, 2);
    assert.equal(result.merged, 0);
  });
});

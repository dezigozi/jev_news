import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { displayTime, emptyState, loadState, prune, toPublic, writeJsonAtomic } from "../src/state.js";

const dir = mkdtempSync(join(tmpdir(), "jev-news-state-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const record = (overrides) => ({
  id: "x",
  title: "見出し",
  link: "https://example.com/x",
  source: "A新聞",
  feed: "gn_top",
  lang: "ja",
  hint: "domestic",
  published: null,
  firstSeen: "2026-09-23T00:00:00.000Z",
  lastSeen: "2026-09-23T00:00:00.000Z",
  genre: null,
  insight: null,
  buzz: null,
  tries: 0,
  ja: null,
  also: [],
  ...overrides
});

describe("loadState", () => {
  it("無い・壊れている・形が違うときは空から始めて理由を返す", () => {
    assert.match(loadState(join(dir, "none.json")).problem, /無い/);
    writeFileSync(join(dir, "broken.json"), "{");
    assert.match(loadState(join(dir, "broken.json")).problem, /壊れている/);
    writeFileSync(join(dir, "old.json"), JSON.stringify({ version: 0, items: {} }));
    assert.match(loadState(join(dir, "old.json")).problem, /形が違う/);
  });

  it("書いたものをそのまま読める", () => {
    const state = emptyState();
    state.items.x = record();
    const file = join(dir, "nested", "state.json");
    writeJsonAtomic(file, state);
    const loaded = loadState(file);
    assert.equal(loaded.problem, null);
    assert.deepEqual(loaded.state, state);
  });
});

describe("prune", () => {
  it("しばらく見かけていない見出しだけ消す", () => {
    const state = emptyState();
    state.items.old = record({ id: "old", lastSeen: "2026-09-17T00:00:00.000Z" });
    state.items.recent = record({ id: "recent", lastSeen: "2026-09-22T00:00:00.000Z" });
    assert.equal(prune(state, "2026-09-23T00:00:00.000Z", 5), 1);
    assert.deepEqual(Object.keys(state.items), ["recent"]);
  });
});

describe("displayTime / toPublic", () => {
  const now = "2026-09-23T12:00:00.000Z";

  it("配信時刻が無い・未来なら初めて見た時刻を使う", () => {
    assert.equal(displayTime(record({ published: "2026-09-23T10:00:00.000Z" }), now), "2026-09-23T10:00:00.000Z");
    assert.equal(displayTime(record({ published: "2026-09-24T00:00:00.000Z" }), now), "2026-09-23T00:00:00.000Z");
    assert.equal(displayTime(record(), now), "2026-09-23T00:00:00.000Z");
  });

  it("新しい順に並べ、分類前はフィードの仮ジャンルを使う", () => {
    const state = emptyState();
    state.items.a = record({ id: "a", published: "2026-09-23T01:00:00.000Z", genre: "tech", insight: 0.8, buzz: 0.3 });
    state.items.b = record({ id: "b", published: "2026-09-23T05:00:00.000Z", lang: "en", ja: "訳", also: ["B", "C"] });
    const data = toPublic(state, {
      now,
      genres: [{ id: "tech", name: "テック", desc: "説明" }, { id: "crime", name: "事件", desc: "説明", rank: "buzz" }],
      feedReport: [{ id: "gn_top", name: "Googleニュース", ok: true, count: 2, ms: 10 }]
    });
    assert.deepEqual(data.genres, [{ id: "tech", name: "テック" }, { id: "crime", name: "事件", rank: "buzz" }]);
    assert.deepEqual(data.feeds, [{ name: "Googleニュース", ok: true, count: 2 }]);
    assert.deepEqual(data.items.map((item) => item.id), ["b", "a"]);
    assert.deepEqual(data.items[0], {
      id: "b",
      t: "見出し",
      u: "https://example.com/x",
      s: "A新聞",
      g: "domestic",
      i: null,
      b: null,
      p: "2026-09-23T05:00:00.000Z",
      en: true,
      ja: "訳",
      n: 2
    });
    assert.equal(data.items[1].g, "tech");
    assert.equal(data.items[1].b, 0.3);
    assert.equal("en" in data.items[1], false);
  });
});

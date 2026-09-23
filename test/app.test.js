import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Window } from "happy-dom";

import { genreItems, init, isBuzzGenre, isLow, pickDigest, searchItems, timeAgo } from "../site/app.js";

const NOW = Date.parse("2026-09-23T12:00:00.000Z");
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();

const data = {
  generatedAt: hoursAgo(0.2),
  genres: [
    { id: "tech", name: "テクノロジー・AI" },
    { id: "world", name: "国際・海外" },
    { id: "crime", name: "事件・裁判", rank: "buzz" },
    { id: "fashion", name: "ファッション・美容" }
  ],
  feeds: [
    { name: "Googleニュース", ok: true, count: 30 },
    { name: "BBC World", ok: false, count: 0 }
  ],
  items: [
    { id: "t1", t: "量子コンピューターの新方式", u: "https://example.com/t1", s: "A新聞", g: "tech", i: 0.9, p: hoursAgo(1) },
    { id: "t2", t: "新しいスマホが発売", u: "https://example.com/t2", s: "B新聞", g: "tech", i: 0.6, p: hoursAgo(2), n: 3 },
    { id: "t3", t: "セールで半額", u: "https://example.com/t3", s: "C新聞", g: "tech", i: 0.1, p: hoursAgo(0.5) },
    { id: "t4", t: "AI の昔話", u: "https://example.com/t4", s: "D新聞", g: "tech", i: 0.95, p: hoursAgo(50) },
    { id: "w1", t: "EU renews Russia sanctions", u: "https://example.com/w1", s: "Reuters", g: "world", i: 0.8, p: hoursAgo(3), en: true, ja: "EU、対ロシア制裁を延長" },
    { id: "w2", t: "Old story", u: "https://example.com/w2", s: "BBC", g: "world", i: 0.7, p: hoursAgo(40), en: true },
    { id: "c1", t: "有名俳優を逮捕", u: "https://example.com/c1", s: "E新聞", g: "crime", i: 0.1, b: 0.9, p: hoursAgo(2), n: 5 },
    { id: "c2", t: "地裁で判決", u: "https://example.com/c2", s: "F新聞", g: "crime", i: 0.6, b: 0.5, p: hoursAgo(1) }
  ]
};

const bodyHtml = readFileSync(new URL("../site/index.html", import.meta.url), "utf8")
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, "");

function mount({ storage, initialHash = "" } = {}) {
  const window = new Window({ url: "https://example.com/jev_news/" });
  window.document.body.innerHTML = bodyHtml;
  const store = storage ?? window.localStorage;
  const pushed = [];
  const app = init({
    doc: window.document,
    data,
    storage: store,
    now: NOW,
    history: { pushState: (_state, _title, url) => pushed.push(url) },
    initialHash
  });
  const doc = window.document;
  const titles = () => [...doc.querySelectorAll("#view .title")].map((node) => node.textContent);
  return { window, doc, app, pushed, titles, store };
}

describe("しくみの関数", () => {
  it("timeAgo", () => {
    assert.equal(timeAgo(hoursAgo(0.01), NOW), "たった今");
    assert.equal(timeAgo(hoursAgo(0.5), NOW), "30分前");
    assert.equal(timeAgo(hoursAgo(5), NOW), "5時間前");
    assert.equal(timeAgo(hoursAgo(50), NOW), "2日前");
    assert.equal(timeAgo("bad", NOW), "");
  });

  it("pickDigest：発見度が低いものは除き、直近24時間を優先、無ければ5日分から", () => {
    const digest = pickDigest(data.items, data.genres, NOW);
    assert.deepEqual(digest.map((d) => d.items.map((item) => item.id)), [["t1", "t2"], ["w1"], ["c1", "c2"], []]);
    const onlyOld = pickDigest(data.items.filter((item) => item.id === "w2"), data.genres, NOW);
    assert.deepEqual(onlyOld[1].items.map((item) => item.id), ["w2"]);
  });

  it("genreItems：並び順と低スコアの出し入れ", () => {
    const [tech, , crime] = data.genres;
    assert.deepEqual(genreItems(data.items, tech).map((i) => i.id), ["t4", "t1", "t2"]);
    assert.deepEqual(genreItems(data.items, tech, { sort: "time" }).map((i) => i.id), ["t1", "t2", "t4"]);
    assert.deepEqual(genreItems(data.items, tech, { sort: "time", showLow: true }).map((i) => i.id), ["t3", "t1", "t2", "t4"]);
    assert.equal(isBuzzGenre(crime), true);
    assert.equal(isBuzzGenre(tech), false);
    assert.equal(isLow({ i: 0.29 }), true);
    assert.equal(isLow({ i: null }), false);
  });

  it("事件・ゴシップは発見度が低くても隠さず、話題性の順に並べる", () => {
    const crime = data.genres[2];
    assert.deepEqual(genreItems(data.items, crime).map((i) => i.id), ["c1", "c2"]);
    assert.deepEqual(genreItems(data.items, crime, { sort: "time" }).map((i) => i.id), ["c2", "c1"]);
  });

  it("searchItems：訳・媒体名も対象、全角半角と大小文字を無視、全部の言葉を含むもの", () => {
    assert.deepEqual(searchItems(data.items, "制裁").map((i) => i.id), ["w1"]);
    assert.deepEqual(searchItems(data.items, "ｒｕｓｓｉａ").map((i) => i.id), ["w1"]);
    assert.deepEqual(searchItems(data.items, "reuters EU").map((i) => i.id), ["w1"]);
    assert.deepEqual(searchItems(data.items, "  "), []);
  });
});

describe("画面", () => {
  it("最初は「きょうのひろがり」。空のジャンルは「取得できず」", () => {
    const { doc, titles } = mount();
    assert.match(doc.getElementById("updated").textContent, /更新 .*（12分前）· 8本/);
    assert.equal(doc.querySelector(".view-title").textContent, "きょうのひろがり");
    assert.deepEqual(titles(), ["量子コンピューターの新方式", "新しいスマホが発売", "EU renews Russia sanctions", "有名俳優を逮捕", "地裁で判決"]);
    const fashion = doc.querySelector('.digest[data-g="fashion"]');
    assert.equal(fashion.querySelector(".empty").textContent, "取得できず");
    assert.equal(doc.getElementById("controls").hidden, true);
    assert.equal(doc.querySelector('.chip[aria-pressed="true"]').textContent, "ひろがり");
  });

  it("英語の見出しには訳を添え、媒体・時刻・ほか◯件を出す", () => {
    const { doc } = mount();
    const world = doc.querySelector('.digest[data-g="world"] .item');
    assert.equal(world.querySelector(".ja").textContent, "EU、対ロシア制裁を延長");
    assert.equal(world.querySelector(".title").getAttribute("lang"), "en");
    const tech = doc.querySelectorAll('.digest[data-g="tech"] .item')[1];
    assert.deepEqual([...tech.querySelectorAll(".meta span")].map((s) => s.textContent), ["B新聞", "2時間前", "ほか3件"]);
    assert.equal(tech.querySelector(".title").getAttribute("target"), "_blank");
  });

  it("チップでジャンルへ。並び替えと低スコアの表示を切り替えられる", () => {
    const { doc, pushed, titles } = mount();
    doc.querySelector('.chip[data-view="tech"]').click();
    assert.deepEqual(pushed, ["#tech"]);
    assert.equal(doc.querySelector(".view-title").textContent, "テクノロジー・AI");
    assert.equal(doc.getElementById("controls").hidden, false);
    assert.deepEqual(titles(), ["AI の昔話", "量子コンピューターの新方式", "新しいスマホが発売"]);
    assert.equal(doc.querySelector('[data-sort="rank"]').textContent, "発見度順");
    assert.equal(doc.getElementById("low-toggle").hidden, false);
    assert.equal(doc.getElementById("low-label").textContent, "小ネタ・宣伝も出す（1本）");

    doc.querySelector('[data-sort="time"]').click();
    assert.deepEqual(titles(), ["量子コンピューターの新方式", "新しいスマホが発売", "AI の昔話"]);

    const toggle = doc.getElementById("show-low");
    toggle.checked = true;
    toggle.dispatchEvent(new doc.defaultView.Event("change"));
    assert.deepEqual(titles(), ["セールで半額", "量子コンピューターの新方式", "新しいスマホが発売", "AI の昔話"]);
  });

  it("事件・ゴシップの画面は「話題順」で、低スコアの切り替えを出さない", () => {
    const { doc, titles } = mount();
    doc.querySelector('.chip[data-view="crime"]').click();
    assert.deepEqual(titles(), ["有名俳優を逮捕", "地裁で判決"]);
    assert.equal(doc.querySelector('[data-sort="rank"]').textContent, "話題順");
    assert.equal(doc.getElementById("low-toggle").hidden, true);
  });

  it("「もっと見る」とアドレスの #ジャンル からもジャンルを開ける", () => {
    const { doc, titles } = mount();
    doc.querySelector('.digest[data-g="world"] .to-genre').click();
    assert.deepEqual(titles(), ["EU renews Russia sanctions", "Old story"]);

    const opened = mount({ initialHash: "#world" });
    assert.equal(opened.doc.querySelector(".view-title").textContent, "国際・海外");
    const unknown = mount({ initialHash: "#nope" });
    assert.equal(unknown.doc.querySelector(".view-title").textContent, "きょうのひろがり");
  });

  it("検索すると全ジャンルから探し、消すと元の画面に戻る", () => {
    const { doc, titles } = mount();
    const search = doc.getElementById("search");
    search.value = "制裁";
    search.dispatchEvent(new doc.defaultView.Event("input"));
    assert.equal(doc.querySelector(".view-title").textContent, "「制裁」");
    assert.deepEqual(titles(), ["EU renews Russia sanctions"]);
    assert.equal(doc.querySelector("#view .tag").textContent, "国際・海外");
    assert.equal(doc.querySelector('.chip[aria-pressed="true"]'), null);

    search.value = "";
    search.dispatchEvent(new doc.defaultView.Event("input"));
    assert.equal(doc.querySelector(".view-title").textContent, "きょうのひろがり");
  });

  it("開いた見出しは既読になり、次に開いたときも薄く出る", () => {
    const first = mount();
    first.doc.querySelector(".title").click();
    assert.equal(first.doc.querySelector(".item").classList.contains("read"), true);
    assert.deepEqual(JSON.parse(first.store.getItem("jev_news.read")), ["t1"]);

    const again = mount({ storage: first.store });
    assert.equal(again.doc.querySelector(".item").classList.contains("read"), true);
  });

  it("保存場所が使えなくても画面は出る", () => {
    const broken = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); }
    };
    const { doc } = mount({ storage: broken });
    doc.querySelector(".title").click();
    assert.equal(doc.querySelector(".item").classList.contains("read"), true);
  });

  it("取得元の状況に失敗したフィードが出る", () => {
    const { doc } = mount();
    const rows = [...doc.querySelectorAll("#feed-list li")].map((li) => [li.className, li.textContent]);
    assert.deepEqual(rows, [["ok", "✓ Googleニュース 30本"], ["ng", "✗ BBC World 取得できず"]]);
  });
});

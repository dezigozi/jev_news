import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchAllFeeds, fetchText, parseFeed, stripSourceSuffix } from "../src/fetch-feeds.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Google ニュース</title>
<item><title>日銀が利上げを決定 - 日本経済新聞</title><link>https://news.google.com/a</link>
<pubDate>Tue, 23 Sep 2026 03:00:00 GMT</pubDate><source url="https://www.nikkei.com">日本経済新聞</source></item>
<item><title>リンクの無い記事</title></item>
<item><title>&lt;b&gt;タグ&lt;/b&gt;入りの見出し &amp; 記号</title><link>https://example.com/b</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title>Atom の見出し</title><link href="https://example.com/atom"/><updated>2026-09-23T01:00:00Z</updated></entry>
</feed>`;

const RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://b.hatena.ne.jp/"><title>はてブ</title></channel>
<item rdf:about="https://example.com/hatena"><title>はてブの見出し</title><link>https://example.com/hatena</link><dc:date>2026-09-23T02:00:00+09:00</dc:date></item>
</rdf:RDF>`;

const feed = { id: "gn_top", name: "Googleニュース", lang: "ja", hint: null };

describe("parseFeed", () => {
  it("RSS 2.0 を読み、媒体名を外し、リンクの無いものは捨てる", async () => {
    const items = await parseFeed(RSS, feed);
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
      title: "日銀が利上げを決定",
      link: "https://news.google.com/a",
      source: "日本経済新聞",
      published: "2026-09-23T03:00:00.000Z",
      feed: "gn_top",
      lang: "ja",
      hint: null
    });
    assert.equal(items[1].source, "Googleニュース");
    assert.equal(items[1].published, null);
  });

  it("Atom と RSS 1.0（はてブ）も読める", async () => {
    const [atom] = await parseFeed(ATOM, feed);
    assert.equal(atom.title, "Atom の見出し");
    assert.equal(atom.link, "https://example.com/atom");
    const [rdf] = await parseFeed(RDF, feed);
    assert.equal(rdf.title, "はてブの見出し");
    assert.equal(rdf.link, "https://example.com/hatena");
  });
});

describe("stripSourceSuffix", () => {
  it("媒体名が一致したときだけ末尾を外す", () => {
    assert.equal(stripSourceSuffix("A - B - 毎日新聞", "毎日新聞"), "A - B");
    assert.equal(stripSourceSuffix("A - B", "毎日新聞"), "A - B");
    assert.equal(stripSourceSuffix("A - B", ""), "A - B");
  });
});

describe("fetchText", () => {
  it("失敗したらリトライし、最後にだめなら投げる", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) return { ok: false, status: 503 };
      return { ok: true, text: async () => "ok" };
    };
    assert.equal(await fetchText("https://x", { fetchImpl, sleep: async () => {} }), "ok");
    assert.equal(calls, 3);

    await assert.rejects(
      fetchText("https://x", { fetchImpl: async () => ({ ok: false, status: 404 }), sleep: async () => {}, retries: 1 }),
      /HTTP 404/
    );
  });
});

describe("fetchAllFeeds", () => {
  it("1本こけても止まらず、report に失敗を残す", async () => {
    const feeds = [
      { id: "a", name: "A", url: "https://a", lang: "ja", hint: null },
      { id: "b", name: "B", url: "https://b", lang: "ja", hint: "tech" }
    ];
    const fetchImpl = async (url) =>
      url === "https://a" ? { ok: true, text: async () => RSS } : { ok: false, status: 500 };
    const { items, report } = await fetchAllFeeds(feeds, { fetchImpl, sleep: async () => {}, retries: 0, maxPerFeed: 1 });
    assert.equal(items.length, 1);
    assert.deepEqual(report.map(({ id, ok, count }) => ({ id, ok, count })), [
      { id: "a", ok: true, count: 1 },
      { id: "b", ok: false, count: 0 }
    ]);
    assert.match(report[1].error, /HTTP 500/);
  });
});

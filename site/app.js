// じぇぶニュースの画面。data/news.json を読んで、見出しだけを並べる
export const LOW_INSIGHT = 0.3;
export const DIGEST_PER_GENRE = 2;
export const DIGEST_HOURS = 24;
export const PAGE_SIZE = 100;
const READ_KEY = "jev_news.read";
const READ_LIMIT = 5000;

const HOUR = 60 * 60 * 1000;

export function timeAgo(iso, now) {
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  if (diff < 5 * 60 * 1000) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)}時間前`;
  return `${Math.floor(diff / (24 * HOUR))}日前`;
}

export function isLow(item) {
  return typeof item.i === "number" && item.i < LOW_INSIGHT;
}

// 話題性で並べるジャンル（事件・ゴシップ）。低スコアでも隠さない
export function isBuzzGenre(genre) {
  return genre?.rank === "buzz";
}

// 分類できていない見出しは真ん中あたりに置く
const orMiddle = (value) => (typeof value === "number" ? value : 0.5);

function newerFirst(a, b) {
  return a.p < b.p ? 1 : a.p > b.p ? -1 : 0;
}

function insightFirst(a, b) {
  return orMiddle(b.i) - orMiddle(a.i) || newerFirst(a, b);
}

// 話題性が同じなら、たくさんの媒体が書いている方を上に
function buzzFirst(a, b) {
  return orMiddle(b.b) - orMiddle(a.b) || (b.n ?? 0) - (a.n ?? 0) || newerFirst(a, b);
}

function inGenre(items, genre, showLow) {
  const all = isBuzzGenre(genre) || showLow;
  return items.filter((item) => item.g === genre.id && (all || !isLow(item)));
}

// 「きょうのひろがり」：全ジャンルから少しずつ。直近24時間に無ければ5日分から
export function pickDigest(items, genres, now, perGenre = DIGEST_PER_GENRE) {
  const since = new Date(now - DIGEST_HOURS * HOUR).toISOString();
  return genres.map((genre) => {
    const candidates = inGenre(items, genre, false);
    const fresh = candidates.filter((item) => item.p >= since);
    const rank = isBuzzGenre(genre) ? buzzFirst : insightFirst;
    return { genre, items: (fresh.length ? fresh : candidates).sort(rank).slice(0, perGenre) };
  });
}

// sort "rank" = そのジャンルの並べ方（発見度順か話題順）、"time" = 新着順
export function genreItems(items, genre, { sort = "rank", showLow = false } = {}) {
  const rank = isBuzzGenre(genre) ? buzzFirst : insightFirst;
  return inGenre(items, genre, showLow).sort(sort === "time" ? newerFirst : rank);
}

function fold(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase();
}

// 空白で区切った言葉がぜんぶ入っている見出し（訳・媒体名も対象）
export function searchItems(items, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((item) => {
    const haystack = fold(`${item.t} ${item.ja ?? ""} ${item.s}`);
    return words.every((word) => haystack.includes(word));
  }).sort(newerFirst);
}

function loadRead(storage) {
  try {
    const list = JSON.parse(storage?.getItem(READ_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    // 保存場所が使えない・壊れている → 既読なしで表示する（画面は壊さない）
    return new Set();
  }
}

function saveRead(storage, read) {
  try {
    storage?.setItem(READ_KEY, JSON.stringify([...read].slice(-READ_LIMIT)));
  } catch {
    // プライベートモードなどで保存できないときは、このページを開いている間だけ覚えておく
  }
}

function formatStamp(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function init({ doc, data, storage, now = Date.now(), history = null, initialHash = "" }) {
  const $ = (id) => doc.getElementById(id);
  const genres = data.genres;
  const genreById = new Map(genres.map((genre) => [genre.id, genre]));
  const genreName = new Map(genres.map((genre) => [genre.id, genre.name]));
  const read = loadRead(storage);
  const ui = { view: "digest", sort: "rank", showLow: false, query: "", shown: PAGE_SIZE };

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function itemNode(item, { showGenre = false } = {}) {
    const li = el("li", `item${read.has(item.id) ? " read" : ""}`);
    li.dataset.g = item.g ?? "";
    const link = el("a", "title", item.t);
    link.href = item.u;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (item.en) link.lang = "en";
    link.addEventListener("click", () => {
      read.add(item.id);
      saveRead(storage, read);
      li.classList.add("read");
    });
    li.append(link);
    if (item.ja) li.append(el("p", "ja", item.ja));
    const meta = el("p", "meta");
    if (showGenre && item.g) meta.append(el("span", "tag", genreName.get(item.g) ?? item.g));
    meta.append(el("span", "source", item.s));
    meta.append(el("span", "when", timeAgo(item.p, now)));
    if (item.n) meta.append(el("span", "also", `ほか${item.n}件`));
    li.append(meta);
    return li;
  }

  function listNode(items, options) {
    const ul = el("ul", "list");
    for (const item of items) ul.append(itemNode(item, options));
    return ul;
  }

  function moreButton(total) {
    const rest = total - ui.shown;
    if (rest <= 0) return null;
    const button = el("button", "more", `さらに ${Math.min(rest, PAGE_SIZE)}本（残り ${rest}本）`);
    button.type = "button";
    button.addEventListener("click", () => {
      ui.shown += PAGE_SIZE;
      render({ keepScroll: true });
    });
    return button;
  }

  function renderDigest(head, view) {
    head.append(el("h2", "view-title", "きょうのひろがり"));
    head.append(el("p", "lead", `${genres.length}ジャンルから${DIGEST_PER_GENRE}本ずつ。知見が広がる順（事件・ゴシップは話題の順）`));
    for (const { genre, items } of pickDigest(data.items, genres, now)) {
      const section = el("section", "digest");
      section.dataset.g = genre.id;
      const head = el("div", "digest-head");
      head.append(el("h3", "genre-name", genre.name));
      const more = el("button", "to-genre", "もっと見る");
      more.type = "button";
      more.addEventListener("click", () => go(genre.id));
      head.append(more);
      section.append(head);
      section.append(items.length ? listNode(items) : el("p", "empty", "取得できず"));
      view.append(section);
    }
  }

  function renderGenre(head, view) {
    const all = genreItems(data.items, genreById.get(ui.view), { sort: ui.sort, showLow: ui.showLow });
    const title = el("h2", "view-title", genreName.get(ui.view) ?? ui.view);
    title.dataset.g = ui.view;
    head.append(title);
    head.append(el("p", "lead", `${all.length}本`));
    if (!all.length) {
      view.append(el("p", "empty", "取得できず"));
      return;
    }
    view.append(listNode(all.slice(0, ui.shown)));
    const more = moreButton(all.length);
    if (more) view.append(more);
  }

  function renderSearch(head, view) {
    const hits = searchItems(data.items, ui.query);
    head.append(el("h2", "view-title", `「${ui.query.trim()}」`));
    head.append(el("p", "lead", `${hits.length}本（新しい順）`));
    if (!hits.length) {
      view.append(el("p", "empty", "見つからへんかった"));
      return;
    }
    view.append(listNode(hits.slice(0, ui.shown), { showGenre: true }));
    const more = moreButton(hits.length);
    if (more) view.append(more);
  }

  function renderChips() {
    const chips = $("chips");
    chips.replaceChildren();
    const make = (id, label) => {
      const chip = el("button", "chip", label);
      chip.type = "button";
      chip.dataset.view = id;
      if (id !== "digest") chip.dataset.g = id;
      chip.setAttribute("aria-pressed", String(!ui.query && ui.view === id));
      chip.addEventListener("click", () => go(id));
      chips.append(chip);
    };
    make("digest", "TOP");
    for (const genre of genres) make(genre.id, genre.name);
  }

  function render({ keepScroll = false } = {}) {
    renderChips();
    const searching = Boolean(ui.query.trim());
    const controls = $("controls");
    controls.hidden = searching || ui.view === "digest";
    if (!controls.hidden) {
      const buzz = isBuzzGenre(genreById.get(ui.view));
      for (const button of controls.querySelectorAll("[data-sort]")) {
        button.setAttribute("aria-pressed", String(button.dataset.sort === ui.sort));
        if (button.dataset.sort === "rank") button.textContent = buzz ? "話題順" : "発見度順";
      }
      // 事件・ゴシップはもともと全部出すので、切り替えは要らない
      $("low-toggle").hidden = buzz;
      $("show-low").checked = ui.showLow;
      const low = data.items.filter((item) => item.g === ui.view && isLow(item)).length;
      $("low-label").textContent = `小ネタ・宣伝も出す（${low}本）`;
    }
    const head = $("head");
    const view = $("view");
    head.replaceChildren();
    view.replaceChildren();
    if (searching) renderSearch(head, view);
    else if (ui.view === "digest") renderDigest(head, view);
    else renderGenre(head, view);
    if (!keepScroll) doc.defaultView?.scrollTo?.(0, 0);
    const active = $("chips").querySelector('[aria-pressed="true"]');
    active?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }

  function setView(id) {
    ui.view = id === "digest" || genreName.has(id) ? id : "digest";
    ui.shown = PAGE_SIZE;
  }

  function go(id) {
    setView(id);
    ui.query = "";
    $("search").value = "";
    history?.pushState?.(null, "", id === "digest" ? "#" : `#${id}`);
    render();
  }

  const count = data.items.length.toLocaleString("ja-JP");
  $("updated").textContent = `更新 ${formatStamp(data.generatedAt)}（${timeAgo(data.generatedAt, now)}）· ${count}本`;

  const feedList = $("feed-list");
  for (const feed of data.feeds ?? []) {
    feedList.append(el("li", feed.ok ? "ok" : "ng", `${feed.ok ? "✓" : "✗"} ${feed.name}${feed.ok ? ` ${feed.count}本` : " 取得できず"}`));
  }

  $("search").addEventListener("input", (event) => {
    ui.query = event.target.value;
    ui.shown = PAGE_SIZE;
    render();
  });
  $("home").addEventListener("click", () => go("digest"));
  for (const button of $("controls").querySelectorAll("[data-sort]")) {
    button.addEventListener("click", () => {
      ui.sort = button.dataset.sort;
      ui.shown = PAGE_SIZE;
      render();
    });
  }
  $("show-low").addEventListener("change", (event) => {
    ui.showLow = event.target.checked;
    ui.shown = PAGE_SIZE;
    render();
  });

  setView(decodeURIComponent(initialHash.replace(/^#/, "")) || "digest");
  render();

  return {
    ui,
    go,
    popstate(hash) {
      setView(decodeURIComponent(String(hash).replace(/^#/, "")) || "digest");
      ui.query = "";
      $("search").value = "";
      render();
    }
  };
}

async function start() {
  const doc = window.document;
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    // localStorage に触れない環境。既読は覚えないが表示はする
  }
  try {
    const response = await fetch("data/news.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const app = init({ doc, data: await response.json(), storage, history: window.history, initialHash: window.location.hash });
    window.addEventListener("popstate", () => app.popstate(window.location.hash));
  } catch (error) {
    doc.getElementById("updated").textContent = `ニュースを読み込めへんかった（${error.message}）`;
  }
}

if (typeof window !== "undefined" && !window.__JEV_NEWS_TEST__) start();

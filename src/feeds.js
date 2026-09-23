// 取得元の一覧。hint はそのフィードの主なジャンル（Jev への手がかり＋分類できなかったときの仮置き）
const GN_JA = "hl=ja&gl=JP&ceid=JP:ja";

const googleTopic = (topic) => `https://news.google.com/rss/headlines/section/topic/${topic}?${GN_JA}`;
// when:1d で直近1日に絞る（付けないと関連度順で古い記事が混ざる）
const googleSearch = (query) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&${GN_JA}`;

export const FEEDS = [
  { id: "gn_top", name: "Googleニュース", url: `https://news.google.com/rss?${GN_JA}`, lang: "ja", hint: null },
  { id: "gn_nation", name: "Googleニュース 国内", url: googleTopic("NATION"), lang: "ja", hint: "domestic" },
  { id: "gn_world", name: "Googleニュース 国際", url: googleTopic("WORLD"), lang: "ja", hint: "world" },
  { id: "gn_business", name: "Googleニュース ビジネス", url: googleTopic("BUSINESS"), lang: "ja", hint: "business" },
  { id: "gn_tech", name: "Googleニュース テクノロジー", url: googleTopic("TECHNOLOGY"), lang: "ja", hint: "tech" },
  { id: "gn_ent", name: "Googleニュース エンタメ", url: googleTopic("ENTERTAINMENT"), lang: "ja", hint: "culture" },
  { id: "gn_sports", name: "Googleニュース スポーツ", url: googleTopic("SPORTS"), lang: "ja", hint: "sports" },
  { id: "gn_science", name: "Googleニュース 科学", url: googleTopic("SCIENCE"), lang: "ja", hint: "science" },
  { id: "gn_health", name: "Googleニュース 健康", url: googleTopic("HEALTH"), lang: "ja", hint: "health" },
  { id: "gn_q_youth", name: "Googleニュース検索 若者・Z世代", url: googleSearch("若者 OR Z世代"), lang: "ja", hint: "youth" },
  { id: "gn_q_fashion", name: "Googleニュース検索 ファッション", url: googleSearch("ファッション OR コスメ"), lang: "ja", hint: "fashion" },
  { id: "gn_q_food", name: "Googleニュース検索 グルメ・旅行", url: googleSearch("グルメ OR 旅行"), lang: "ja", hint: "food" },
  { id: "gn_q_learning", name: "Googleニュース検索 歴史・教養", url: googleSearch("歴史 OR 教養"), lang: "ja", hint: "learning" },
  { id: "gn_q_life", name: "Googleニュース検索 節約・家計", url: googleSearch("節約 OR 家計"), lang: "ja", hint: "life" },
  { id: "hatena_hot", name: "はてブ 総合", url: "https://b.hatena.ne.jp/hotentry.rss", lang: "ja", hint: null },
  { id: "hatena_life", name: "はてブ 暮らし", url: "https://b.hatena.ne.jp/hotentry/life.rss", lang: "ja", hint: "life" },
  { id: "hatena_knowledge", name: "はてブ 学び", url: "https://b.hatena.ne.jp/hotentry/knowledge.rss", lang: "ja", hint: "learning" },
  { id: "hatena_fun", name: "はてブ おもしろ", url: "https://b.hatena.ne.jp/hotentry/fun.rss", lang: "ja", hint: null },
  { id: "wwd", name: "WWDJAPAN", url: "https://www.wwdjapan.com/feed", lang: "ja", hint: "fashion" },
  { id: "fashionsnap", name: "FASHIONSNAP", url: "https://www.fashionsnap.com/rss.xml", lang: "ja", hint: "fashion" },
  { id: "itmedia", name: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml", lang: "ja", hint: "tech" },
  { id: "gigazine", name: "GIGAZINE", url: "https://gigazine.net/news/rss_2.0/", lang: "ja", hint: "tech" },
  { id: "natalie_music", name: "音楽ナタリー", url: "https://natalie.mu/music/feed/news", lang: "ja", hint: "culture" },
  { id: "bbc_world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en", hint: "world" },
  { id: "gn_us", name: "Google News US", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", lang: "en", hint: "world" },
  { id: "gn_uk", name: "Google News UK", url: "https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en", lang: "en", hint: "world" }
];

// 1フィードから取り込む上限。件数の多いフィード（検索・WWD の100本）に全体が偏らないように
export const MAX_ITEMS_PER_FEED = 50;

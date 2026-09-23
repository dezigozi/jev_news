// ジャンルはここ1か所で決める。id は Jev の選択肢の名前になるので英数字だけ。並び順が画面の並び順
// rank: "buzz" のジャンルは、知見が広がるか（insight）ではなく話題性（buzz）で並べ、低スコアでも隠さない
export const GENRES = [
  { id: "domestic", name: "国内・時事", desc: "日本国内の社会の出来事・災害・行政（事件・裁判は除く）" },
  { id: "crime", name: "事件・裁判", desc: "刑事事件・逮捕・裁判・事故・企業や公人の不祥事", rank: "buzz" },
  { id: "politics", name: "政治・経済", desc: "政治・選挙・外交方針・マクロ経済・金融市場・為替・物価" },
  { id: "world", name: "国際・海外", desc: "海外の出来事・国際情勢・各国の社会" },
  { id: "business", name: "ビジネス・仕事", desc: "企業の動き・業界・働き方・キャリア・経営" },
  { id: "tech", name: "テクノロジー・AI", desc: "AI・IT・ガジェット・ネット・アプリ・サービス" },
  { id: "science", name: "科学・宇宙", desc: "科学研究・宇宙・自然・環境・生き物" },
  { id: "health", name: "健康・医療", desc: "病気・医療・健康法・メンタル・介護" },
  { id: "life", name: "暮らし・マネー", desc: "家計・節約・税金・年金・住まい・子育て・生活の知恵" },
  { id: "youth", name: "若者・Z世代・トレンド", desc: "若者やZ世代の価値観・流行・SNSで話題・新しい消費" },
  { id: "fashion", name: "ファッション・美容", desc: "ファッション・ブランド・コスメ・美容" },
  { id: "culture", name: "エンタメ・カルチャー", desc: "音楽・映画・ドラマ・アニメ・ゲーム・漫画の作品や活動（芸能人の私生活・騒動は除く）" },
  { id: "gossip", name: "芸能・ゴシップ", desc: "芸能人・有名人の熱愛・結婚・離婚・炎上・スキャンダル・SNSで話題の騒動", rank: "buzz" },
  { id: "sports", name: "スポーツ", desc: "スポーツの試合・選手・大会" },
  { id: "food", name: "食・旅・地域", desc: "グルメ・食品・旅行・観光・地域の話題" },
  { id: "learning", name: "学び・教養・歴史", desc: "教育・学び・歴史・文化・言葉・雑学・ものの考え方" }
];

export const GENRE_IDS = GENRES.map((genre) => genre.id);

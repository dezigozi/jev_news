# じぇぶニュース（jev_news）

## 目的
たかたかが知見を広げるために、幅広いジャンル（時事・事件・若者・ファッション・海外・芸能ゴシップ…）のニュースを網羅して、見出しだけを眺めるポータル。スマホでも見る。

## 仕組み
- GitHub Actions（`.github/workflows/update.yml`）が毎時17分に `npm run build` → GitHub Pages に配信。URL: https://dezigozi.github.io/jev_news/
- `src/build.js` の流れ：RSS 26本を取得（音楽ナタリーは GitHub から HTTP 405 になるため Google ニュース検索で代替）（`src/feeds.js`）→ 重複をまとめる（`src/dedupe.js`）→ 新着だけ Jev に聞く（`src/classify.js`）→ 英語は Groq で訳す（`src/translate.js`）→ 5日分を `dist/data/news.json` に書き出し、`site/` をそのまま `dist/` にコピー
- Jev への質問は1見出し1リクエストで3つ：`genre`（16ジャンルから選ぶ）／`insight`（知見が広がるか＝発見度）／`buzz`（世間で話題か＝話題性）
- 前回までの結果は `.cache/state.json`。Actions では `actions/cache` に `state-<run_id>` で保存し、`restore-keys: state-` で一番新しいものを読み戻す
- 画面は `site/`（ビルド不要の HTML＋JS＋CSS）。`site/app.js` は Node からも import できる（テストで使う）。ブラウザでだけ `start()` が動く

## 決定事項
- ジャンルは `src/genres.js` の1か所で決める。`rank: "buzz"` のジャンル（事件・裁判／芸能・ゴシップ）は話題性の順に並べ、発見度が低くても隠さない（たかたかの要望「あえて話題のゴシップや刑事事件も知りたい」）。それ以外は発見度0.3未満を「小ネタ・宣伝」として隠し、トグルで出せる
- 翻訳は Groq（たかたかの指定）。既定モデル `openai/gpt-oss-120b`、`GROQ_MODEL` で変えられる。キーが無ければ訳さずに続ける
- Jev のキーはローカルでは `~/.claude/jev-review.env`、Actions では Secret `JEV_API_KEY`。Groq は Secret `GROQ_API_KEY`
- 分類が1本も通らなかった回は実行を失敗扱いにする（書き出せたサイトは配信する）。全滅した回は見出しの失敗回数を数えない（Jev 側の問題なので）。1本ごとの失敗は3回であきらめ、フィードの仮ジャンルで出す
- state の形を変えたら `src/state.js` の `STATE_VERSION` を上げる → 次の回で全件を分類し直す（約$0.05）
- 検索エンジンには `<meta name="robots" content="noindex">` で載せない。プロジェクトサイトの `robots.txt` はドメイン直下にしか効かないので置いていない
- public リポは60日動きが無いと定期実行が止まるので、`keepalive.yml` が毎月1日に空コミットを積む

## 罠
- Google ニュースの見出しは「見出し - 媒体名」。`<source>` の媒体名と一致したときだけ末尾を外す
- Google ニュースの検索 RSS は `when:1d` を付けないと関連度順で古い記事が混ざる
- 同じ話でも媒体ごとに見出しが違うと、重複としてまとめられない（2-gram Jaccard 0.6 以上だけまとめる。低くすると別の話を誤ってまとめる）
- 手元で見るのは `npm run build` → `npm run preview`（127.0.0.1:3945）

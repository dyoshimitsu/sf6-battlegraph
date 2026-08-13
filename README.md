# sf6-battlegraph

Street Fighter 6 の Buckler's Boot Camp から自分のバトルログを取得し、長期間保存してグラフや集計として閲覧するためのセルフホスト型 Web アプリケーションです。

Buckler で参照できる対戦履歴には件数上限があるため、定期的に履歴を取り込み、過去の試合を失わずに蓄積することを目的としています。

> [!NOTE]
> このプロジェクトは非公式であり、株式会社カプコンおよび Street Fighter 6 とは関係ありません。

## Status

現在は設計段階です。対象プレイヤーとしてユーザーコード `1134991793` を使って初期実装を進めますが、将来的には clone した利用者が自身のユーザーコードと Firebase プロジェクトを設定してセルフホストできる構成にします。

## Goals

- ランク、カジュアル、ルーム、バトルハブを含む全対戦モードを保存する
- Buckler の取得レスポンスを欠損なく保存する
- 1 試合単位の検索・詳細表示を可能にする
- 日付、使用キャラクター、相手キャラクター、モードなどで絞り込む
- LP / MR 推移、勝率、キャラクター別戦績などをブラウザで集計する
- GitHub Pages と Firebase の無料枠で個人運用できるようにする
- 将来的にリポジトリを公開し、各利用者がセルフホストできるようにする

## Architecture

```text
Buckler's Boot Camp
  └─ bookmarklet / collector
       ├─ 現在の Next.js buildId を取得
       ├─ 全対戦モード・全ページを取得
       └─ JSON ファイルとして出力
                    │
                    ▼
GitHub Pages
  └─ React SPA
       ├─ Firebase Authentication
       ├─ インポートと検証
       ├─ 試合データの正規化
       ├─ Firestore への同期
       └─ JavaScript による集計とグラフ表示
                    │
                    ▼
Cloud Firestore
  ├─ raw snapshots
  ├─ normalized matches
  ├─ query chunks
  └─ manifests
```

予定している技術構成は次のとおりです。

- React
- TypeScript
- Vite
- React Router (`HashRouter`)
- Firebase Authentication
- Cloud Firestore
- Recharts
- Vitest
- GitHub Pages
- GitHub Actions

GitHub Pages は静的ホスティングであるため、Buckler の取得処理をサーバーとして配置しません。ログイン済みの Buckler ページ上でコレクターを実行し、出力されたデータを GitHub Pages の同期画面から取り込みます。Buckler の Cookie や CAPCOM ID の認証情報はアプリ、Firestore、GitHub Secretsへ保存しません。

詳細は以下を参照してください。

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Decisions and validation](docs/decisions.md)
- [Repository instructions for Codex](AGENTS.md)

## Visibility and security

初期実装では次の 2 モードを想定します。

- `private`: 管理者だけが読み書きできる
- `public`: 誰でも読み取れ、管理者だけが書き込める

Buckler の raw レスポンスには Cookie やアクセストークンを含めません。raw データも保存対象かつ公開可能なデータとして扱いますが、通常画面では通信量と Firestore の読み取り数を抑えるため読み込みません。

認証情報、Firebase サービスアカウント鍵、Buckler Cookie、個人用エクスポートはリポジトリへコミットしません。

## Data acquisition

Buckler は Next.js の JSON エンドポイントを使用しています。URL に含まれる `buildId` はデプロイごとに変わる可能性があるため固定せず、Buckler ページの `__NEXT_DATA__.buildId` から取得します。

総合履歴だけでは特定モードの古い試合が直近 100 試合から押し出される可能性があるため、全対戦モードのページを取得し、`replay_id` で重複排除します。モード別エンドポイントの正確なパスとレスポンスは実装時に検証します。

## Aggregation policy

Firestore に多数の事前集計を作るのではなく、軽量な試合データを複数試合単位の `queryChunks` にまとめ、ブラウザの JavaScript で集計します。

1 試合 1 ドキュメントを全件読む方式と比べて Firestore の読み取り数を抑えながら、集計軸を後から柔軟に追加できます。試合の完全データは詳細を開いたときだけ読み込みます。

## License

[MIT](LICENSE)

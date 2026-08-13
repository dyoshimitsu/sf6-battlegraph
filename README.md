# sf6-battlegraph

Street Fighter 6 の Buckler's Boot Camp から自分のバトルログを取得し、長期間保存してグラフや集計として閲覧するためのセルフホスト型 Web アプリケーションです。

Buckler で参照できる対戦履歴には件数上限があるため、定期的に履歴を取り込み、過去の試合を失わずに蓄積することを目的としています。

> [!NOTE]
> このプロジェクトは非公式であり、株式会社カプコンおよび Street Fighter 6 とは関係ありません。

## Status

現在は初期実装段階です。collector bundleをブラウザへ読み込み、検証、`replay_id`による重複排除、対象プレイヤー基準の正規化、同期前プレビュー、Firestoreへの同期ができます。保存後はmanifestが示すquery chunkだけを自動で読み込み、期間・モード・キャラクターによる絞り込み、戦績集計、日別トレンド、LP/MRグラフを復元します。対象プレイヤーとしてユーザーコード `1134991793` を使って実装を進めますが、将来的には clone した利用者が自身のユーザーコードと Firebase プロジェクトを設定してセルフホストできる構成にします。

## Development

Node.js 20.19以降を使用します。Firestore Security RulesのテストにはJava 21以降も必要です。

```sh
npm install
npm run dev
```

検証コマンド:

```sh
npm test
npm run test:rules
npm run typecheck
npm run build
```

Firebase Authenticationの管理者判定とFirestore同期を実装しています。管理者ログイン後にcollector JSONを読み込むと、既存履歴と`replay_id`で統合し、raw snapshot、完全な試合、全履歴のquery chunk、manifestをFirestoreへ同期できます。次回以降は`private`構成では管理者ログイン後、`public`構成ではページ表示時に保存済み戦績を自動で表示します。Firebase未設定時は、読み込んだJSONをブラウザ内だけで処理するローカルプレビューとして動作します。

管理者は画面上部の「全データをバックアップ」から、Firestoreに保存したplayer、完全match、raw snapshot/page/part、query chunk、manifest、sync記録を単一JSONへ書き出せます。バックアップ時だけ全対象documentを読み取るため、実行前に確認画面を表示します。ダウンロード前に必須document、対象ユーザー、パス重複、rawのバイト数とSHA-256、分割partの連続性を検証します。

「バックアップを復元」では検証済みJSONだけを同じユーザーコードへ復元します。既存documentを一括削除せず、同じパスをmerge更新します。データ層を最大450 writeずつ保存し、すべて成功した後にmanifestを最後に切り替えます。

Firebaseを接続する場合は`.env.example`を`.env.local`へコピーし、Firebase Consoleで登録したWebアプリの設定と対象ユーザーコードを入力します。

```sh
cp .env.example .env.local
```

Google認証をFirebase Consoleで有効にし、Authenticationの承認済みドメインへローカル開発用の`localhost`と、デプロイ先の`<account>.github.io`を登録してください。管理者として利用するAuthentication UIDと同じIDで、Firestoreに`admins/{uid}`ドキュメントをFirebase Consoleから作成します。管理者ドキュメントをアプリ自身が新規作成する機能はありません。

設定項目:

- `VITE_PLAYER_USER_CODE`: 保存対象のSF6ユーザーコード
- `VITE_DEPLOYMENT_VISIBILITY`: `private`または`public`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Firebase Web設定はブラウザへ配信される公開設定です。サービスアカウント鍵や秘密鍵は使用しないでください。

`npm run build` はWebアプリに加えて、Buckler上で実行するstandaloneな `dist/collector.js` も生成します。現段階の実行手順は[Collector export format](docs/collector-format.md#running-the-collector)を参照してください。

## GitHub Pages deployment

`master`へのpush時にGitHub Actionsがテスト、Firestore Security Rulesテスト、型検査、本番ビルドを行います。Pagesへのデプロイを有効にする場合は、GitHub上でリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定し、**Settings → Secrets and variables → Actions → Variables** に`ENABLE_PAGES_DEPLOY=true`を追加してください。

`ENABLE_PAGES_DEPLOY`が未設定の間は検証だけを実行し、Pages jobはスキップします。privateリポジトリでPagesを利用できない期間もCIを成功状態に保てます。

Pagesを有効にする前に、同じRepository Variables画面へ以下も設定します。これらはFirebase Webクライアントへ配信される公開設定であり、Secretsへ入れる必要はありません。

```text
VITE_PLAYER_USER_CODE
VITE_DEPLOYMENT_VISIBILITY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

`ENABLE_PAGES_DEPLOY=true`なのに必須変数が不足している場合、workflowはFirebase未接続のartifactを公開せず、検証jobを失敗させます。

Pull Requestでは検証だけを行い、Pagesへのデプロイは行いません。Actions画面から手動実行することもできます。

GitHub FreeでPagesを無料利用する場合、リポジトリをpublicにする必要があります。privateのままPagesを利用できるかはGitHubの契約プランに依存します。

## Goals

- ランク、カジュアル、ルーム、バトルハブを含む全対戦モードを保存する
- Buckler の取得レスポンスを欠損なく保存する
- 1試合単位の履歴を欠損なく保存する
- 日付、使用キャラクター、モードで絞り込む
- 日本語と英語を切り替えて利用できる
- LP / MR 推移、勝率、キャラクター別戦績などをブラウザで集計する
- GitHub Pages と Firebase の無料枠で個人運用できるようにする
- 将来的にリポジトリを公開し、各利用者がセルフホストできるようにする

## Architecture

```text
Buckler's Boot Camp
  └─ bookmarklet / collector
       ├─ 現在の Next.js buildId を取得
       ├─ 全モード合算履歴の全ページを取得
       └─ bundleをBattlegraphへ直接送信
                    │
                    ▼
GitHub Pages
  └─ React SPA
       ├─ Firebase Authentication
       ├─ origin検証とbundle検証
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

現在の技術構成は次のとおりです。

- React
- TypeScript
- Vite
- Firebase Authentication
- Cloud Firestore
- Vitest
- GitHub Pages
- GitHub Actions

GitHub Pages は静的ホスティングであるため、Buckler の取得処理をサーバーとして配置しません。Battlegraphから開いたログイン済みBucklerページ上でコレクターを実行し、取得bundleをファイルを介さず起点の画面へ返します。Buckler の Cookie や CAPCOM ID の認証情報はアプリ、Firestore、GitHub Secretsへ保存しません。

詳細は以下を参照してください。

- [Architecture](docs/architecture.md)
- [Collector export format](docs/collector-format.md)
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

Bucklerの総合履歴は全対戦モードを合算した直近100試合を返すものとして扱い、コレクターは総合履歴の全ページだけを取得します。各試合のモードはレスポンス内のbattle typeから判定します。

## Aggregation policy

Firestore に多数の事前集計を作るのではなく、軽量な試合データを複数試合単位の `queryChunks` にまとめ、ブラウザの JavaScript で集計します。

1 試合 1 ドキュメントを全件読む方式と比べて Firestore の読み取り数を抑えながら、集計軸を後から柔軟に追加できます。試合の完全データは詳細を開いたときだけ読み込みます。

## License

[MIT](LICENSE)

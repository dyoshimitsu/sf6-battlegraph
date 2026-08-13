# Architecture

## Objectives

sf6-battlegraph は、常時稼働するバックエンドを持たず、GitHub Pages と Firebase を利用して運用できるセルフホスト型アプリケーションとする。

設計上の優先順位は次のとおり。

1. Buckler から取得できた情報を失わない
2. 同期を繰り返しても重複や破損を起こさない
3. Firestore の読み取り回数を抑える
4. 集計項目を事前に固定しすぎない
5. Buckler の仕様変更後も raw データから再構築できる
6. clone した利用者が自身の環境へデプロイできる

## Components

### Buckler collector

ログイン済みの Buckler ページ上で実行する。初期版はブックマークレットを予定している。

責務:

- `window.__NEXT_DATA__.buildId` から現在の build ID を取得する
- 対象ユーザーコードを確認する
- 全対戦モードを合算した総合履歴の全ページを取得する
- HTTP ステータスとレスポンス形式を検証する
- 取得元、ページ番号、取得日時などのメタデータを付加する
- raw レスポンスを変更せず JSON ファイルとして出力する

コレクターは Firestore に直接書き込まない。これにより、Buckler と Firebase の認証を分離し、取得結果を確認してから再利用可能な形でインポートできる。

### Static web application

React、TypeScript、Vite で構築し、GitHub Pages に配信する。GitHub Pages のサブパスとリロード制約を避けるため `HashRouter` を使用する。

想定ルート:

```text
/#/             dashboard
/#/matches      match history
/#/stats        statistics and charts
/#/sync         import and synchronization
/#/settings     deployment settings
```

責務:

- Firebase Authentication による管理者ログイン
- コレクター出力の読み込みと事前検証
- 同期前プレビュー
- raw snapshot の保存
- replay の正規化と upsert
- query chunk の生成
- raw、match、chunk、sync記録の書き込み完了確認
- manifest の切り替え
- chunk を使ったフィルタ、集計、可視化
- データのエクスポートと再構築

### Firebase Authentication

Google ログインを初期認証方式とする。書き込み権限は Firestore の `admins/{uid}` に存在する Firebase Authentication UID に限定する。

最初の管理者は Firebase Console から登録する。アプリ自身による無認証の初期管理者作成機能は提供しない。

### Cloud Firestore

以下の用途で利用する。

- Buckler raw レスポンスの完全保存
- 正規化した完全な試合データの保存
- ブラウザ集計用の軽量 chunk の保存
- 同期状態と有効な chunk 世代を示す manifest の保存

Firestore は分析データベースとして使用せず、集計は原則としてブラウザで行う。

## Import pipeline

```text
collector JSON
  ↓
file/schema validation
  ↓
user code and response status validation
  ↓
SHA-256 calculation
  ↓
deduplicate raw snapshots
  ↓
merge replay lists by replay_id
  ↓
normalize subject/opponent fields
  ↓
upsert complete match documents
  ↓
build a new query chunk generation
  ↓
atomically switch the manifest
  ↓
mark synchronization complete
```

同期画面には少なくとも以下を表示する。

- 取得モードとページ数
- 取得した replay 数
- 新規、更新、重複件数
- 最古、最新の対戦日時
- 書き込み予定件数
- 検証エラーと parser warning

## Consistency

### Idempotency

- match document ID は `replay_id` とする
- raw page はレスポンスの SHA-256 を記録する
- 同一ファイルを再インポートしても論理的な重複を作らない
- `firstSeenAt` は維持し、再取得時に `lastSeenAt` を更新する

### Chunk generations

表示中に chunk が半端な状態になることを避けるため、既存世代を直接更新しない。

1. 新しい世代 ID で chunk を作成する
2. 全 chunk の保存を確認する
3. manifest の active generation を切り替える
4. 古い世代は後から安全に削除可能にする

同期が途中で失敗した場合、通常画面は以前の active generation を継続して読む。

## Read path

通常の表示では次の順序で読み取る。

1. player metadata
2. active manifest
3. 選択期間に該当する query chunks
4. JavaScript でフィルタ・集計
5. 詳細表示時だけ完全な match document

raw snapshots は再解析、障害調査、エクスポート時にのみ読む。

## Visibility

デプロイ単位で次のモードを選択可能にする。

- `private`: 管理者のみ読み書き可能
- `public`: 読み取りは公開、書き込みは管理者のみ

raw は Cookie やアクセストークンを含まないことをインポート時に検証する。公開モードでも通常画面が raw を読み込まない理由は秘匿ではなく、読み取り数、通信量、処理量を抑えるためである。

公開モードは Buckler 上で消える過去の履歴も長期間公開する。この性質をデプロイ所有者が理解したうえで選択するものとする。

## Deployment

- push 時に GitHub Actions で型検査、テスト、build を実行する
- `master` branch の成功した build artifact を GitHub Pages へデプロイする
- Pull Request では検証だけを行い、デプロイ権限を付与しない
- Pages の書き込み権限と OIDC token は deploy job だけに付与する
- Firebase Web 設定とユーザーコードはデプロイ環境から注入する
- Firebase サービスアカウント鍵や Buckler Cookie は使用しない

将来の自動同期では、現在と同じ parser と repository interface を Node.js から再利用できるよう、domain logic を React や Firebase SDK に依存させない。

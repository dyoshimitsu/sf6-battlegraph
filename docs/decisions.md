# Decisions and validation

## Implementation status

Vite / React / TypeScript の静的 SPA と Buckler import parser を実装した。

- collector bundle または単一ページの raw JSON をブラウザで選択またはドロップできる
- `common.statusCode`、`sid`、ページ情報、replay の必須識別情報を検証する
- 対象ユーザーが各 replay の player 1 / player 2 の一方に存在することを確認する
- ページ数、試合数、期間、battle type、warning を同期前に表示する
- 現段階ではファイルを外部へ送信せず、Firestore への書き込みも行わない
- parser は React と Firebase に依存しない純粋な TypeScript として実装する
- bundle 内の複数モード・複数ページを検証し、`replay_id` で重複排除する
- 対象ユーザーが player 1 / player 2 のどちらでも `subject` と `opponent` に正規化する
- 同じ replay が総合・モード別履歴の双方にある場合は全 `sourceTypes` を保持する

Buckler 上で bundle を生成する standalone collector も実装した。現在の Buckler ページから build ID、locale、ユーザーコードを解決し、全モードをページングして、完了後に bundle をダウンロードする。途中の HTTP・認証・形式エラーでは不完全な bundle を出力しない。

正規化済み試合に対するクライアント集計も実装した。

- 期間は `Asia/Tokyo` の暦日で両端を含めて絞り込む
- モード、使用キャラクター、相手キャラクターを組み合わせて絞り込む
- 全体、使用キャラクター別、相手キャラクター別の勝敗と勝率を計算する
- 勝率の母数は勝敗を判定できた試合とし、draw / unknown は別に表示する
- 直近10試合を正規化済みデータから表示する

次の段階では、実際の Buckler に対してモード別 endpoint と round result の意味を検証する。勝敗は現時点では、提供されたサンプルから観察した「各 `round_results` の非ゼロ値がそのプレイヤーのラウンド勝利を表す」という規則に基づく推定である。

GitHub Pages の検証・デプロイ workflow を実装した。`master`へのpushと手動実行で、テスト・型検査・Webアプリとstandalone collectorのビルドがすべて成功した場合だけPages artifactをデプロイする。Pull Requestでは検証だけを実行する。

## Confirmed decisions

### Hosting and persistence

- UI は GitHub Pages にホストする静的 SPA とする
- 永続化には Cloud Firestore を使用する
- Firebase Authentication で管理者を識別する
- 常時稼働する独自バックエンドは初期版に持たない
- 対象ユーザーコードの初期値は `1134991793`

### Acquisition

- Buckler のログイン済みブラウザ上でコレクターを実行する
- Next.js の JSON エンドポイントを使用し、HTML scraping は行わない
- build ID は固定せず `__NEXT_DATA__.buildId` から取得する
- ランク、カジュアル、ルーム、バトルハブを含む全対戦モードを保存する
- 総合履歴とモード別履歴を取得し、`replay_id` で統合する
- Buckler Cookie、CAPCOM ID のパスワード、Firebase Admin 鍵は保存しない

### Storage

- raw レスポンスを完全保存する
- replay object の全フィールドを complete match に保存する
- 検索用の非正規化フィールドを併記する
- raw、matches、query chunks、manifests の各層を持つ
- raw は通常表示で取得しないが、公開可能な保存データとして扱う
- 集計は原則としてブラウザの JavaScript で行う

### Access

- `private`: 管理者だけが読み書き可能
- `public`: 誰でも読み取り可能、管理者だけが書き込み可能
- デプロイ所有者がモードを選択する
- 表示で隠された値がブラウザから確認できること自体は脅威として扱わない。Buckler に正規ログインできる利用者が公式から同じデータを取得できるという前提に立つ
- 書き込みと改ざん防止は別問題として、常に管理者へ限定する

## Observed Buckler response

提供されたサンプルで以下を確認した。

- `pageProps.replay_list` に replay が格納される
- `current_page` と `total_page` が存在する
- 1 ページに 10 replay が含まれる
- サンプルでは `total_page` が 10 で、総合履歴は直近 100 replay
- `replay_id` が存在する
- `uploaded_at` は Unix 秒として扱える
- `battle_version` が存在する
- 対象ユーザーは player 1 または player 2 のどちらにもなり得る
- player は `player.short_id` で識別できる
- LP、MR、ランク、キャラクター、入力タイプ、round results が含まれる
- `common.statusCode` で成功・認証エラーを確認できる
- 未認証リクエストでは 403 レスポンスとなる

## Items to validate during implementation

以下は未確認のため、推測を固定仕様にしない。

### Endpoints

- 総合、ランク、カジュアル、ルーム、バトルハブの正確な JSON endpoint path
- 各 endpoint の query parameters
- モード別の `total_page` 上限
- 総合とモード別で replay payload が同一か

### Battle semantics

- 全 `replay_battle_type` と `replay_battle_sub_type` の対応
- `round_results` の全コードと、勝敗・引き分け・切断の意味
- LP / MR が試合前と試合後のどちらを表すか
- placement、Master、Legend、特殊対戦でのフィールド差
- replay ID の安定性と一意性

未知の値は raw のまま保存し、正規化側では `unknown` と warning を生成する。

### Limits and reliability

- raw page の実際の UTF-8 サイズ
- Firestore document 分割の安全なサイズ
- Buckler のレート制限
- ページ取得中に新しい試合が追加された場合の重複・欠落
- セッション失効時のレスポンス
- build ID 変更時の動作
- Firestore batch write の分割単位

## Time policy

- 正本の時刻は Firestore Timestamp と Unix 秒で保持する
- 画面表示は `Asia/Tokyo`
- 日付フィルタと `playedDate` も `Asia/Tokyo` 基準
- 日付範囲は開始を含み、終了翌日の 00:00 未満とする

## Operational constraints

Buckler の履歴上限を越えてから同期すると、その間の replay を復元できない可能性がある。全対戦モードを漏れなく蓄積するには、各モードで 100 試合を越える前に同期する必要がある。

初期版は手動同期とする。GitHub Actions に Buckler Cookie を保存する自動同期は、セッション失効、秘密情報管理、アクセス制御、運用安定性を別途評価してから追加する。

Buckler の JSON endpoint は公開 API として提供されているものではない。取得頻度を抑え、仕様変更やアクセス停止を通常の障害として扱えるようにする。

## Repository publication policy

将来リポジトリを public にしても、以下はコミットしない。

- Buckler Cookie
- Firebase サービスアカウント秘密鍵
- 実際の raw battle log
- 個人用エクスポート
- ローカルの認証セッション

リポジトリには `.env.example`、Firestore Rules、indexes、セットアップ手順を含め、clone した利用者が自身の Firebase プロジェクトとユーザーコードを設定できるようにする。

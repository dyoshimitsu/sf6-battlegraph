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
- 互換性・調査目的で複数sourceを読み込んだ場合は、同じreplayの全`sourceTypes`を保持する

Buckler 上で bundle を生成する standalone collector も実装した。現在の Buckler ページからbuild ID、locale、ユーザーコードを解決し、全モード合算の総合履歴をページングして、完了後にbundleをダウンロードする。途中のHTTP・認証・形式エラーでは不完全なbundleを出力しない。

正規化済み試合に対するクライアント集計も実装した。

- 期間は `Asia/Tokyo` の暦日で両端を含めて絞り込む
- モード、使用キャラクター、相手キャラクターを組み合わせて絞り込む
- 全体、使用キャラクター別、相手キャラクター別の勝敗と勝率を計算する
- 勝率の母数は勝敗を判定できた試合とし、draw / unknown は別に表示する
- 直近100試合を正規化済みデータから表示し、各ラウンドの勝敗と決着方法を併記する
- query chunkを東京時間の月単位、最大250試合、UTF-8実測700 KiB以下で新しいgenerationへ分割する
- query chunkには現在の一覧・集計・LP/MRグラフ・ラウンド表示を再構築できるフィールドを保持する

`round_results` は Buckler 公式表示が参照する `icon_result{code}_{side}.png` を確認し、`0=敗者側`、`1=V（通常KO）`、`2=C（削り）`、`3=T（タイムオーバー）`、`4=D（ドロー）`、`5=OD`、`6=SA`、`7=CA`、`8=P（パーフェクト）` として表示する。未知のコードは捨てずに `#<code>` と表示する。

GitHub Pages の検証・デプロイ workflow を実装した。`master`へのpushと手動実行で、テスト・型検査・Webアプリとstandalone collectorのビルドがすべて成功した場合だけPages artifactをデプロイする。Pull Requestでは検証だけを実行する。

Firebase Web設定はVite環境変数から読み込み、必須4項目の一部だけが設定された状態をエラーにする。未設定時はローカルプレビューを維持する。設定済みの場合はGoogleポップアップ認証を使い、`admins/{uid}`ドキュメントの存在で同期管理者を判定する。初期管理者はFirebase Consoleで作成し、クライアントからの自己登録は許可しない。

Firestore Security Rulesは`settings/deployment.visibility`を参照し、`private`では管理者だけに読み取りを許可し、`public`ではplayer配下の読み取りを公開する。書き込みはどちらのモードでも`admins/{uid}`登録者だけに許可する。管理者ドキュメントはクライアントから作成・変更・削除できない。Rules EmulatorのテストをCIで実行し、成功後にだけPagesをデプロイする。

privateリポジトリでPagesを利用できない期間は、Repository Variable `ENABLE_PAGES_DEPLOY`を未設定にして検証jobだけを実行する。Pagesを利用可能になった時点で`true`を設定し、成功した検証artifactだけをデプロイする。

Firestore同期前に純粋なTypeScriptでwrite planを生成する。player metadata、raw snapshot/page、完全match、query chunk、sync記録はmanifestより先に書き、全書き込み成功後にmanifestのactive generationを切り替える。raw pageとcomplete matchには元レスポンス・replay objectを保持する。

UIは日本語と英語に対応する。初回はブラウザ言語から選択し、利用者の選択を`localStorage`へ保存する。翻訳は軽量な型付き辞書で管理し、両言語のキーと埋め込み変数が一致することをテストする。デザインはチャコールを基調に、ライムを状態・主要操作のアクセントとして使う。

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
- 総合履歴は全モード合算の直近100試合を返すものとして扱い、通常は総合履歴だけを取得する
- モード別endpointは通常の収集では使用しない
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
- 総合履歴が常に全モード合算100試合であるか

### Battle semantics

- 全 `replay_battle_type` と `replay_battle_sub_type` の対応
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

Bucklerの総合履歴上限を越えてから同期すると、その間のreplayを復元できない可能性がある。全対戦モードを漏れなく蓄積するには、合算で100試合を越える前に同期する必要がある。

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

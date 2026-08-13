# Decisions and validation

## Implementation status

Vite / React / TypeScript の静的 SPA と Buckler import parser を実装した。

- collector bundleをBucklerからorigin検証済み`postMessage`で直接受信できる
- `common.statusCode`、`sid`、ページ情報、replay の必須識別情報を検証する
- 対象ユーザーが各 replay の player 1 / player 2 の一方に存在することを確認する
- ページ数、試合数、期間、battle type、warning を同期前に表示する
- Firebase未設定時はファイルを外部へ送信せず、ブラウザ内だけで処理する
- parser は React と Firebase に依存しない純粋な TypeScript として実装する
- bundle 内の複数モード・複数ページを検証し、`replay_id` で重複排除する
- 対象ユーザーが player 1 / player 2 のどちらでも `subject` と `opponent` に正規化する
- 互換性・調査目的で複数sourceを読み込んだ場合は、同じreplayの全`sourceTypes`を保持する

Buckler 上で bundle を生成する standalone collector も実装した。現在の Buckler ページからbuild ID、locale、ユーザーコードを解決し、全モード合算の総合履歴をページングして、完了後に起点のBattlegraph画面へbundleを直接返す。途中のHTTP・認証・形式エラーでは不完全なbundleを送信しない。

日常のバトルログ取得ではJSONファイルを介さない。BattlegraphからBucklerを開いてwindow参照を確立し、collector protocol version 1のmessageを受信する。受信側はBuckler originを固定検証し、既存parserでユーザーコードと全raw responseを再検証する。Firestoreへの書き込みはFirebase認証を保持するBattlegraph側だけが行う。

取得操作はManifest V3 Chrome拡張で自動化する。content scriptのmatch patternをBuckler Battle Logだけに限定し、Battlegraphの接続fragmentがある場合だけmain worldでcollectorを開始する。通常閲覧では動作しない。導入後はBattlegraphのボタン一回でページ表示、取得、返送まで行う。

Bucklerの`window.opener`が別origin間で維持されることに依存しない。Battlegraph側content script、extension service worker、Buckler側content scriptをruntime messageで接続し、service workerが収集ごとに起点タブとBucklerタブをメモリ上で対応付ける。取得bundleは対応する起点タブだけへ返す。

管理者がBattlegraphから取得を開始した場合、完全bundleの受信と検証成功を契機にFirestore同期を自動開始する。成功後は保存済みデータへ表示を切り替える。認証・権限不足時は同期を開始せず、同期失敗時は検証済みbundleを画面に保持して手動再試行を可能にする。

Bucklerの収集タブは`active: false`で背面に開き、Battlegraphからフォーカスを移さない。bundleの返送成功後に収集タブを閉じる。

Chrome拡張はブラウザへ一度導入すればセッションをまたいで維持されるため、接続カードを通常画面へ常設しない。取得・同期操作は管理者ヘッダーへ集約する。初回導入と更新方法はリポジトリのドキュメントで案内する。

Buckler認証切れで接続フラグ付き要求がBattle Log以外のBuckler画面へ遷移した場合、拡張は`authentication-required`を起点タブへ通知し、収集タブを前面へ出す。ログイン後に元のBattle Logへ戻れば既存のタブ対応を維持したまま収集を再開する。認証情報は拡張へ保存しない。

拡張の許可originはmanifestへ固定記述せず、`VITE_CONNECTOR_ORIGINS`からビルド時生成する。アプリは期待するmanifest versionと導入済み拡張が通知するversionを比較し、未導入または不一致の場合だけ更新リンクを表示する。unpacked extensionはChromeが自動更新しないため、更新zipの展開と拡張再読み込みは管理者が行う。

通常画面の情報階層は、ヘッダーのプレイヤー文脈と取得操作、フィルタ対象外の直近100試合、フィルタを内包する戦績分析の順とする。バックアップ・復元・ログアウトは管理メニューへ退避する。同期状態は右上の通知として本文から分離し、成功通知だけ6秒後に閉じ、エラーと再認証要求は残す。

LP・MR推移は選択キャラクターについてフィルタ後の直近100試合を既定表示する。日別記録は最新対戦日を終点とする直近14暦日を表示し、対戦しなかった日も0試合として含める。

正規化済み試合に対するクライアント集計も実装した。

- 期間は `Asia/Tokyo` の暦日で両端を含めて絞り込む
- モードと使用キャラクターを日付範囲と組み合わせて絞り込む
- 全体、使用キャラクター別、相手キャラクター別の勝敗と勝率を計算する
- 相手キャラクターは0戦を含む全rosterを表示し、対戦済みは対戦数降順、0戦は指定roster順に並べる。未知の新キャラクターはRANDOM直前に置く
- 使用キャラクターと相手キャラクターは、キャラ名・大きな対戦数・勝敗・勝率バーの共通カードUIで表示する
- 東京時間の日別に試合数、勝敗、勝率を集計し、選択中フィルターを反映した直近14プレイ日のトレンドを表示する
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

raw pageはJSON文字列のUTF-8実測が700 KiB以下ならinlineで保存し、超える場合は700 KiB以下のpartへ分割する。親documentに元のバイト数、part数、SHA-256を保存し、Unicodeを含むJSONも連結して完全復元できることをテストする。

Firestore adapterは1 batchあたり450 writeを上限とし、全data batchのcommit後にmanifestを単独commitする。matchの`sourceSyncIds`は`arrayUnion`で追記し、同期時刻はFirestore server timestampを使用する。同期UIは管理者にだけ表示し、進捗と成功・失敗を通知する。

保存済み戦績の表示では、最初にmanifestを1 document読み、そのactive generationに列挙されたquery chunkだけを読む。generation、chunk数、試合数がmanifestと一致しない不完全な世代は表示しない。`private`では管理者ログイン後、`public`では認証なしで自動読込し、raw snapshotやcomplete matchは通常表示では読まない。

再同期時はactive generationのquery chunkと今回取得した試合を`replay_id`で統合し、全履歴を含む新generationを作る。重複した試合は今回の完全なreplayを優先し、既知のsource typeは和集合で保持する。既存のcomplete matchをquery chunk由来の縮小データで上書きしない。

同期完了時は、今回初めて保存した試合、既存と重複して再取得した試合、今回のBuckler履歴には含まれないが保存を維持した過去試合、保存後の合計件数をそれぞれ表示する。

通常表示で読み込んだactive generationはブラウザ内に保持し、その後の同期計画にも再利用する。JSON選択後に同じmanifestとquery chunkを再読込せず、同期前から件数内訳を表示する。起動時の読込完了前に同期する場合だけ、安全のため同期直前に既存世代を取得する。

完全matchの詳細画面は初期スコープに含めない。現在の一覧・集計に必要な情報はquery chunkに保持し、完全matchとrawは再解析、デバッグ、将来のエクスポート用途として保存を継続する。

query chunkはactive generationと直前1世代だけを保持する。同期時は新manifestへ直前世代と削除予定IDを先に記録し、2世代以上前を削除してから削除予定を解除する。manifest切替前の失敗では旧activeを維持し、切替後の整理失敗では新activeを利用しながら次回同期で削除を再試行する。

sync記録はdata batchとともに`prepared`で保存し、manifest有効化と旧世代整理の完了後にだけ`complete`へ更新する。途中失敗した記録は`prepared`のまま残し、同期がどの段階で中断したかを後から判別できるようにする。

raw snapshot親documentも最初は`prepared`と`startedAt`を保存し、全pageを含む同期成功後にsync記録と同じ最終batchで`complete`と`completedAt`を保存する。page保存の途中で失敗したsnapshotを完全データとして扱わない。

管理者はFirestoreの全保存層をパス付きdocument配列として単一JSONへバックアップできる。通常表示では実行せず、明示操作と確認後にだけ完全match、raw snapshot/page/partを含む全対象を読み取る。ダウンロード前にformat、version、対象ユーザー、必須document、重複パス、rawのUTF-8バイト数とSHA-256、partの連続性、JSON復元を検証する。integrity metadata導入前に保存したraw pageはlegacy inlineとして許容する。

復元は管理者のファイル選択と確認後にだけ実行する。対象ユーザーコードを一致確認し、既存データを削除せず同じdocument pathへmergeする。JSON化されたFirestore Timestampを元の型へ戻し、全data batchの成功後にmanifestを最後に書くことで、不完全なquery generationを有効化しない。

バックアップ内の`settings/deployment.visibility`は復元しない。復元先アプリの`VITE_DEPLOYMENT_VISIBILITY`を正として設定documentを上書きし、public環境のバックアップをprivate環境へ戻した際に意図せず公開されることを防ぐ。

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

manifestへ最終同期日時を保存し、画面では7日経過で注意、14日経過で強い警告を表示する。既存manifestに同期日時がない場合は、時刻を含む同期IDから復元する。この警告は試合数を直接把握できないための安全側の目安であり、短期間に100試合以上プレイする場合はより頻繁に同期する。

### Long-term scale target

全期間集計の初期目標を10,000試合とする。合成データによる回帰テストでは、全期間集計と絞り込み、およびFirestore query chunk生成をそれぞれ2秒以内、manifestを含む初期読み込みを50 reads以内に制限する。2026-08-13の開発VMでは集計・絞り込み93ms、chunk生成171msだった。実端末やブラウザでの時間を保証する値ではないが、アルゴリズムの大幅な性能劣化をCIで検出する基準として使う。

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

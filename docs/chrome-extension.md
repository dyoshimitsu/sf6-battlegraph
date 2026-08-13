# Chrome connector

SF6 Battlegraphは、BucklerのログインCookieを外部サーバーへ保存せずに取得を自動化するため、Manifest V3のChrome拡張を使用する。

## Installation

開発環境では次の手順で一度だけ導入する。

1. `npm run build`を実行する
2. Chromeで`chrome://extensions`を開く
3. 「デベロッパー モード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」を選択する
5. このリポジトリの`dist/extension`を指定する

本番ビルドでは`dist/sf6-battlegraph-extension.zip`も生成する。Battlegraphからダウンロードする際は、バージョンとUTC日時を含む重複しないファイル名になる。ZIPを展開すると`sf6-battlegraph-connector-v<version>`フォルダが1つ作られるため、そのフォルダをChromeへ読み込む。

開発時もViteが同じoriginの`/sf6-battlegraph-extension.zip`としてビルド済みZIPを配信する。別ポートからのダウンロードにするとChromeが指定ファイル名を無視するため、connector用preview serverは不要とする。ZIPがまだない場合は先に`npm run build`を実行する。

Battlegraphは導入済み拡張のversionを検出する。未導入またはアプリの期待versionと異なる場合だけ、管理者ヘッダーへ「Chrome拡張を導入／更新」を表示する。リンクを押すと画面内にも次の手順を表示する。

検出状態にかかわらず、管理メニューの「Chrome拡張をダウンロード」からいつでも最新版を再取得できる。

1. ダウンロードしたZIPを展開する
2. `chrome://extensions`で古いBattlegraph Connectorを削除する
3. デベロッパーモードを有効にし、新しいバージョン付きフォルダを読み込む
4. Battlegraphのページを再読み込みする

拡張は永続データを持たないため、削除してもFirestoreの戦績やBucklerの認証情報は失われない。導入後にBattlegraphを再読み込みする。

cloneした利用者は`.env.local`またはGitHub Repository Variablesの`VITE_CONNECTOR_ORIGINS`へ配信originをカンマ区切りで設定する。例: `http://localhost:5173,https://alice.github.io`。ビルド時にChromeのmatch patternへ変換し、パス付きURLや未対応protocolは拒否する。

## Usage

1. Bucklerへログインしておく
2. Battlegraphで「Bucklerから取得」を押す
3. 拡張のbackgroundがBattle Logを背面タブで開き、Battlegraphタブと対応付ける
4. 接続フラグ付きBattle Logページだけで自動的に全ページを取得する
5. 完全なcollector bundleを拡張内部のmessage経由で元のBattlegraphタブへ返す
6. Battlegraphが検証後にFirestore同期と画面更新を続けて実行し、Bucklerタブを閉じる

通常のBuckler閲覧では接続フラグがないため収集しない。取得失敗時は不完全なbundleを返さない。

Buckler認証が切れている場合、拡張は認証画面への遷移を検出して収集タブを前面へ出す。ユーザーがログインしBattle Logへ戻ると、同じ要求の取得と同期を自動再開する。10分以内にログインが完了しない場合、Battlegraph側の待機表示を解除する。

## Permissions and isolation

- 収集content scriptの対象は`https://www.streetfighter.com/6/buckler/*/profile/*/battlelog*`だけ
- Battlegraph側content scriptの対象は`VITE_CONNECTOR_ORIGINS`で明示したoriginだけ
- Bucklerと同じmain worldでsame-origin requestを行い、既存のログインCookieをブラウザ自身に送信させる
- CookieをJavaScriptで読み取らず、bundle、Firestore、GitHubへ保存しない
- bundleは一時的に対応付けたBattlegraphタブへだけ返信し、拡張ストレージへ保存しない
- Battlegraph側はprotocol versionと完全なbundle schemaを再検証する

この拡張はChrome Web Storeへ公開せず、セルフホスト利用者が自身のビルドを手動導入する前提とする。将来ストア配布する場合は、拡張の署名、更新経路、公開サイトoriginの許可方法を別途設計する。

# Chrome connector

SF6 Battlegraphは、BucklerのログインCookieを外部サーバーへ保存せずに取得を自動化するため、Manifest V3のChrome拡張を使用する。

## Installation

開発環境では次の手順で一度だけ導入する。

1. `npm run build`を実行する
2. Chromeで`chrome://extensions`を開く
3. 「デベロッパー モード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」を選択する
5. このリポジトリの`dist/extension`を指定する

本番ビルドでは`dist/sf6-battlegraph-extension.zip`も生成する。zipを展開し、同じ方法で展開先を読み込める。

## Usage

1. Bucklerへログインしておく
2. Battlegraphで「Bucklerから取得」を押す
3. 拡張が接続フラグ付きBattle Logページだけで自動的に全ページを取得する
4. 完全なcollector bundleが起点のBattlegraph画面へ返り、従来と同じ検証と同期前プレビューを通る

通常のBuckler閲覧では接続フラグがないため収集しない。取得失敗時は不完全なbundleを返さない。

## Permissions and isolation

- content scriptの対象は`https://www.streetfighter.com/6/buckler/*/profile/*/battlelog*`だけ
- Bucklerと同じmain worldでsame-origin requestを行い、既存のログインCookieをブラウザ自身に送信させる
- CookieをJavaScriptで読み取らず、bundle、Firestore、GitHubへ保存しない
- bundleの返信先originはBattlegraphがBuckler URLのfragmentへ渡した値に限定する
- Battlegraph側も送信元が`https://www.streetfighter.com`であることとprotocol versionを検証する

この拡張はChrome Web Storeへ公開せず、セルフホスト利用者が自身のビルドを手動導入する前提とする。将来ストア配布する場合は、拡張の署名、更新経路、公開サイトoriginの許可方法を別途設計する。

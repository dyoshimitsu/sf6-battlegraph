# Contributing

このプロジェクトへの変更は、小さく検証可能な単位で行います。プロダクト上の制約と設計判断は、先に[README](README.md)、[Architecture](docs/architecture.md)、[Data model](docs/data-model.md)、[Decisions](docs/decisions.md)を確認してください。

## Development workflow

Node.js 20.19以降を使用します。Firestore Security RulesのローカルテストにはJava 21以降も必要です。

```sh
npm ci
npm run format
npm run check
npm test
npm run typecheck
npm run build
npm run test:rules
```

`npm run format`はBiomeで対応ファイルを整形します。`npm run check`はフォーマット差分とLint違反を検出し、ファイルを変更しません。コミット前には少なくとも`check`、`test`、`typecheck`、`build`を実行してください。

## Coding conventions

- TypeScriptは`strict`を維持し、`any`による型回避を追加しない
- Bucklerの解析、正規化、集計、保存計画はReactやFirebaseから独立した純粋関数を優先する
- 外部入力は境界で検証し、未確認の値やフィールドを黙って破棄しない
- 時刻の正本はUnix秒またはFirestore Timestampとし、画面の日付処理は`Asia/Tokyo`で行う
- 非同期処理は意図を明示して`await`または`void`で扱い、未処理のPromiseを残さない
- React Hookの依存関係を省略しない。例外が必要な場合は、対象行だけを理由付きで抑制する
- 操作要素には適切なHTML要素を使い、`button`には`type`を明記する
- UI文言を追加するときは日本語・英語の両方を追加し、翻訳キー整合性テストを維持する
- CSSのフォント指定には汎用フォントのフォールバックを含める
- テストデータには実在するユーザーコード、プレイヤー名、認証情報を使用しない

自動整形の正本は[biome.json](biome.json)です。個人のエディター設定で異なるスタイルを上書きしないでください。

## Tests and documentation

振る舞いを変更する場合は、同じ変更で回帰テストを追加または更新します。特にparser、モード判定、重複排除、日時境界、chunk生成、同期の整合性、Firestore Rulesはテストで固定します。

確認済みのBuckler挙動や製品判断を変更した場合は`docs/decisions.md`を更新します。推測は確認済み仕様として記載せず、未知値はrawへ保持します。

## Git conventions

- ユーザーから別の指示がない限り`master`だけを使用する
- 変更目的を一つに絞ったコミットを作る
- コミットメッセージは`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`などのConventional Commit形式を使う
- push、公開、デプロイは明示的な依頼がある場合だけ行う
- コミット前に秘密情報や個人のバトルログが含まれていないことを確認する

## Releases

- アプリとChrome拡張は同じSemantic Versionを使用し、`package.json`、`package-lock.json`、`extension/manifest.json`を同時に更新する
- 安定版タグは`v<major>.<minor>.<patch>`形式の注釈付きGitタグとする
- 利用者に影響する変更は`CHANGELOG.md`へ記録する
- release前に`npm run check`、`npm test`、`npm run typecheck`、`npm run build`を実行する
- GitHub Releaseには同じバージョンの`sf6-battlegraph-connector-v<version>.zip`を添付する
- タグとReleaseは、対象コミットの`verify`が成功した後に公開する

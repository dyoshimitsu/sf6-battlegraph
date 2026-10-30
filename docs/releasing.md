# Release procedure

このプロジェクトのリリースは`master`から作成する。バージョンタグ、GitHub Release、Chrome connector ZIPは必ず同じバージョンに揃える。

## 1. リリース内容を確定する

1. `git status --short`で意図しない変更がないことを確認する。
2. [CHANGELOG](../CHANGELOG.md)の`Unreleased`を`[x.y.z] - YYYY-MM-DD`へ移し、利用者に見える変更を`Added`、`Changed`、`Fixed`、`Security`へ整理する。
3. `package.json`、`package-lock.json`、`extension/manifest.json`のversionを同じ`x.y.z`に更新する。拡張のversionはZIP名、導入済み拡張の更新検知、Release添付ファイル名に使われる。
4. READMEの最新安定版表記と、変更されたセットアップ・機能説明を更新する。

## 2. 検証と配布ZIPの作成

Node.js 26以降で実行する。

```sh
npm run format
npm run check
npm test
npm run test:rules
npm run typecheck
npm run build
sha256sum dist/sf6-battlegraph-connector-vx.y.z.zip
```

`npm run build`はWebアプリ、Chrome connector、`dist/sf6-battlegraph-connector-vx.y.z.zip`を生成する。ReleaseにはこのZIPを添付し、SHA-256をリリース本文に記録する。

## 3. コミット・タグ・push

変更内容を確認してから、リリースコミットと注釈付きタグを作成する。

```sh
git add CHANGELOG.md README.md package.json package-lock.json extension/manifest.json
git commit -m "chore: release vx.y.z"
git tag -a vx.y.z -m "vx.y.z"
git push origin master
git push origin vx.y.z
```

タグは必ずリリースコミットを指す。まだpushしていないローカルタグを作り直す必要がある場合だけ、先に`git tag -d vx.y.z`で削除してから付け直す。すでに公開したタグは移動・上書きしない。

## 4. GitHub Release

Release本文は[v1.0.0](https://github.com/dyoshimitsu/sf6-battlegraph/releases/tag/v1.0.0)と同じ構成にする。

1. 冒頭に日本語でリリース概要を書く。
2. `## Highlights`に主要な利用者向け変更を箇条書きで記載する。
3. 対象タグの`CHANGELOG.md`へのリンクを付ける。
4. `## Chrome connector`に、ZIPの展開・旧版削除・展開後フォルダ読み込みの手順を記載する。
5. SHA-256をコード表示で記載する。

例:

```sh
gh release create vx.y.z dist/sf6-battlegraph-connector-vx.y.z.zip \
  --title "vx.y.z" \
  --notes-file /tmp/sf6-battlegraph-release/vx.y.z-notes.md
```

既存Releaseの本文を修正するときは`gh release edit vx.y.z --notes-file ...`を使う。Release作成前にタグをpushしておく。

## 5. 公開後の確認

1. `gh release view vx.y.z`でtag、公開状態、添付ZIPを確認する。
2. pushで起動したGitHub Actionsの`verify`と`deploy`が成功したことを確認する。
3. Pages上で拡張の更新リンクと配布ZIP名が`x.y.z`になっていることを確認する。

修正リリースでも、Chrome拡張に変更がある場合は新しいZIPを添付する。unpacked extensionは自動更新されないため、Release本文で利用者に手動更新が必要なことを明記する。

## Chromeウェブストアの自動申請（任意）

自動申請は初期状態で無効。masterへのpush後、検証とビルドが成功した場合のみ、同じrunでビルドしたストア用ZIPを使用する。公開済みversionと同じなら何もしない。新しいversionだけをアップロード・審査申請し、審査通過後に公開される。古いversion、審査中の更新、ポリシー警告、アップロード未確認などでは停止する。Chrome本体の自動更新は公開後に行われる。

初回設定:

1. Google CloudでChrome Web Store APIとIAM Credentials APIを有効化し、ストア申請用のサービスアカウントを作る。秘密鍵は作成しない。[Googleの設定案内](https://developer.chrome.com/docs/webstore/service-accounts)
2. Chrome Web Store Developer Dashboardのアカウント設定で、そのサービスアカウントを登録し、パブリッシャーIDを確認する。
3. GitHub Actions用Workload Identity Federationを作り、このリポジトリのmasterからのpushに限定する属性条件を設定する。対象サービスアカウントに、その限定されたprincipalの`roles/iam.workloadIdentityUser`を付与する。[Googleの設定例](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation)
4. GitHub ActionsのRepository Variablesへ`CHROME_STORE_WORKLOAD_IDENTITY_PROVIDER`（`projects/番号/locations/global/workloadIdentityPools/プール/providers/プロバイダ`）、`CHROME_STORE_SERVICE_ACCOUNT`（メールアドレス）、`CHROME_STORE_PUBLISHER_ID`、`VITE_CONNECTOR_STORE_ID`を設定する。最後のIDは本番で公開中の拡張を指定する。
5. ストアに未提出の手動下書きがないことを確認し、`ENABLE_CHROME_STORE_PUBLISH=true`を設定してからmasterへpushする。変数が未設定ならストアへの書き込みは行われない。公開・申請済みの版やActionsの結果をダッシュボードで確認する。

注意: `fetchStatus` APIでは未提出の手動下書きの有無を確実に検出できないため、手動の下書き編集と自動申請を同時に行わない。手動作業中は`ENABLE_CHROME_STORE_PUBLISH`を無効にする。アップロード後に処理が中断された場合も、自動リトライ前にダッシュボードで下書き・申請状態を確認する。別の端末や別システムからの同時操作を防ぐロックではない。APIの認証・実際の申請は初回設定後に確認する必要がある。

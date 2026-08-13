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

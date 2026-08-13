# Changelog

このプロジェクトの主な変更を記録します。形式は[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)を参考にし、バージョン番号は[Semantic Versioning](https://semver.org/lang/ja/)に従います。

## [Unreleased]

### Added

- 直近の試合への1P・2P表示
- 1P側と2P側それぞれの対戦数・勝率集計

### Changed

- 自動同期中の同期前プレビューを廃止し、同期結果をトーストだけで通知
- query chunk schemaをv2へ更新し、追跡対象の`subjectSide`を永続化
- 管理者同期時に旧query chunkで欠落した1P・2P情報を完全matchから一度だけ復元

## [1.0.0] - 2026-08-14

初回安定版。Buckler's Boot Campの直近履歴を定期的に取得し、上限を越えて失われる対戦履歴をFirestoreへ蓄積・分析できるセルフホスト型アプリケーションとして公開しました。

### Added

- Manifest V3 Chrome拡張による、ログイン済みBucklerからのワンクリック取得
- 既知の`replay_id`を検出した時点で終了する差分取得
- ランク、カジュアル、ルーム、バトルハブを含む総合履歴の保存
- raw response、完全な試合、query chunk、manifestの階層化されたFirestore保存
- `replay_id`による重複排除と再取得データの更新
- Firebase Authenticationと管理者UIDによる書き込み制御
- `private`と`public`を選択できるFirestore Security Rules
- 期間、対戦モード、使用キャラクターによるクライアント側フィルター
- 全期間の勝敗・勝率、使用キャラクター別、相手キャラクター別の集計
- 対戦数順のキャラクターカードと、0戦を含む全キャラクター表示
- ランクマッチだけを対象にしたキャラクター別LP・MR直近100試合グラフ
- 最新ランクマッチで使用したキャラクターの初期選択
- 直近14日の日別試合数・勝率表示
- 直近100試合と各ラウンドの決着方法表示
- 日本語・英語表示
- Firestore全保存層のバックアップと検証付き復元
- 同期失敗時にも旧世代を維持するquery chunk generation切替
- 同期鮮度の通知と、認証切れ時のBuckler再ログイン誘導
- GitHub PagesへのCI検証後の自動デプロイ
- セルフホスト向けFirebase・Chrome拡張・公開範囲設定
- BiomeによるLint・フォーマット、TypeScript strict、Vitest、Firestore Rulesテスト
- Dependabot、branch protection、公開リポジトリ用ドキュメントとブランド資産

### Security

- Buckler Cookie、CAPCOM ID資格情報、Firebase管理者鍵をアプリやFirestoreへ保存しない構成
- 書き込みをFirestoreの`admins/{uid}`登録者だけに制限
- Chrome拡張のBattlegraph接続先originをビルド時に限定
- bundleのorigin、protocol、ユーザーコード、レスポンス状態、schemaを保存前に検証

[1.0.0]: https://github.com/dyoshimitsu/sf6-battlegraph/releases/tag/v1.0.0

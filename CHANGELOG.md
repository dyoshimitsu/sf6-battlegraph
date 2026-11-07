# Changelog

このプロジェクトの主な変更を記録します。形式は[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)を参考にし、バージョン番号は[Semantic Versioning](https://semver.org/lang/ja/)に従います。

## [Unreleased]

### Added

- 相手とのLP差別の勝率と、ランクマッチのセット結果・1戦目の勝敗別の2戦目勝率
- プレイ傾向に、最後に使ったキャラクターのMRランキング上位3人の平均と自分との差を表示（キャラクター変更か100試合ごとに更新）
- 勝敗内訳・使用キャラクター・ゲージ使用割合の円グラフと、日別の勝率縦棒グラフ
- 日別の記録にランクマッチのLP・MR増減（推定）、直近の調子に現在と最長の連勝・連敗を表示
- 相手キャラ別の散布図に軸の目盛りと、最低勝率（勝敗5戦以上）・負け越しで最多対戦のキャラ名を表示
- 詳細分析に、連続プレイ中の試合順（1試合ごとの勝率と傾き）・相手の操作タイプ・よく当たる相手ごとの勝率と、取った／落としたラウンドの決着方法の内訳を追加
- 完全matchに対戦日時のFirestore Timestamp `playedAt`と、初回保存時刻`firstSeenAt`を保存

### Changed

- プレイ傾向を、自分・前回（高勝率時）・ランキング上位3人の平均・差を並べた表に変更
- 詳細分析を「時間帯と連続プレイ」「対戦相手」「ラウンドと決着」に分け、問いごとに並べ替え
- 分析画面の配置、文字サイズ、余白、色の役割を統一

### Fixed

- Act 14（2026年11月1日16:00開始）を追加し、マスター未登録のActは同期時のプロフィールから番号を検出して開始日時を推定
- 対戦キャラクター一覧で、0戦または勝敗不明だけのキャラクターの勝率を「0.0%」ではなく「—」と表示
- 収集結果をBattlegraphへ返せなかった場合も、Bucklerの収集タブを閉じるように修正
- 実行環境のロケールによって、raw snapshotのSHA-256検証結果が変わる可能性があった問題を修正

### Security

- Chrome拡張がBuckler Battle Log以外のURLを収集タブとして開かないように制限

## [1.1.1] - 2026-08-14

### Fixed

- Chrome拡張のcontent script間で定数名が衝突し、Bucklerページで構文エラーになる不具合を修正

## [1.1.0] - 2026-08-14

### Added

- 直近の試合への1P・2P表示
- 1P側と2P側それぞれの対戦数・勝率集計
- `uploaded_at`とメンテナンス終了日時を使ったActフィルター
- 複数の`battle_version`が保存された場合だけ表示するゲームバージョンフィルター

### Changed

- 自動同期中の同期前プレビューを廃止し、同期結果をトーストだけで通知
- 開発・CIのNode.js要件を26以降へ更新
- query chunk schemaをv2へ更新し、追跡対象の`subjectSide`を永続化
- 管理者同期時に旧query chunkで欠落した1P・2P情報を完全matchから一度だけ復元

### Fixed

- ブラウザ標準の日付ピッカーを利用する形式へ戻し、環境によるカレンダー表示の不整合を解消

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
[1.1.0]: https://github.com/dyoshimitsu/sf6-battlegraph/releases/tag/v1.1.0
[1.1.1]: https://github.com/dyoshimitsu/sf6-battlegraph/releases/tag/v1.1.1

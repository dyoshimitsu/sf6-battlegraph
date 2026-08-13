# Data model

## Principles

- Buckler の raw レスポンスを欠損なく保存する
- 表示・検索用のフィールドを非正規化して併記する
- 1 試合の一意キーには `replay_id` を使う
- 集計用データは複数試合を chunk にまとめ、Firestore read を削減する
- schema と parser のバージョンを記録する
- 未知のフィールド、モード、コードを破棄しない

## Collections

```text
admins/{uid}

players/{userCode}
players/{userCode}/matches/{replayId}
players/{userCode}/snapshots/{syncId}
players/{userCode}/snapshots/{syncId}/pages/{pageId}
players/{userCode}/queryChunks/{generation_chunkId}
players/{userCode}/manifests/matches
players/{userCode}/syncs/{syncId}
```

## Player

```json
{
  "userCode": "1134991793",
  "fighterId": "Ituki",
  "platform": "Steam",
  "latestLeaguePoint": 19046,
  "latestMasterRating": 0,
  "oldestPlayedAtEpoch": 1785529200,
  "newestPlayedAtEpoch": 1788207599,
  "totalMatches": 100,
  "schemaVersion": 1,
  "parserVersion": 1,
  "lastSyncedAt": "Timestamp"
}
```

プロフィール情報は raw に完全保存し、頻繁に表示する値だけ player document に複製する。

## Complete match

```json
{
  "replayId": "SCVBBKBCX",
  "subjectUserCode": "1134991793",
  "playedAt": "Timestamp",
  "playedAtEpoch": 1786565316,
  "playedDate": "2026-08-13",

  "battleVersion": 20004000,
  "battleType": 1,
  "battleSubType": 1,
  "mode": "ranked",

  "subjectSide": 1,
  "result": "win",
  "roundsWon": 2,
  "roundsLost": 0,

  "subjectCharacterId": 21,
  "subjectCharacterName": "ジェイミー",
  "subjectCharacterSlug": "jamie",
  "subjectInputType": 0,
  "subjectLeaguePoint": 18981,
  "subjectLeagueRank": 30,
  "subjectMasterRating": 0,

  "opponentUserCode": "2923144431",
  "opponentCharacterId": 31,
  "opponentCharacterName": "アレックス",
  "opponentCharacterSlug": "alex",
  "opponentInputType": 0,
  "opponentLeaguePoint": 18024,
  "opponentLeagueRank": 30,
  "opponentMasterRating": 0,

  "raw": {},
  "sourceSyncIds": ["sync-id"],
  "schemaVersion": 1,
  "parserVersion": 1,
  "firstSeenAt": "Timestamp",
  "lastSeenAt": "Timestamp"
}
```

`subject` は追跡対象ユーザーを表す。対象ユーザーが `player1_info` と `player2_info` のどちらにいても、検索用フィールドでは同じ向きに正規化する。`raw` には元の replay object をそのまま保存する。

日時は Firestore Timestamp と Unix 秒を保持する。表示は `Asia/Tokyo`、`playedDate` も日本時間の日付とする。

## Raw snapshot

```json
{
  "syncId": "sync-id",
  "userCode": "1134991793",
  "bucklerBuildId": "VF0olv5R7WAQWaOptbKoh",
  "fetchedAt": "Timestamp",
  "sourceTypes": ["all", "ranked", "casual", "custom", "hub"],
  "pageCount": 10,
  "matchCount": 100,
  "schemaVersion": 1,
  "collectorVersion": 1,
  "status": "complete"
}
```

各 page document:

```json
{
  "sourceType": "ranked",
  "sourcePath": "/battlelog/rank",
  "page": 1,
  "fetchedAt": "2026-08-13T00:00:00.000Z",
  "storage": "inline",
  "rawUtf8Bytes": 123456,
  "rawSha256": "sha256...",
  "raw": {}
}
```

700 KiBを超える場合は`storage: "parts"`と`partCount`を親documentへ記録し、UTF-8の文字境界を保った文字列として`pages/{pageId}/parts/{partNo}`へ分割する。親には元JSONのUTF-8バイト数とSHA-256を保持し、復元時に完全性を検証できるようにする。

## Query chunks

query chunk は集計に必要なフィールドをまとめた read optimization であり、保存上の正本ではない。正本は complete match と raw snapshot とする。

```json
{
  "generation": "generation-id",
  "yearMonth": "2026-08",
  "sequence": 1,
  "from": 1785529200,
  "to": 1788207599,
  "count": 250,
  "matches": [
    {
      "id": "SCVBBKBCX",
      "at": 1786565316,
      "version": 20004000,
      "battleType": 1,
      "battleSubType": 1,
      "battleTypeName": "RANKED MATCH",
      "mode": "ranked",
      "sourceTypes": ["all"],
      "subjectSide": 1,
      "result": "win",
      "roundsWon": 2,
      "roundsLost": 0,
      "subject": {
        "userCode": 1134991793,
        "fighterId": "Ituki",
        "platform": "Steam",
        "characterId": 21,
        "characterName": "ジェイミー",
        "characterSlug": "jamie",
        "inputType": 0,
        "leaguePoint": 18981,
        "leagueRank": 30,
        "masterRating": 0,
        "roundResults": [6, 8]
      },
      "opponent": {
        "userCode": 2923144431,
        "fighterId": "Iv20",
        "platform": "Steam",
        "characterId": 31,
        "characterName": "アレックス",
        "characterSlug": "alex",
        "inputType": 0,
        "leaguePoint": 18024,
        "leagueRank": 30,
        "masterRating": 0,
        "roundResults": [0, 0]
      }
    }
  ],
  "schemaVersion": 2
}
```

`subjectSide`は追跡対象ユーザーが1P側なら`1`、2P側なら`2`。schema version 1の旧chunkには存在しないため、クライアントは推測せず不明として扱う。次の管理者同期時に、不足する完全matchだけからsideを一度読み取り、新しいgenerationへ保存する。移行後の通常閲覧では追加readは発生しない。

chunk は月単位を基本とし、以下のいずれかに達する前に分割する。

- 最大 250 試合
- JSON の安全なサイズ上限（実測後に決定。目安 700 KiB）

## Manifest

```json
{
  "activeGeneration": "generation-id",
  "chunks": [
    {
      "id": "generation-id_2026-08_001",
      "from": 1785529200,
      "to": 1788207599,
      "count": 250
    }
  ],
  "totalMatches": 250,
  "oldestPlayedAtEpoch": 1785529200,
  "newestPlayedAtEpoch": 1788207599,
  "previousGeneration": {
    "generation": "previous-generation-id",
    "chunks": []
  },
  "obsoleteChunkIds": [],
  "schemaVersion": 1,
  "updatedAt": "Timestamp"
}
```

初期版のクライアントはmanifestに列挙されたactive generationのchunkを一括取得する。将来、期間を読み込み前に指定できるUIを追加する場合は、`from` / `to`を比較して必要なchunkだけ取得できる。

`previousGeneration`は直前1世代のロールバック情報を保持する。`obsoleteChunkIds`には2世代以上前で削除対象となるchunkを記録し、削除完了後に空配列へ更新する。これにより整理処理が途中で失敗しても孤立chunkを追跡できる。

## Client-side aggregations

初期版では次を JavaScript で計算する。

- 試合数、勝敗数、勝率
- 使用キャラクター別戦績
- 対戦相手キャラクター別戦績
- 対戦モード別戦績
- 日、週、月別戦績
- LP / MR 推移と増減
- バトルバージョン別戦績
- 入力タイプ別戦績
- 特定プレイヤーとの戦績
- ラウンド勝敗
- 連勝、連敗

事前集計 document は初期版では作成しない。実際の read 数と利用パターンを測定し、効果が明確な集計だけを後から追加する。

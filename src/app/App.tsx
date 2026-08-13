import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { parseCollectorImport } from "../domain/buckler/parseCollectorBundle";
import { aggregateMatches, filterMatches } from "../domain/statistics/aggregateMatches";
import {
  BucklerValidationError,
  type BucklerBundlePreview,
} from "../domain/buckler/types";

const INITIAL_USER_CODE = 1134991793;
const TOKYO_DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

interface ImportedBundle {
  fileName: string;
  fileSize: number;
  preview: BucklerBundlePreview;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatTimestamp(timestamp?: number): string {
  return timestamp === undefined
    ? "—"
    : TOKYO_DATE_TIME.format(new Date(timestamp * 1000));
}

function formatWinRate(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function playerCharacterName(player: BucklerBundlePreview["matches"][number]["subject"]): string {
  return player.playing_character_name ?? player.character_name ?? "Unknown";
}

export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mode, setMode] = useState("");
  const [subjectCharacterId, setSubjectCharacterId] = useState("");
  const [opponentCharacterId, setOpponentCharacterId] = useState("");

  const readiness = useMemo(
    () => [
      { label: "Buckler JSONの検証", done: imported !== null },
      { label: "複数ページの統合", done: imported !== null && !imported.preview.isSinglePage },
      { label: "Firestore同期", done: false },
      { label: "グラフ表示", done: false },
    ],
    [imported],
  );
  const filteredMatches = useMemo(
    () => filterMatches(imported?.preview.matches ?? [], {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      mode: mode ? mode as BucklerBundlePreview["matches"][number]["mode"] : undefined,
      subjectCharacterId: subjectCharacterId ? Number(subjectCharacterId) : undefined,
      opponentCharacterId: opponentCharacterId ? Number(opponentCharacterId) : undefined,
    }),
    [fromDate, imported, mode, opponentCharacterId, subjectCharacterId, toDate],
  );
  const statistics = useMemo(
    () => aggregateMatches(filteredMatches),
    [filteredMatches],
  );
  const unfilteredStatistics = useMemo(
    () => aggregateMatches(imported?.preview.matches ?? []),
    [imported],
  );

  async function importFile(file?: File) {
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const preview = parseCollectorImport(json, INITIAL_USER_CODE);
      setImported({ fileName: file.name, fileSize: file.size, preview });
    } catch (cause) {
      setImported(null);
      if (cause instanceof SyntaxError) {
        setError("JSONとして読み込めませんでした。ファイルの内容を確認してください。");
      } else if (cause instanceof BucklerValidationError) {
        setError(cause.message);
      } else {
        setError("ファイルの読み込み中に予期しないエラーが発生しました。");
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void importFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void importFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SF6 Battlegraph ホーム">
          <span className="brand-mark">B</span>
          <span>
            <strong>SF6 Battlegraph</strong>
            <small>Personal fight archive</small>
          </span>
        </a>
        <span className="status-pill"><i /> Local preview</span>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">BUILD YOUR FIGHT HISTORY</p>
            <h1>100戦の先まで、<br /><em>積み重ねを残す。</em></h1>
            <p className="lead">
              Buckler’s Boot Campのバトルログを保存し、キャラクターや期間を越えて成長を振り返るためのダッシュボードです。
            </p>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit-number">100+</span>
            <span className="orbit-label">MATCHES<br />ARCHIVED</span>
          </div>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FIRST SLICE</p>
              <h2>収集データを確認する</h2>
            </div>
            <p>ユーザーコード <strong>{INITIAL_USER_CODE}</strong></p>
          </div>

          <div className="workspace-grid">
            <div
              className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="drop-icon">JSON</div>
              <h3>Collector JSONをドロップ</h3>
              <p>複数モード・複数ページのbundleと、従来の1ページ分の生JSONを検証できます。データはブラウザ内だけで処理されます。</p>
              <button type="button" onClick={() => inputRef.current?.click()}>
                ファイルを選択
              </button>
              <a
                className={`collector-link ${import.meta.env.DEV ? "is-disabled" : ""}`}
                href={import.meta.env.DEV ? undefined : "./collector.js"}
                download={!import.meta.env.DEV}
                onClick={(event) => {
                  if (import.meta.env.DEV) {
                    event.preventDefault();
                    window.alert("開発中のコレクターは npm run build 後の dist/collector.js を使用してください。");
                  }
                }}
              >
                {import.meta.env.DEV ? "コレクターは本番ビルドで生成されます" : "Bucklerコレクターをダウンロード"}
              </a>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                hidden
              />
            </div>

            <aside className="roadmap-card">
              <p className="eyebrow">IMPLEMENTATION PATH</p>
              <ol>
                {readiness.map((item, index) => (
                  <li className={item.done ? "done" : ""} key={item.label}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.label}
                  </li>
                ))}
              </ol>
            </aside>
          </div>

          {error && <div className="message error" role="alert">{error}</div>}

          {imported && (
            <>
            <section className="preview" aria-live="polite">
              <div className="preview-title">
                <div>
                  <p className="eyebrow">VALID IMPORT</p>
                  <h2>同期前プレビュー</h2>
                </div>
                <span>{imported.fileName} · {formatBytes(imported.fileSize)}</span>
              </div>

              <div className="metrics">
                <article><span>取得ページ</span><strong>{imported.preview.pageCount}</strong></article>
                <article><span>取得試合</span><strong>{imported.preview.rawMatchCount}</strong></article>
                <article><span>ユニーク試合</span><strong>{imported.preview.uniqueMatchCount}</strong></article>
                <article><span>警告</span><strong>{imported.preview.warnings.length}</strong></article>
              </div>

              <dl className="preview-details">
                <div><dt>最新</dt><dd>{formatTimestamp(imported.preview.newestPlayedAt)}</dd></div>
                <div><dt>最古</dt><dd>{formatTimestamp(imported.preview.oldestPlayedAt)}</dd></div>
                <div><dt>重複</dt><dd>{imported.preview.duplicateCount} 試合を replay_id で統合</dd></div>
                <div><dt>Build ID</dt><dd>{imported.preview.buildId ?? "単一ページのため不明"}</dd></div>
              </dl>

              <div className="source-grid">
                {imported.preview.sources.map((source) => (
                  <article key={source.sourceType}>
                    <span>{source.sourceType}</span>
                    <strong>{source.pages}<small> / {source.expectedPages} pages</small></strong>
                    <p>{source.rawMatches} raw matches</p>
                  </article>
                ))}
              </div>

              {imported.preview.warnings.length > 0 && (
                <ul className="warning-list">
                  {imported.preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </section>

            <section className="statistics-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LOCAL ANALYSIS</p>
                  <h2>読み込んだ戦績</h2>
                </div>
                <p>{filteredMatches.length} / {imported.preview.uniqueMatchCount} 試合を表示</p>
              </div>

              <div className="filter-bar">
                <label><span>開始日</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                <label><span>終了日</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                <label><span>モード</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="">すべて</option>{imported.preview.sources.filter((source) => source.sourceType !== "all" && source.sourceType !== "unknown").map((source) => <option key={source.sourceType} value={source.sourceType}>{source.sourceType}</option>)}</select></label>
                <label><span>使用キャラ</span><select value={subjectCharacterId} onChange={(event) => setSubjectCharacterId(event.target.value)}><option value="">すべて</option>{unfilteredStatistics.bySubjectCharacter.filter((record) => record.characterId !== null).map((record) => <option key={record.characterId} value={record.characterId ?? ""}>{record.characterName}</option>)}</select></label>
                <label><span>相手キャラ</span><select value={opponentCharacterId} onChange={(event) => setOpponentCharacterId(event.target.value)}><option value="">すべて</option>{unfilteredStatistics.byOpponentCharacter.filter((record) => record.characterId !== null).map((record) => <option key={record.characterId} value={record.characterId ?? ""}>{record.characterName}</option>)}</select></label>
                <button type="button" onClick={() => { setFromDate(""); setToDate(""); setMode(""); setSubjectCharacterId(""); setOpponentCharacterId(""); }}>リセット</button>
              </div>

              <div className="record-banner">
                <article><span>勝率</span><strong>{formatWinRate(statistics.overall.winRate)}</strong></article>
                <article><span>勝利</span><strong className="win-text">{statistics.overall.wins}</strong></article>
                <article><span>敗北</span><strong className="loss-text">{statistics.overall.losses}</strong></article>
                <article><span>判定不能</span><strong>{statistics.overall.unknown + statistics.overall.draws}</strong></article>
              </div>

              <div className="analysis-grid">
                <article className="analysis-card">
                  <p className="eyebrow">YOUR FIGHTERS</p>
                  <h3>使用キャラクター</h3>
                  <div className="character-records">
                    {statistics.bySubjectCharacter.map((record) => (
                      <div key={`${record.characterId}-${record.characterSlug}`}>
                        <span>{record.characterName}</span>
                        <strong>{formatWinRate(record.winRate)}</strong>
                        <small>{record.matches}戦 · {record.wins}勝 {record.losses}敗</small>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="analysis-card">
                  <p className="eyebrow">MATCHUPS</p>
                  <h3>対戦相手キャラクター</h3>
                  <div className="character-records">
                    {statistics.byOpponentCharacter.slice(0, 8).map((record) => (
                      <div key={`${record.characterId}-${record.characterSlug}`}>
                        <span>{record.characterName}</span>
                        <strong>{formatWinRate(record.winRate)}</strong>
                        <small>{record.matches}戦 · {record.wins}勝 {record.losses}敗</small>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="recent-card">
                <div className="card-heading">
                  <div><p className="eyebrow">RECENT MATCHES</p><h3>直近の試合</h3></div>
                  <span>最新10件</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>日時</th><th>結果</th><th>使用キャラ</th><th>相手キャラ</th><th>モード</th><th>LP / MR</th></tr></thead>
                    <tbody>
                      {filteredMatches.slice(0, 10).map((match) => (
                        <tr key={match.replayId}>
                          <td>{formatTimestamp(match.playedAtEpoch)}</td>
                          <td><span className={`result-badge ${match.result}`}>{match.result}</span></td>
                          <td>{playerCharacterName(match.subject)}</td>
                          <td>{playerCharacterName(match.opponent)}</td>
                          <td>{match.mode}</td>
                          <td>{match.subject.master_rating || match.subject.league_point || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
            </>
          )}
        </section>
      </main>

      <footer>
        <span>SF6 Battlegraph</span>
        <span>Unofficial · Not affiliated with CAPCOM</span>
      </footer>
    </div>
  );
}

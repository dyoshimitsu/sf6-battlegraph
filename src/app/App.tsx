import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { parseBucklerPage } from "../domain/buckler/parseBucklerPage";
import {
  BucklerValidationError,
  type BucklerPagePreview,
} from "../domain/buckler/types";

const INITIAL_USER_CODE = 1134991793;
const TOKYO_DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

interface ImportedPage {
  fileName: string;
  fileSize: number;
  preview: BucklerPagePreview;
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

export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportedPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readiness = useMemo(
    () => [
      { label: "Buckler JSONの検証", done: imported !== null },
      { label: "全モード収集", done: false },
      { label: "Firestore同期", done: false },
      { label: "グラフ表示", done: false },
    ],
    [imported],
  );

  async function importFile(file?: File) {
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const preview = parseBucklerPage(json, INITIAL_USER_CODE);
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
              <h2>Buckler JSONを確認する</h2>
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
              <h3>Bucklerレスポンスをドロップ</h3>
              <p>現在は1ページ分の生JSONを検証できます。データはブラウザ内だけで処理されます。</p>
              <button type="button" onClick={() => inputRef.current?.click()}>
                ファイルを選択
              </button>
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
            <section className="preview" aria-live="polite">
              <div className="preview-title">
                <div>
                  <p className="eyebrow">VALID RESPONSE</p>
                  <h2>同期前プレビュー</h2>
                </div>
                <span>{imported.fileName} · {formatBytes(imported.fileSize)}</span>
              </div>

              <div className="metrics">
                <article><span>ページ</span><strong>{imported.preview.currentPage}<small> / {imported.preview.totalPages}</small></strong></article>
                <article><span>このページの試合</span><strong>{imported.preview.matchCount}</strong></article>
                <article><span>対象を確認できた試合</span><strong>{imported.preview.subjectMatches}</strong></article>
                <article><span>警告</span><strong>{imported.preview.warnings.length}</strong></article>
              </div>

              <dl className="preview-details">
                <div><dt>最新</dt><dd>{formatTimestamp(imported.preview.newestPlayedAt)}</dd></div>
                <div><dt>最古</dt><dd>{formatTimestamp(imported.preview.oldestPlayedAt)}</dd></div>
                <div><dt>対戦タイプ</dt><dd>{imported.preview.battleTypes.join(", ") || "—"}</dd></div>
              </dl>

              {imported.preview.warnings.length > 0 && (
                <ul className="warning-list">
                  {imported.preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </section>
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

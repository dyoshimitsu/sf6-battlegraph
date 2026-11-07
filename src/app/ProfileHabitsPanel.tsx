import type { Firestore } from "firebase/firestore/lite";
import { useEffect, useMemo, useState } from "react";
import type { NormalizedMatch } from "../domain/buckler/types";
import { bestProfileHabits, type ProfileHabits } from "../domain/statistics/profileHabits";
import { loadProfileHabits } from "../firebase/loadProfileHabits";
import { formatWinRate } from "./format";

export function ProfileHabitsPanel({
  db,
  userCode,
  locale,
  matches,
}: {
  db: Firestore;
  userCode: number;
  locale: "ja" | "en";
  matches: NormalizedMatch[];
}) {
  const [snapshots, setSnapshots] = useState<ProfileHabits[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ja = locale === "ja";
  const groups: {
    title: string;
    percent?: boolean;
    compareWithBest?: boolean;
    fields: [keyof ProfileHabits["values"], string][];
  }[] = [
    {
      title: ja ? "攻防の行動" : "Actions",
      fields: [
        ["drive_impact", ja ? "インパクト成功" : "Impacts landed"],
        ["drive_parry", ja ? "パリィ成功" : "Parries"],
        ["just_parry", ja ? "ジャストパリィ" : "Perfect parries"],
        ["drive_reversal", ja ? "ドライブリバーサル" : "Drive reversals"],
        ["throw_count", ja ? "投げ成功" : "Throws landed"],
        ["throw_tech", ja ? "投げ抜け" : "Throw escapes"],
        ["throw_drive_parry", ja ? "相手パリィを投げた" : "Throws vs parry"],
        ["punish_counter", ja ? "インパクトのパニッシュ成功" : "Impact punish counters"],
        ["drive_impact_to_drive_impact", ja ? "インパクト返し成功" : "Impact counters"],
        ["stun", ja ? "スタンさせた" : "Stuns inflicted"],
      ],
    },
    {
      title: ja ? "受けた行動・画面端" : "Defense and corner",
      fields: [
        ["received_drive_impact", ja ? "インパクトを受けた" : "Impacts received"],
        [
          "received_drive_impact_to_drive_impact",
          ja ? "インパクトを返された" : "Impacts countered",
        ],
        ["received_punish_counter", ja ? "インパクトのパニッシュ被弾" : "Impact punish received"],
        ["received_throw_count", ja ? "投げを受けた" : "Throws received"],
        ["received_throw_drive_parry", ja ? "パリィを投げられた" : "Parries thrown"],
        ["received_stun", ja ? "スタンさせられた" : "Stuns received"],
        ["corner_time", ja ? "相手を画面端に" : "Opponent in corner"],
        ["cornered_time", ja ? "自分が画面端に" : "Own time in corner"],
      ],
    },
    {
      title: ja ? "ドライブゲージ使用実績" : "Drive gauge usage",
      percent: true,
      compareWithBest: true,
      fields: [
        ["gauge_rate_drive_guard", ja ? "ドライブパリィ" : "Drive parry"],
        ["gauge_rate_drive_impact", ja ? "ドライブインパクト" : "Drive impact"],
        ["gauge_rate_drive_arts", ja ? "オーバードライブアーツ" : "Overdrive arts"],
        ["gauge_rate_drive_rush_from_parry", ja ? "パリィドライブラッシュ" : "Parry drive rush"],
        [
          "gauge_rate_drive_rush_from_cancel",
          ja ? "キャンセルドライブラッシュ" : "Cancel drive rush",
        ],
        ["gauge_rate_drive_reversal", ja ? "ドライブリバーサル" : "Drive reversal"],
        ["gauge_rate_drive_other", ja ? "ダメージ" : "Damage"],
      ],
    },
    {
      title: ja ? "SAゲージ使用割合" : "Super gauge usage",
      percent: true,
      fields: [
        ["gauge_rate_sa_lv1", "SA1"],
        ["gauge_rate_sa_lv2", "SA2"],
        ["gauge_rate_sa_lv3", "SA3"],
        ["gauge_rate_ca", "CA"],
      ],
    },
  ];
  const best = useMemo(() => bestProfileHabits(snapshots ?? [], matches), [snapshots, matches]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadProfileHabits(db, userCode)
      .then((value) => {
        if (active) setSnapshots(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unknown error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db, userCode]);
  return (
    <section className="insights-card habits-card ui-card">
      <p className="eyebrow">PLAYSTYLE SNAPSHOT</p>
      <h3 className="ui-title">{ja ? "プレイ傾向の変化" : "Playstyle changes"}</h3>
      <span className="insights-caption">
        {ja ? "直近100戦平均 · フィルター対象外" : "Last 100 games · unfiltered"}
      </span>
      {loading && <p role="status">{ja ? "読み込み中…" : "Loading…"}</p>}
      {error && (
        <p role="alert">
          {ja ? "プロフィール記録を読み込めませんでした" : "Unable to load profile snapshots"}:{" "}
          {error}
        </p>
      )}
      {snapshots &&
        (snapshots.length ? (
          <>
            <div className="habits-dates">
              {snapshots.slice(0, 2).map((snapshot, index) => (
                <span key={snapshot.fetchedAt}>
                  {index === 0 ? (ja ? "今回" : "Latest") : ja ? "前回" : "Previous"}:{" "}
                  {new Date(snapshot.fetchedAt).toLocaleString(ja ? "ja-JP" : "en-US", {
                    timeZone: "Asia/Tokyo",
                  })}
                </span>
              ))}
              <span>{ja ? "※100戦平均は重複あり" : "Overlapping 100-game averages"}</span>
            </div>
            {[groups[2], groups[3], groups[0], groups[1]].map((group) => (
              <section className="habits-group" key={group.title}>
                <h4>{group.title}</h4>
                <div className="habits-grid">
                  {group.fields.map(([key, label]) => {
                    const value = snapshots[0]?.values[key],
                      previous = snapshots[1]?.values[key];
                    const multiplier = group.percent ? 100 : 1;
                    const bestValue = best?.snapshot.values[key];
                    return (
                      <article key={key}>
                        <span className="ui-label">{label}</span>
                        <strong className="ui-value ui-value--accent">
                          {value === undefined
                            ? "—"
                            : group.percent
                              ? `${(value * 100).toFixed(2)}%`
                              : value}
                        </strong>
                        {group.compareWithBest && value !== undefined && bestValue !== undefined ? (
                          <small>
                            {ja ? "高勝率時" : "Best window"} {(bestValue * 100).toFixed(2)}% ·{" "}
                            {value - bestValue >= 0 ? "+" : ""}
                            {((value - bestValue) * 100).toFixed(2)}pt
                          </small>
                        ) : value !== undefined && previous !== undefined ? (
                          <small>
                            {ja ? "前回比" : "Change"} {value - previous >= 0 ? "+" : ""}
                            {((value - previous) * multiplier).toFixed(group.percent ? 2 : 1)}
                            {group.percent ? "pt" : ""}
                          </small>
                        ) : (
                          ""
                        )}
                        {group.percent && value !== undefined && (
                          <div className="habits-meter" aria-hidden="true">
                            <i style={{ width: `${Math.min(100, value * 100)}%` }} />
                            {group.compareWithBest && bestValue !== undefined && (
                              <b style={{ left: `${Math.min(100, bestValue * 100)}%` }} />
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                {group.compareWithBest && (
                  <small>
                    {best
                      ? ja
                        ? `線：高勝率時 ${new Date(best.snapshot.fetchedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} · 勝率 ${formatWinRate(best.record.winRate)}（直近10同期から、取得前の保存済み100戦）`
                        : `Marker: best window ${new Date(best.snapshot.fetchedAt).toLocaleDateString("en-US", { timeZone: "Asia/Tokyo" })} · ${formatWinRate(best.record.winRate)} (100 saved matches before capture, among the latest 10 syncs)`
                      : ja
                        ? "比較には保存済み100戦と、その後に取得したプロフィールが必要です。"
                        : "Comparison needs 100 saved matches before a captured profile."}
                  </small>
                )}
                {group.compareWithBest && (
                  <small>
                    {ja
                      ? " ※パリィ・ダメージの項目対応はBuckler表示との照合待ち。履歴欠落があると100戦の対象が一致しない場合があります。"
                      : " Parry/damage field mappings need verification; missing history may change the 100-game window."}
                  </small>
                )}
              </section>
            ))}
          </>
        ) : (
          <p>{ja ? "対象のプロフィール記録がありません。" : "No profile snapshots found."}</p>
        ))}
    </section>
  );
}

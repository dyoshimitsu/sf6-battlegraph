import type { Firestore } from "firebase/firestore/lite";
import { useEffect, useMemo, useState } from "react";
import { getCharacterNameBySlug } from "../domain/buckler/characterNames";
import type { NormalizedMatch } from "../domain/buckler/types";
import {
  averageProfileHabits,
  bestProfileHabits,
  type ProfileHabits,
} from "../domain/statistics/profileHabits";
import { loadProfileHabits, type ProfileHabitsHistory } from "../firebase/loadProfileHabits";
import { CATEGORICAL_COLORS, DonutChart } from "./DonutChart";
import { formatWinRate } from "./format";
import { HabitComparisonTable } from "./HabitComparisonTable";

export function ProfileHabitsPanel({
  db,
  userCode,
  locale,
  matches,
  leadersSyncId,
}: {
  leadersSyncId?: string;
  db: Firestore;
  userCode: number;
  locale: "ja" | "en";
  matches: NormalizedMatch[];
}) {
  const [history, setHistory] = useState<ProfileHabitsHistory | null>(null);
  const snapshots = history?.snapshots ?? null;
  const leaders = history?.leaders ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ja = locale === "ja";
  const groups: {
    title: string;
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
      fields: [
        ["gauge_rate_sa_lv1", "SA1"],
        ["gauge_rate_sa_lv2", "SA2"],
        ["gauge_rate_sa_lv3", "SA3"],
        ["gauge_rate_ca", "CA"],
      ],
    },
  ];
  const best = useMemo(() => bestProfileHabits(snapshots ?? [], matches), [snapshots, matches]);
  const leaderAverage = useMemo(
    () => (leaders ? averageProfileHabits(leaders.profiles) : {}),
    [leaders],
  );
  const leaderLabel = leaders
    ? ja
      ? `上位${leaders.profiles.length}人`
      : `Top ${leaders.profiles.length}`
    : "";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadProfileHabits(db, userCode, leadersSyncId)
      .then((value) => {
        if (active) setHistory(value);
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
  }, [db, userCode, leadersSyncId]);
  return (
    <section className="insights-card habits-card ui-card">
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
            <p className="ui-caption habits-dates">
              {snapshots
                .slice(0, 2)
                .map(
                  (snapshot, index) =>
                    `${index === 0 ? (ja ? "今回" : "Latest") : ja ? "前回" : "Previous"} ${new Date(snapshot.fetchedAt).toLocaleString(ja ? "ja-JP" : "en-US", { timeZone: "Asia/Tokyo" })}`,
                )
                .join(" · ")}
              {leaders &&
                ` · ${leaderLabel}：${getCharacterNameBySlug(leaders.characterSlug, locale)}${ja ? "のMRランキング" : " MR ranking"} ${new Date(leaders.fetchedAt).toLocaleDateString(ja ? "ja-JP" : "en-US", { timeZone: "Asia/Tokyo" })}`}
            </p>
            <div className="share-pair">
              {[groups[2], groups[3]].map((group) => {
                const latest = snapshots[0];
                const reference = group.compareWithBest
                  ? best?.snapshot.values
                  : snapshots[1]?.values;
                const rows = group.fields.map(([key, label], index) => ({
                  key,
                  label,
                  color: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length],
                  value: latest?.values[key],
                  reference: reference?.[key],
                  leaders: leaderAverage[key]?.value,
                }));
                const segments = rows.map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.value ?? 0,
                  color: row.color,
                  figure: row.value === undefined ? "—" : `${(row.value * 100).toFixed(1)}%`,
                }));
                const top = [...segments].sort((a, b) => b.value - a.value)[0];
                return (
                  <section className="share-card" key={group.title}>
                    <h4 className="ui-subtitle">{group.title}</h4>
                    <div className="habit-share">
                      <DonutChart
                        legend={false}
                        segments={segments}
                        centerValue={top?.figure ?? "—"}
                        centerLabel={top?.label ?? ""}
                        ariaLabel={`${group.title}: ${segments.map((segment) => `${segment.label} ${segment.figure}`).join(", ")}`}
                      />
                      <HabitComparisonTable
                        rows={rows}
                        percent
                        locale={locale}
                        referenceLabel={
                          group.compareWithBest ? (ja ? "高勝率時" : "Best") : ja ? "前回" : "Prev."
                        }
                        leadersLabel={leaders ? leaderLabel : undefined}
                      />
                    </div>
                    {group.compareWithBest && (
                      <small className="ui-note">
                        {best
                          ? ja
                            ? `高勝率時：直近10同期のうち、取得前の保存済み100戦の勝率が最も高い${new Date(best.snapshot.fetchedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}取得分 · 勝率 ${formatWinRate(best.record.winRate)} · パリィ・ダメージの項目対応はBuckler表示との照合待ち`
                            : `Best: the capture on ${new Date(best.snapshot.fetchedAt).toLocaleDateString("en-US", { timeZone: "Asia/Tokyo" })} with the highest win rate over the 100 saved matches before it, among the latest 10 syncs · ${formatWinRate(best.record.winRate)} · parry/damage mappings need verification`
                          : ja
                            ? "高勝率時との比較には、保存済み100戦とその後に取得したプロフィールが必要です"
                            : "The best-window comparison needs 100 saved matches before a captured profile"}
                      </small>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="share-pair">
              {[groups[0], groups[1]].map((group) => (
                <section className="share-card" key={group.title}>
                  <h4 className="ui-subtitle">{group.title}</h4>
                  <HabitComparisonTable
                    rows={group.fields.map(([key, label]) => ({
                      key,
                      label,
                      value: snapshots[0]?.values[key],
                      reference: snapshots[1]?.values[key],
                      leaders: leaderAverage[key]?.value,
                    }))}
                    percent={false}
                    locale={locale}
                    referenceLabel={ja ? "前回" : "Prev."}
                    leadersLabel={leaders ? leaderLabel : undefined}
                  />
                </section>
              ))}
            </div>
            <p className="ui-note habits-leaders">
              {leaders
                ? ja
                  ? `直近100戦平均で、期間が重なるため前回との差は期間中だけの変化ではありません。${leaderLabel}はMRランキング上位のプレイヤーの平均で、値はキャラクター別ではなくプレイヤー単位と推定。キャラクター変更か100試合ごとに更新します。棒は自分、線は${leaderLabel}。`
                  : `Last-100-game averages overlap, so the change from the previous capture is not limited to that period. ${leaderLabel} is the average of the MR ranking leaders, presumed per player rather than per character, refreshed after a character change or every 100 matches. Bar: you; line: ${leaderLabel}.`
                : ja
                  ? "直近100戦平均で、期間が重なるため前回との差は期間中だけの変化ではありません。ランキング上位との比較は、次回の同期でランキングを取得すると表示されます。"
                  : "Last-100-game averages overlap, so the change from the previous capture is not limited to that period. The ranking comparison appears after a sync collects the ranking."}
            </p>
          </>
        ) : (
          <p>{ja ? "対象のプロフィール記録がありません。" : "No profile snapshots found."}</p>
        ))}
    </section>
  );
}

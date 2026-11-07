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
  const leaderDiff = (field: keyof ProfileHabits["values"], value: number, percent: boolean) => {
    const average = leaderAverage[field]?.value;
    if (average === undefined) return undefined;
    const scale = percent ? 100 : 1;
    const digits = percent ? 1 : 2;
    const difference = (value - average) * scale;
    return `${leaderLabel} ${(average * scale).toFixed(digits)}${percent ? "%" : ""} · ${ja ? "差" : "diff"} ${difference >= 0 ? "+" : ""}${difference.toFixed(digits)}${percent ? "pt" : ""}`;
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadProfileHabits(db, userCode)
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
  }, [db, userCode]);
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
            <p className="ui-note habits-leaders">
              {leaders
                ? ja
                  ? `比較：${getCharacterNameBySlug(leaders.characterSlug, locale)}のMRランキング上位${leaders.profiles.length}人（${new Date(leaders.fetchedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}取得）の直近100戦平均。Bucklerの値がキャラクター別か全キャラクター合算かは未検証です。`
                  : `Compared with the top ${leaders.profiles.length} ${getCharacterNameBySlug(leaders.characterSlug, locale)} players in the MR ranking (captured ${new Date(leaders.fetchedAt).toLocaleDateString("en-US", { timeZone: "Asia/Tokyo" })}), last 100 games. Whether Buckler averages per character or across characters is unverified.`
                : ja
                  ? "ランキング上位との比較は、次回の同期でランキングを取得すると表示されます。"
                  : "The ranking comparison appears after a sync collects the ranking."}
            </p>
            <div className="habits-share">
              {[groups[2], groups[3]].map((group) => {
                const latest = snapshots[0];
                const previousValues = snapshots[1]?.values;
                const segments = group.fields.map(([key, label], index) => {
                  const value = latest?.values[key];
                  const comparison = group.compareWithBest
                    ? best?.snapshot.values[key]
                    : previousValues?.[key];
                  return {
                    key,
                    label,
                    value: value ?? 0,
                    color: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length],
                    figure: value === undefined ? "—" : `${(value * 100).toFixed(1)}%`,
                    detail:
                      [
                        value !== undefined && comparison !== undefined
                          ? `${group.compareWithBest ? (ja ? "高勝率時" : "Best window") : ja ? "前回" : "Previous"} ${(comparison * 100).toFixed(1)}% · ${value - comparison >= 0 ? "+" : ""}${((value - comparison) * 100).toFixed(1)}pt`
                          : undefined,
                        value !== undefined ? leaderDiff(key, value, true) : undefined,
                      ]
                        .filter(Boolean)
                        .join(" / ") || undefined,
                  };
                });
                const top = [...segments].sort((a, b) => b.value - a.value)[0];
                return (
                  <section className="habits-group habits-share-card" key={group.title}>
                    <h4 className="ui-subtitle">{group.title}</h4>
                    <DonutChart
                      segments={segments}
                      centerValue={top?.figure ?? "—"}
                      centerLabel={top?.label ?? ""}
                      ariaLabel={`${group.title}: ${segments.map((segment) => `${segment.label} ${segment.figure}`).join(", ")}`}
                    />
                    {group.compareWithBest && (
                      <small className="ui-note">
                        {best
                          ? ja
                            ? `高勝率時：${new Date(best.snapshot.fetchedAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}取得 · 勝率 ${formatWinRate(best.record.winRate)}（直近10同期のうち、取得前の保存済み100戦が最も高いもの）。パリィ・ダメージの項目対応はBuckler表示との照合待ち。`
                            : `Best window: captured ${new Date(best.snapshot.fetchedAt).toLocaleDateString("en-US", { timeZone: "Asia/Tokyo" })} · ${formatWinRate(best.record.winRate)} (highest 100 saved matches before capture among the latest 10 syncs). Parry/damage mappings need verification.`
                          : ja
                            ? "高勝率時との比較には、保存済み100戦とその後に取得したプロフィールが必要です。"
                            : "Comparison needs 100 saved matches before a captured profile."}
                      </small>
                    )}
                  </section>
                );
              })}
            </div>
            {[groups[0], groups[1]].map((group) => (
              <section className="habits-group" key={group.title}>
                <h4 className="ui-subtitle">{group.title}</h4>
                <div className="habits-grid">
                  {group.fields.map(([key, label]) => {
                    const value = snapshots[0]?.values[key],
                      previous = snapshots[1]?.values[key];
                    return (
                      <article key={key}>
                        <span className="ui-label">{label}</span>
                        <strong className="ui-value">{value ?? "—"}</strong>
                        {value !== undefined && previous !== undefined && (
                          <small className="ui-note">
                            {ja ? "前回比" : "Change"} {value - previous >= 0 ? "+" : ""}
                            {(value - previous).toFixed(1)}
                          </small>
                        )}
                        {value !== undefined && leaderDiff(key, value, false) && (
                          <small className="ui-note">{leaderDiff(key, value, false)}</small>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        ) : (
          <p>{ja ? "対象のプロフィール記録がありません。" : "No profile snapshots found."}</p>
        ))}
    </section>
  );
}

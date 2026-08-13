export type RoundOutcome = "win" | "loss" | "draw" | "unknown";

export interface RoundDetail {
  round: number;
  outcome: RoundOutcome;
  code: number;
  method: string;
  description: string;
}

const METHODS: Record<number, { method: string; ja: string; en: string }> = {
  1: { method: "KO", ja: "通常KO", en: "Knockout" },
  2: { method: "C", ja: "削りKO", en: "Chip knockout" },
  3: { method: "T", ja: "タイムオーバー", en: "Time over" },
  4: { method: "D", ja: "ドロー", en: "Draw" },
  5: { method: "OD", ja: "オーバードライブ", en: "Overdrive" },
  6: { method: "SA", ja: "スーパーアーツ", en: "Super Art" },
  7: { method: "CA", ja: "クリティカルアーツ", en: "Critical Art" },
  8: { method: "P", ja: "パーフェクト", en: "Perfect" },
};

export function getRoundDetails(
  subjectResults: number[] = [],
  opponentResults: number[] = [],
  locale: "ja" | "en",
): RoundDetail[] {
  return Array.from({ length: Math.max(subjectResults.length, opponentResults.length) }, (_, index) => {
    const subjectCode = subjectResults[index] ?? 0;
    const opponentCode = opponentResults[index] ?? 0;
    const code = subjectCode || opponentCode;
    const outcome: RoundOutcome = subjectCode === 4 || opponentCode === 4
      ? "draw"
      : subjectCode > 0 && opponentCode === 0
        ? "win"
        : opponentCode > 0 && subjectCode === 0
          ? "loss"
          : "unknown";
    const definition = METHODS[code];
    return {
      round: index + 1,
      outcome,
      code,
      method: definition?.method ?? `#${code}`,
      description: definition?.[locale] ?? (locale === "ja" ? `不明な結果コード ${code}` : `Unknown result code ${code}`),
    };
  });
}

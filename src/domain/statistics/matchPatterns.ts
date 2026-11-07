import { getRoundDetails } from "../buckler/roundResults";
import type { NormalizedMatch } from "../buckler/types";
import { type RecordSummary, recentMatchSummary, toTokyoDate } from "./aggregateMatches";
import { ratingCharacterKey, ratingMatches } from "./ratingMatches";

function chronological(matches: NormalizedMatch[]): NormalizedMatch[] {
  return [...matches].sort(
    (left, right) =>
      left.playedAtEpoch - right.playedAtEpoch || left.replayId.localeCompare(right.replayId),
  );
}

function summary(matches: NormalizedMatch[]): RecordSummary {
  return recentMatchSummary(matches, matches.length);
}

function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export interface DailyRatingChange {
  leaguePoint?: number;
  masterRating?: number;
}

/**
 * Net LP and MR change per Tokyo day in ranked matches. Each change is the difference from the
 * previous ranked match of the same character, attributed to the day of the later match. Whether
 * the recorded value is from before or after a match is unverified, so this is an estimate.
 */
export function dailyRatingChanges(matches: NormalizedMatch[]): Map<string, DailyRatingChange> {
  const previous = new Map<string, { lp?: number; mr?: number }>();
  const days = new Map<string, DailyRatingChange>();
  for (const match of chronological(ratingMatches(matches))) {
    const key = ratingCharacterKey(match);
    const before = previous.get(key) ?? {};
    const lp = positive(match.subject.league_point);
    const mr = positive(match.subject.master_rating);
    const day = days.get(toTokyoDate(match.playedAtEpoch)) ?? {};
    if (lp !== undefined && before.lp !== undefined)
      day.leaguePoint = (day.leaguePoint ?? 0) + lp - before.lp;
    if (mr !== undefined && before.mr !== undefined)
      day.masterRating = (day.masterRating ?? 0) + mr - before.mr;
    if (day.leaguePoint !== undefined || day.masterRating !== undefined)
      days.set(toTokyoDate(match.playedAtEpoch), day);
    previous.set(key, { lp: lp ?? before.lp, mr: mr ?? before.mr });
  }
  return days;
}

export interface SessionPositionRecord {
  /** First game number in the bucket, starting at 1. */
  from: number;
  /** Last game number, or null for the open-ended final bucket. */
  to: number | null;
  record: RecordSummary;
}

/**
 * Win rate by position within a play session. A session ends when the next match starts more
 * than `gapSeconds` after the previous one.
 */
export function sessionPositionRecords(
  matches: NormalizedMatch[],
  gapSeconds = 30 * 60,
  bucketSize = 10,
  bucketCount = 5,
): SessionPositionRecord[] {
  const buckets = Array.from({ length: bucketCount }, () => [] as NormalizedMatch[]);
  let previous: NormalizedMatch | undefined;
  let position = 0;
  for (const match of chronological(matches)) {
    position =
      previous && match.playedAtEpoch - previous.playedAtEpoch <= gapSeconds ? position + 1 : 0;
    buckets[Math.min(bucketCount - 1, Math.floor(position / bucketSize))].push(match);
    previous = match;
  }
  return buckets.map((games, index) => ({
    from: index * bucketSize + 1,
    to: index === bucketCount - 1 ? null : (index + 1) * bucketSize,
    record: summary(games),
  }));
}

/** Round result codes that end a round, in display order. Draws (4) are excluded. */
export const FINISH_METHOD_CODES = [1, 2, 3, 5, 6, 7, 8] as const;

export interface FinishMethodBreakdown {
  won: Map<number, number>;
  lost: Map<number, number>;
}

export function hasCompleteRounds(match: NormalizedMatch): boolean {
  const own = match.subject.round_results;
  const theirs = match.opponent.round_results;
  return (
    !!own?.length &&
    !!theirs &&
    own.length === theirs.length &&
    [...own, ...theirs].every((code) => Number.isInteger(code) && code >= 0 && code <= 8)
  );
}

/** How the subject won and lost rounds, counted per finishing method. */
export function finishMethodBreakdown(matches: NormalizedMatch[]): FinishMethodBreakdown {
  const result: FinishMethodBreakdown = { won: new Map(), lost: new Map() };
  for (const match of matches) {
    if (!hasCompleteRounds(match)) continue;
    for (const round of getRoundDetails(
      match.subject.round_results,
      match.opponent.round_results,
      "en",
    )) {
      const target =
        round.outcome === "win" ? result.won : round.outcome === "loss" ? result.lost : null;
      if (target) target.set(round.code, (target.get(round.code) ?? 0) + 1);
    }
  }
  return result;
}

export interface InputTypeRecord {
  inputType: number | null;
  record: RecordSummary;
}

/** Record against each opponent control type; unknown types are kept as null. */
export function opponentInputTypeRecords(matches: NormalizedMatch[]): InputTypeRecord[] {
  const groups = new Map<number | null, NormalizedMatch[]>();
  for (const match of matches) {
    const type = match.opponent.battle_input_type;
    const key = typeof type === "number" && Number.isInteger(type) ? type : null;
    const group = groups.get(key);
    if (group) group.push(match);
    else groups.set(key, [match]);
  }
  return [...groups]
    .sort(
      ([left], [right]) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([inputType, games]) => ({ inputType, record: summary(games) }));
}

export interface Streaks {
  current: { result: "win" | "loss"; length: number } | null;
  longestWin: number;
  longestLoss: number;
}

/** Consecutive wins and losses. Draws and unknown results end a streak. */
export function streaks(matches: NormalizedMatch[]): Streaks {
  let run: { result: "win" | "loss"; length: number } | null = null;
  let longestWin = 0;
  let longestLoss = 0;
  for (const match of chronological(matches)) {
    if (match.result !== "win" && match.result !== "loss") {
      run = null;
      continue;
    }
    const previous: Streaks["current"] = run;
    const length: number = previous?.result === match.result ? previous.length + 1 : 1;
    run = { result: match.result, length };
    if (match.result === "win") longestWin = Math.max(longestWin, length);
    else longestLoss = Math.max(longestLoss, length);
  }
  return { current: run, longestWin, longestLoss };
}

export interface OpponentRecord {
  userCode: number;
  fighterId?: string;
  characterSlugs: string[];
  lastPlayedAtEpoch: number;
  record: RecordSummary;
}

/** Opponents met at least `minMatches` times, most frequent first. */
export function frequentOpponents(
  matches: NormalizedMatch[],
  minMatches = 3,
  limit = 10,
): OpponentRecord[] {
  const groups = new Map<number, NormalizedMatch[]>();
  for (const match of matches) {
    const code = match.opponent.player.short_id;
    if (!Number.isSafeInteger(code) || code <= 0) continue;
    const group = groups.get(code);
    if (group) group.push(match);
    else groups.set(code, [match]);
  }
  return [...groups]
    .filter(([, games]) => games.length >= minMatches)
    .map(([userCode, games]) => {
      const ordered = chronological(games);
      const latest = ordered[ordered.length - 1];
      return {
        userCode,
        fighterId: latest.opponent.player.fighter_id,
        characterSlugs: [
          ...new Set(
            ordered.map(
              (game) =>
                game.opponent.playing_character_tool_name ??
                game.opponent.character_tool_name ??
                "unknown",
            ),
          ),
        ],
        lastPlayedAtEpoch: latest.playedAtEpoch,
        record: summary(games),
      };
    })
    .sort(
      (left, right) =>
        right.record.matches - left.record.matches ||
        right.lastPlayedAtEpoch - left.lastPlayedAtEpoch,
    )
    .slice(0, limit);
}

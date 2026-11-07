import { getRoundDetails } from "../buckler/roundResults";
import type { NormalizedMatch } from "../buckler/types";
import { type RecordSummary, recentMatchSummary, toTokyoDate } from "./aggregateMatches";
import { isRankedMatch, ratingCharacterKey, ratingMatches } from "./ratingMatches";

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

export interface SessionPositionPoint {
  /** Game number within a play session, starting at 1. */
  position: number;
  /** True for the last point, which also holds every later game. */
  openEnded: boolean;
  record: RecordSummary;
}

/**
 * Record by game number within a play session. A session ends when the next match starts more
 * than `gapSeconds` after the previous one. Games after `maxPosition` share the last point.
 */
export function sessionPositionPoints(
  matches: NormalizedMatch[],
  gapSeconds = 30 * 60,
  maxPosition = 40,
): SessionPositionPoint[] {
  const groups = Array.from({ length: maxPosition }, () => [] as NormalizedMatch[]);
  let previous: NormalizedMatch | undefined;
  let position = 0;
  for (const match of chronological(matches)) {
    position =
      previous && match.playedAtEpoch - previous.playedAtEpoch <= gapSeconds ? position + 1 : 0;
    groups[Math.min(maxPosition - 1, position)].push(match);
    previous = match;
  }
  return groups.map((games, index) => ({
    position: index + 1,
    openEnded: index === maxPosition - 1,
    record: summary(games),
  }));
}

function decided(record: RecordSummary): number {
  return record.wins + record.losses;
}

/** Win rate averaged over neighbouring points, weighted by their decided games. */
export function smoothedWinRates(points: SessionPositionPoint[], radius = 3): (number | null)[] {
  return points.map((_, index) => {
    let wins = 0;
    let games = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const point = points[index + offset];
      if (!point) continue;
      wins += point.record.wins;
      games += decided(point.record);
    }
    return games > 0 ? (wins / games) * 100 : null;
  });
}

export interface SessionTrend {
  /** Change in win rate, in percentage points, per ten more games in a session. */
  perTenGames: number;
  /** Standard error of `perTenGames`, from the binomial variance of the overall win rate. */
  standardError: number;
  decidedGames: number;
}

/** Least-squares slope of win (1) or loss (0) against the game number within a session. */
export function sessionTrend(points: SessionPositionPoint[]): SessionTrend | null {
  const total = points.reduce((sum, point) => sum + decided(point.record), 0);
  if (total < 2) return null;
  const meanX =
    points.reduce((sum, point) => sum + point.position * decided(point.record), 0) / total;
  const wins = points.reduce((sum, point) => sum + point.record.wins, 0);
  const meanY = wins / total;
  let sxx = 0;
  let sxy = 0;
  for (const point of points) {
    const dx = point.position - meanX;
    sxx += decided(point.record) * dx * dx;
    sxy += dx * (point.record.wins - meanY * decided(point.record));
  }
  if (sxx === 0) return null;
  return {
    perTenGames: (sxy / sxx) * 10 * 100,
    standardError: Math.sqrt((meanY * (1 - meanY)) / sxx) * 10 * 100,
    decidedGames: total,
  };
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
  characterSlug: string;
  characterName?: string;
  lastPlayedAtEpoch: number;
  record: RecordSummary;
}

function opponentCharacterSlug(match: NormalizedMatch): string {
  return (
    match.opponent.playing_character_tool_name ?? match.opponent.character_tool_name ?? "unknown"
  );
}

/** Opponent and character pairs met at least `minMatches` times, most frequent first. */
export function frequentOpponents(
  matches: NormalizedMatch[],
  minMatches = 3,
  limit = 10,
): OpponentRecord[] {
  const groups = new Map<string, NormalizedMatch[]>();
  for (const match of matches) {
    const code = match.opponent.player.short_id;
    if (!Number.isSafeInteger(code) || code <= 0) continue;
    const key = `${code}:${opponentCharacterSlug(match)}`;
    const group = groups.get(key);
    if (group) group.push(match);
    else groups.set(key, [match]);
  }
  return [...groups.values()]
    .filter((games) => games.length >= minMatches)
    .map((games) => {
      const latest = chronological(games).at(-1) as NormalizedMatch;
      return {
        userCode: latest.opponent.player.short_id,
        fighterId: latest.opponent.player.fighter_id,
        characterSlug: opponentCharacterSlug(latest),
        characterName: latest.opponent.playing_character_name ?? latest.opponent.character_name,
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

export interface RankedSet {
  first: NormalizedMatch;
  second?: NormalizedMatch;
}

/**
 * Ranked sets are at most two games against the same opponent with the same characters, so the
 * game right after a first game against that opponent is the second game of the set.
 */
export function rankedSets(matches: NormalizedMatch[]): RankedSet[] {
  const sets: RankedSet[] = [];
  let previous: NormalizedMatch | undefined;
  let open: RankedSet | undefined;
  for (const match of chronological(matches)) {
    if (isRankedMatch(match)) {
      const secondGame =
        open !== undefined &&
        previous === open.first &&
        match.opponent.player.short_id > 0 &&
        open.first.opponent.player.short_id === match.opponent.player.short_id;
      if (secondGame && open) {
        open.second = match;
        open = undefined;
      } else {
        open = { first: match };
        sets.push(open);
      }
    } else open = undefined;
    previous = match;
  }
  return sets;
}

export interface RankedSetBreakdown {
  firstGames: RecordSummary;
  secondGames: RecordSummary;
  afterFirstWin: RecordSummary;
  afterFirstLoss: RecordSummary;
  twoWins: number;
  split: number;
  twoLosses: number;
  singleGame: number;
  /** Sets with a draw or unknown result. */
  other: number;
}

export function rankedSetBreakdown(matches: NormalizedMatch[]): RankedSetBreakdown {
  const sets = rankedSets(matches);
  const seconds = sets.flatMap((set) => (set.second ? [set] : []));
  const decided = (match: NormalizedMatch) => match.result === "win" || match.result === "loss";
  const result = { twoWins: 0, split: 0, twoLosses: 0, singleGame: 0, other: 0 };
  for (const set of sets) {
    if (!set.second) result.singleGame += 1;
    else if (!decided(set.first) || !decided(set.second)) result.other += 1;
    else {
      const wins = [set.first, set.second].filter((game) => game.result === "win").length;
      if (wins === 2) result.twoWins += 1;
      else if (wins === 1) result.split += 1;
      else result.twoLosses += 1;
    }
  }
  return {
    firstGames: summary(sets.map((set) => set.first)),
    secondGames: summary(seconds.map((set) => set.second as NormalizedMatch)),
    afterFirstWin: summary(
      seconds
        .filter((set) => set.first.result === "win")
        .map((set) => set.second as NormalizedMatch),
    ),
    afterFirstLoss: summary(
      seconds
        .filter((set) => set.first.result === "loss")
        .map((set) => set.second as NormalizedMatch),
    ),
    ...result,
  };
}

export interface LeaguePointDifferenceRecord {
  /** Inclusive lower bound of opponent LP minus own LP, or null when unbounded. */
  from: number | null;
  /** Inclusive upper bound, or null when unbounded. */
  to: number | null;
  record: RecordSummary;
}

const LP_DIFFERENCE_EDGES = [-1000, -300, 300, 1000];

/**
 * Ranked record by opponent LP minus own LP, for matches outside Master League where both
 * players have LP. Whether LP is recorded before or after the match is unverified.
 */
export function leaguePointDifferenceRecords(
  matches: NormalizedMatch[],
): LeaguePointDifferenceRecord[] {
  const groups = Array.from(
    { length: LP_DIFFERENCE_EDGES.length + 1 },
    () => [] as NormalizedMatch[],
  );
  for (const match of ratingMatches(matches)) {
    const own = positive(match.subject.league_point);
    const theirs = positive(match.opponent.league_point);
    if (
      own === undefined ||
      theirs === undefined ||
      positive(match.subject.master_rating) !== undefined ||
      positive(match.opponent.master_rating) !== undefined
    )
      continue;
    const difference = theirs - own;
    const index =
      difference <= LP_DIFFERENCE_EDGES[0]
        ? 0
        : difference <= LP_DIFFERENCE_EDGES[1]
          ? 1
          : difference < LP_DIFFERENCE_EDGES[2]
            ? 2
            : difference < LP_DIFFERENCE_EDGES[3]
              ? 3
              : 4;
    groups[index].push(match);
  }
  return [
    { from: null, to: -1000 },
    { from: -999, to: -300 },
    { from: -299, to: 299 },
    { from: 300, to: 999 },
    { from: 1000, to: null },
  ].map((band, index) => ({ ...band, record: summary(groups[index]) }));
}

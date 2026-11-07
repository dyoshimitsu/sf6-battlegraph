import { getRoundDetails } from "../buckler/roundResults";
import type { NormalizedMatch } from "../buckler/types";
import { aggregateMatches, recentMatchSummary } from "./aggregateMatches";
import { isRankedMatch, ratingMatches } from "./ratingMatches";

/** Hour (Japan time) at which a weekday row of the weekday/hour grid begins. */
export const DAY_START_HOUR = 6;

export function advancedInsights(matches: NormalizedMatch[]) {
  const rounds = {
    won: 0,
    lost: 0,
    firstWon: [] as NormalizedMatch[],
    firstLost: [] as NormalizedMatch[],
    deciding: [] as NormalizedMatch[],
  };
  for (const match of matches) {
    const a = match.subject.round_results,
      b = match.opponent.round_results;
    if (
      !a?.length ||
      !b ||
      a.length !== b.length ||
      [...a, ...b].some((code) => !Number.isInteger(code) || code < 0 || code > 8)
    )
      continue;
    const details = getRoundDetails(a, b, "en");
    rounds.won += details.filter((item) => item.outcome === "win").length;
    rounds.lost += details.filter((item) => item.outcome === "loss").length;
    if (details[0]?.outcome === "win") rounds.firstWon.push(match);
    if (details[0]?.outcome === "loss") rounds.firstLost.push(match);
    if (
      details.length === 3 &&
      details[0].outcome !== details[1].outcome &&
      ["win", "loss"].includes(details[0].outcome) &&
      ["win", "loss"].includes(details[1].outcome)
    )
      rounds.deciding.push(match);
  }
  const bands = new Map<number, NormalizedMatch[]>();
  const relative = [[], [], []] as NormalizedMatch[][];
  for (const match of ratingMatches(matches)) {
    const theirs = match.opponent.master_rating,
      ours = match.subject.master_rating;
    if (typeof theirs !== "number" || !Number.isFinite(theirs) || theirs <= 0) continue;
    const band = Math.floor(theirs / 100) * 100;
    const group = bands.get(band) ?? [];
    group.push(match);
    bands.set(band, group);
    if (typeof ours === "number" && Number.isFinite(ours) && ours > 0)
      relative[theirs - ours >= 50 ? 2 : theirs - ours <= -50 ? 0 : 1].push(match);
  }
  const hours = Array.from({ length: 24 }, () => [] as NormalizedMatch[]);
  const weekdays = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [] as NormalizedMatch[]),
  );
  for (const match of matches) {
    const local = new Date((match.playedAtEpoch + 9 * 3600) * 1000);
    // The weekday grid starts each day at 06:00, so 00:00-05:59 belongs to the previous day.
    const gameDay = new Date((match.playedAtEpoch + (9 - DAY_START_HOUR) * 3600) * 1000);
    hours[local.getUTCHours()].push(match);
    weekdays[gameDay.getUTCDay()][local.getUTCHours()].push(match);
  }
  // Ranked sets are at most two games against the same opponent with the same characters, so the
  // second game is the one right after a first game against that opponent.
  const rankedSets = [[], []] as NormalizedMatch[][];
  const chronological = [...matches].sort(
    (a, b) => a.playedAtEpoch - b.playedAtEpoch || a.replayId.localeCompare(b.replayId),
  );
  let previous: NormalizedMatch | undefined,
    position = 0;
  for (const match of chronological) {
    if (isRankedMatch(match)) {
      const secondGame =
        previous !== undefined &&
        isRankedMatch(previous) &&
        position === 0 &&
        match.opponent.player.short_id > 0 &&
        previous.opponent.player.short_id === match.opponent.player.short_id;
      position = secondGame ? 1 : 0;
      rankedSets[position].push(match);
    }
    previous = match;
  }
  return {
    rounds,
    bands: [...bands]
      .sort(([a], [b]) => a - b)
      .map(([band, games]) => ({ band, record: recentMatchSummary(games, games.length) })),
    relative: relative.map((games) => recentMatchSummary(games, games.length)),
    hours: hours.map((games) => recentMatchSummary(games, games.length)),
    weekdays: weekdays.map((day) => day.map((games) => recentMatchSummary(games, games.length))),
    rankedSets: rankedSets.map((games) => recentMatchSummary(games, games.length)),
    matchups: aggregateMatches(matches).byOpponentCharacter,
  };
}

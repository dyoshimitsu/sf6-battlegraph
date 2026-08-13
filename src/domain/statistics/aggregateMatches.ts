import { compareCharacterSlugs } from "../buckler/characterOrder";
import type {
  BucklerPlayerInfo,
  BucklerSourceType,
  MatchResult,
  NormalizedMatch,
} from "../buckler/types";

export interface MatchFilters {
  fromDate?: string;
  toDate?: string;
  mode?: BucklerSourceType;
  subjectCharacterId?: number;
}

export interface RecordSummary {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  winRate: number | null;
}

export interface CharacterRecord extends RecordSummary {
  characterId: number | null;
  characterName: string;
  characterSlug: string;
}

export interface DailyRecord extends RecordSummary {
  date: string;
}

export interface SideRecord extends RecordSummary {
  side: 1 | 2;
}

export interface MatchStatistics {
  overall: RecordSummary;
  bySubjectCharacter: CharacterRecord[];
  byOpponentCharacter: CharacterRecord[];
  byDay: DailyRecord[];
  bySide: [SideRecord, SideRecord];
}

const TOKYO_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function toTokyoDate(epochSeconds: number): string {
  const parts = TOKYO_DATE.formatToParts(new Date(epochSeconds * 1000));
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function characterId(player: BucklerPlayerInfo): number | null {
  return player.playing_character_id ?? player.character_id ?? null;
}

function characterName(player: BucklerPlayerInfo): string {
  return player.playing_character_name ?? player.character_name ?? "Unknown";
}

function characterSlug(player: BucklerPlayerInfo): string {
  return player.playing_character_tool_name ?? player.character_tool_name ?? "unknown";
}

export function filterMatches(
  matches: NormalizedMatch[],
  filters: MatchFilters,
): NormalizedMatch[] {
  return matches.filter((match) => {
    const date = toTokyoDate(match.playedAtEpoch);
    if (filters.fromDate && date < filters.fromDate) return false;
    if (filters.toDate && date > filters.toDate) return false;
    if (filters.mode && match.mode !== filters.mode && !match.sourceTypes.includes(filters.mode))
      return false;
    if (
      filters.subjectCharacterId !== undefined &&
      characterId(match.subject) !== filters.subjectCharacterId
    )
      return false;
    return true;
  });
}

function emptySummary(): RecordSummary {
  return { matches: 0, wins: 0, losses: 0, draws: 0, unknown: 0, winRate: null };
}

function addResult(summary: RecordSummary, result: MatchResult) {
  summary.matches += 1;
  if (result === "win") summary.wins += 1;
  else if (result === "loss") summary.losses += 1;
  else if (result === "draw") summary.draws += 1;
  else summary.unknown += 1;
  const decided = summary.wins + summary.losses;
  summary.winRate = decided > 0 ? (summary.wins / decided) * 100 : null;
}

function groupByCharacter(
  matches: NormalizedMatch[],
  selectPlayer: (match: NormalizedMatch) => BucklerPlayerInfo,
): CharacterRecord[] {
  const records = new Map<string, CharacterRecord>();
  for (const match of matches) {
    const player = selectPlayer(match);
    const id = characterId(player);
    const slug = characterSlug(player);
    const key = id === null ? `slug:${slug}` : `id:${id}`;
    const record = records.get(key) ?? {
      ...emptySummary(),
      characterId: id,
      characterName: characterName(player),
      characterSlug: slug,
    };
    addResult(record, match.result);
    records.set(key, record);
  }
  return Array.from(records.values()).sort(
    (left, right) =>
      right.matches - left.matches ||
      compareCharacterSlugs(left.characterSlug, right.characterSlug),
  );
}

export function aggregateMatches(matches: NormalizedMatch[]): MatchStatistics {
  const overall = emptySummary();
  const bySide: [SideRecord, SideRecord] = [
    { ...emptySummary(), side: 1 },
    { ...emptySummary(), side: 2 },
  ];
  const days = new Map<string, DailyRecord>();
  for (const match of matches) {
    addResult(overall, match.result);
    if (match.subjectSide !== null) addResult(bySide[match.subjectSide - 1], match.result);
    const date = toTokyoDate(match.playedAtEpoch);
    const day = days.get(date) ?? { ...emptySummary(), date };
    addResult(day, match.result);
    days.set(date, day);
  }
  return {
    overall,
    bySubjectCharacter: groupByCharacter(matches, (match) => match.subject),
    byOpponentCharacter: groupByCharacter(matches, (match) => match.opponent),
    byDay: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    bySide,
  };
}

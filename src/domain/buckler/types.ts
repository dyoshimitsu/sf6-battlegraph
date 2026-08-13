export interface BucklerPlayerIdentity {
  fighter_id?: string;
  platform_id?: number;
  short_id: number;
  platform_name?: string;
  platform_tool_name?: string;
  [key: string]: unknown;
}

export interface BucklerPlayerInfo {
  player: BucklerPlayerIdentity;
  character_id?: number;
  character_name?: string;
  character_tool_name?: string;
  playing_character_id?: number;
  playing_character_name?: string;
  playing_character_tool_name?: string;
  battle_input_type?: number;
  league_point?: number;
  league_rank?: number;
  master_rating?: number;
  round_results?: number[];
  [key: string]: unknown;
}

export interface BucklerReplay {
  replay_id: string;
  uploaded_at: number;
  battle_version?: number;
  replay_battle_type?: number;
  replay_battle_sub_type?: number;
  replay_battle_type_name?: string;
  replay_battle_sub_type_name?: string;
  player1_info: BucklerPlayerInfo;
  player2_info: BucklerPlayerInfo;
  [key: string]: unknown;
}

export interface BucklerPageProps {
  current_page: number;
  total_page: number;
  sid: number;
  replay_list: BucklerReplay[];
  common: {
    statusCode: number;
    isError?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BucklerPageResponse {
  pageProps: BucklerPageProps;
  [key: string]: unknown;
}

export interface BucklerPagePreview {
  userCode: number;
  currentPage: number;
  totalPages: number;
  matchCount: number;
  oldestPlayedAt?: number;
  newestPlayedAt?: number;
  battleTypes: string[];
  subjectMatches: number;
  warnings: string[];
  response: BucklerPageResponse;
}

export type BucklerSourceType = "all" | "ranked" | "casual" | "custom" | "hub" | "unknown";

export interface BucklerCollectorPage {
  sourceType: BucklerSourceType;
  sourcePath: string;
  page: number;
  fetchedAt: string;
  response: unknown;
}

export interface BucklerCollectorBundle {
  format: "sf6-battlegraph.collector";
  version: 1;
  userCode: number;
  buildId: string;
  exportedAt: string;
  pages: BucklerCollectorPage[];
  stopReason?: "known-replay";
  stoppedAtKnownReplayId?: string;
  knownReplayBoundaryCount?: number;
}

export type MatchResult = "win" | "loss" | "draw" | "unknown";

export interface NormalizedMatch {
  replayId: string;
  subjectUserCode: number;
  playedAtEpoch: number;
  battleVersion?: number;
  battleType?: number;
  battleSubType?: number;
  battleTypeName?: string;
  mode: BucklerSourceType;
  sourceTypes: BucklerSourceType[];
  subjectSide: 1 | 2 | null;
  result: MatchResult;
  roundsWon: number;
  roundsLost: number;
  subject: BucklerPlayerInfo;
  opponent: BucklerPlayerInfo;
  raw: BucklerReplay;
}

export interface CollectorSourceSummary {
  sourceType: BucklerSourceType;
  pages: number;
  expectedPages: number;
  rawMatches: number;
}

export interface BucklerBundlePreview {
  userCode: number;
  buildId?: string;
  exportedAt?: string;
  pageCount: number;
  rawMatchCount: number;
  uniqueMatchCount: number;
  duplicateCount: number;
  oldestPlayedAt?: number;
  newestPlayedAt?: number;
  matches: NormalizedMatch[];
  sources: CollectorSourceSummary[];
  warnings: string[];
  isSinglePage: boolean;
  stopReason?: "known-replay";
  stoppedAtKnownReplayId?: string;
  knownReplayBoundaryCount?: number;
}

export class BucklerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BucklerValidationError";
  }
}

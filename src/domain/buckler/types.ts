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

export class BucklerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BucklerValidationError";
  }
}

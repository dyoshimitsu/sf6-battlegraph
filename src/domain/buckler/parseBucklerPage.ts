import {
  type BucklerPagePreview,
  type BucklerPageResponse,
  type BucklerPlayerInfo,
  type BucklerReplay,
  BucklerValidationError,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BucklerValidationError(`${path} must be an object`);
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BucklerValidationError(`${path} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BucklerValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function parsePlayerInfo(value: unknown, path: string): BucklerPlayerInfo {
  const info = requireRecord(value, path);
  const player = requireRecord(info.player, `${path}.player`);
  requireNumber(player.short_id, `${path}.player.short_id`);
  return info as unknown as BucklerPlayerInfo;
}

function parseReplay(value: unknown, index: number): BucklerReplay {
  const path = `pageProps.replay_list[${index}]`;
  const replay = requireRecord(value, path);
  requireString(replay.replay_id, `${path}.replay_id`);
  requireNumber(replay.uploaded_at, `${path}.uploaded_at`);
  parsePlayerInfo(replay.player1_info, `${path}.player1_info`);
  parsePlayerInfo(replay.player2_info, `${path}.player2_info`);
  return replay as unknown as BucklerReplay;
}

export function parseBucklerPage(input: unknown, expectedUserCode?: number): BucklerPagePreview {
  const root = requireRecord(input, "response");
  const pageProps = requireRecord(root.pageProps, "pageProps");
  const common = requireRecord(pageProps.common, "pageProps.common");
  const statusCode = requireNumber(common.statusCode, "pageProps.common.statusCode");

  if (statusCode !== 200) {
    throw new BucklerValidationError(
      `Buckler returned statusCode ${statusCode}; sign in again and retry`,
    );
  }

  const userCode = requireNumber(pageProps.sid, "pageProps.sid");
  const currentPage = requireNumber(pageProps.current_page, "pageProps.current_page");
  const totalPages = requireNumber(pageProps.total_page, "pageProps.total_page");

  if (expectedUserCode !== undefined && userCode !== expectedUserCode) {
    throw new BucklerValidationError(
      `Expected user code ${expectedUserCode}, but the response belongs to ${userCode}`,
    );
  }

  if (!Array.isArray(pageProps.replay_list)) {
    throw new BucklerValidationError("pageProps.replay_list must be an array");
  }

  const replays = pageProps.replay_list.map(parseReplay);
  const warnings: string[] = [];
  const replayIds = new Set<string>();
  let subjectMatches = 0;

  for (const replay of replays) {
    if (replayIds.has(replay.replay_id)) {
      warnings.push(`Duplicate replay_id in this page: ${replay.replay_id}`);
    }
    replayIds.add(replay.replay_id);

    const player1IsSubject = replay.player1_info.player.short_id === userCode;
    const player2IsSubject = replay.player2_info.player.short_id === userCode;

    if (player1IsSubject !== player2IsSubject) {
      subjectMatches += 1;
    } else {
      warnings.push(`Replay ${replay.replay_id} does not contain exactly one subject player`);
    }
  }

  const timestamps = replays.map((replay) => replay.uploaded_at);
  const battleTypes = Array.from(
    new Set(
      replays.map(
        (replay) =>
          replay.replay_battle_type_name ?? `type:${replay.replay_battle_type ?? "unknown"}`,
      ),
    ),
  );

  return {
    userCode,
    currentPage,
    totalPages,
    matchCount: replays.length,
    oldestPlayedAt: timestamps.length ? Math.min(...timestamps) : undefined,
    newestPlayedAt: timestamps.length ? Math.max(...timestamps) : undefined,
    battleTypes,
    subjectMatches,
    warnings,
    response: root as unknown as BucklerPageResponse,
  };
}

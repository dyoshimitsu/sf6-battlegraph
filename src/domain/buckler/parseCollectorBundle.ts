import { parseBucklerPage } from "./parseBucklerPage";
import { inferBattleMode } from "./battleModes";
import {
  BucklerValidationError,
  type BucklerBundlePreview,
  type BucklerCollectorBundle,
  type BucklerCollectorPage,
  type BucklerPageResponse,
  type BucklerReplay,
  type BucklerSourceType,
  type CollectorSourceSummary,
  type MatchResult,
  type NormalizedMatch,
} from "./types";

const SOURCE_TYPES = new Set<BucklerSourceType>([
  "all",
  "ranked",
  "casual",
  "custom",
  "hub",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BucklerValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BucklerValidationError(`${path} must be a finite number`);
  }
  return value;
}

function parseIsoDate(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (!Number.isFinite(Date.parse(text))) {
    throw new BucklerValidationError(`${path} must be an ISO date string`);
  }
  return text;
}

function parseSourceType(value: unknown, path: string): BucklerSourceType {
  const sourceType = requireString(value, path) as BucklerSourceType;
  return SOURCE_TYPES.has(sourceType) ? sourceType : "unknown";
}

function parseBundle(input: unknown): BucklerCollectorBundle | null {
  if (!isRecord(input) || input.format !== "sf6-battlegraph.collector") {
    return null;
  }
  if (input.version !== 1) {
    throw new BucklerValidationError(
      `Unsupported collector format version: ${String(input.version)}`,
    );
  }

  const userCode = requireNumber(input.userCode, "bundle.userCode");
  const buildId = requireString(input.buildId, "bundle.buildId");
  const exportedAt = parseIsoDate(input.exportedAt, "bundle.exportedAt");
  const stopReason = input.stopReason === undefined ? undefined : requireString(input.stopReason, "bundle.stopReason");
  if (stopReason !== undefined && stopReason !== "known-replay") throw new BucklerValidationError("bundle.stopReason is unsupported");
  const stoppedAtKnownReplayId = stopReason === "known-replay" ? requireString(input.stoppedAtKnownReplayId, "bundle.stoppedAtKnownReplayId") : undefined;
  const knownReplayBoundaryCount = input.knownReplayBoundaryCount === undefined ? 0 : requireNumber(input.knownReplayBoundaryCount, "bundle.knownReplayBoundaryCount");
  if (!Number.isInteger(knownReplayBoundaryCount) || knownReplayBoundaryCount < 0 || knownReplayBoundaryCount > 20) throw new BucklerValidationError("bundle.knownReplayBoundaryCount must be an integer from 0 to 20");
  if (!Array.isArray(input.pages) || input.pages.length === 0) {
    throw new BucklerValidationError("bundle.pages must be a non-empty array");
  }

  const pages = input.pages.map((value, index): BucklerCollectorPage => {
    if (!isRecord(value)) {
      throw new BucklerValidationError(`bundle.pages[${index}] must be an object`);
    }
    return {
      sourceType: parseSourceType(
        value.sourceType,
        `bundle.pages[${index}].sourceType`,
      ),
      sourcePath: requireString(
        value.sourcePath,
        `bundle.pages[${index}].sourcePath`,
      ),
      page: requireNumber(value.page, `bundle.pages[${index}].page`),
      fetchedAt: parseIsoDate(
        value.fetchedAt,
        `bundle.pages[${index}].fetchedAt`,
      ),
      response: value.response,
    };
  });

  return {
    format: "sf6-battlegraph.collector",
    version: 1,
    userCode,
    buildId,
    exportedAt,
    pages,
    knownReplayBoundaryCount,
    ...(stopReason === "known-replay" ? { stopReason, stoppedAtKnownReplayId } : {}),
  };
}

function countRoundWins(results: number[] | undefined): number {
  return results?.filter((result) => result !== 0).length ?? 0;
}

function inferResult(roundsWon: number, roundsLost: number): MatchResult {
  if (roundsWon > roundsLost) return "win";
  if (roundsWon < roundsLost) return "loss";
  if (roundsWon > 0) return "draw";
  return "unknown";
}

function normalizeReplay(
  replay: BucklerReplay,
  userCode: number,
  sourceType: BucklerSourceType,
): NormalizedMatch {
  const player1IsSubject = replay.player1_info.player.short_id === userCode;
  const player2IsSubject = replay.player2_info.player.short_id === userCode;
  if (player1IsSubject === player2IsSubject) {
    throw new BucklerValidationError(
      `Replay ${replay.replay_id} does not contain exactly one subject player`,
    );
  }

  const subjectSide = player1IsSubject ? 1 : 2;
  const subject = player1IsSubject ? replay.player1_info : replay.player2_info;
  const opponent = player1IsSubject ? replay.player2_info : replay.player1_info;
  const roundsWon = countRoundWins(subject.round_results);
  const roundsLost = countRoundWins(opponent.round_results);

  return {
    replayId: replay.replay_id,
    subjectUserCode: userCode,
    playedAtEpoch: replay.uploaded_at,
    battleVersion: replay.battle_version,
    battleType: replay.replay_battle_type,
    battleSubType: replay.replay_battle_sub_type,
    battleTypeName: replay.replay_battle_type_name,
    mode: inferBattleMode(replay, sourceType),
    sourceTypes: [sourceType],
    subjectSide,
    result: inferResult(roundsWon, roundsLost),
    roundsWon,
    roundsLost,
    subject,
    opponent,
    raw: replay,
  };
}

function addSourceSummary(
  summaries: Map<BucklerSourceType, CollectorSourceSummary>,
  sourceType: BucklerSourceType,
  expectedPages: number,
  rawMatches: number,
) {
  const summary = summaries.get(sourceType) ?? {
    sourceType,
    pages: 0,
    expectedPages: 0,
    rawMatches: 0,
  };
  summary.pages += 1;
  summary.expectedPages = Math.max(summary.expectedPages, expectedPages);
  summary.rawMatches += rawMatches;
  summaries.set(sourceType, summary);
}

export function parseCollectorImport(
  input: unknown,
  expectedUserCode?: number,
): BucklerBundlePreview {
  const bundle = parseBundle(input);
  const isSinglePage = bundle === null;
  const pages: BucklerCollectorPage[] = bundle?.pages ?? [
    {
      sourceType: "unknown",
      sourcePath: "imported-page",
      page: 1,
      fetchedAt: new Date(0).toISOString(),
      response: input,
    },
  ];
  const userCode = bundle?.userCode ?? expectedUserCode;
  if (userCode === undefined) {
    throw new BucklerValidationError("An expected user code is required");
  }
  if (expectedUserCode !== undefined && userCode !== expectedUserCode) {
    throw new BucklerValidationError(
      `Expected user code ${expectedUserCode}, but the bundle belongs to ${userCode}`,
    );
  }

  const matches = new Map<string, NormalizedMatch>();
  const sourceSummaries = new Map<BucklerSourceType, CollectorSourceSummary>();
  const pageKeys = new Set<string>();
  const warnings: string[] = [];
  let rawMatchCount = 0;

  for (const [index, page] of pages.entries()) {
    const parsed = parseBucklerPage(page.response, userCode);
    if (bundle && page.page !== parsed.currentPage) {
      throw new BucklerValidationError(
        `bundle.pages[${index}].page does not match response current_page`,
      );
    }

    const pageKey = `${page.sourceType}:${parsed.currentPage}`;
    if (pageKeys.has(pageKey)) {
      warnings.push(`Duplicate source page: ${pageKey}`);
    }
    pageKeys.add(pageKey);
    warnings.push(...parsed.warnings.map((warning) => `${pageKey}: ${warning}`));
    rawMatchCount += parsed.matchCount;
    addSourceSummary(
      sourceSummaries,
      page.sourceType,
      parsed.totalPages,
      parsed.matchCount,
    );

    const response = parsed.response as BucklerPageResponse;
    for (const replay of response.pageProps.replay_list) {
      let normalized: NormalizedMatch;
      try {
        normalized = normalizeReplay(replay, userCode, page.sourceType);
      } catch (cause) {
        if (cause instanceof BucklerValidationError) {
          warnings.push(`${pageKey}: ${cause.message}`);
          continue;
        }
        throw cause;
      }

      const existing = matches.get(normalized.replayId);
      if (existing) {
        if (!existing.sourceTypes.includes(page.sourceType)) {
          existing.sourceTypes.push(page.sourceType);
        }
        if (existing.mode === "all" || existing.mode === "unknown") {
          existing.mode = page.sourceType;
        }
      } else {
        matches.set(normalized.replayId, normalized);
      }
    }
  }

  for (const source of sourceSummaries.values()) {
    if (source.pages < source.expectedPages && bundle?.stopReason !== "known-replay") {
      warnings.push(
        `${source.sourceType}: imported ${source.pages} of ${source.expectedPages} pages`,
      );
    }
  }
  if (bundle?.stopReason === "known-replay" && !matches.has(bundle.stoppedAtKnownReplayId ?? "")) {
    throw new BucklerValidationError("bundle stoppedAtKnownReplayId was not found in the fetched pages");
  }
  if ((bundle?.knownReplayBoundaryCount ?? 0) > 0 && bundle?.stopReason !== "known-replay") {
    warnings.push("Known replay boundary was not found; all available pages were fetched");
  }

  const normalizedMatches = Array.from(matches.values()).sort(
    (left, right) => right.playedAtEpoch - left.playedAtEpoch,
  );
  const timestamps = normalizedMatches.map((match) => match.playedAtEpoch);

  return {
    userCode,
    buildId: bundle?.buildId,
    exportedAt: bundle?.exportedAt,
    pageCount: pages.length,
    rawMatchCount,
    uniqueMatchCount: normalizedMatches.length,
    duplicateCount: rawMatchCount - normalizedMatches.length,
    oldestPlayedAt: timestamps.length ? Math.min(...timestamps) : undefined,
    newestPlayedAt: timestamps.length ? Math.max(...timestamps) : undefined,
    matches: normalizedMatches,
    sources: Array.from(sourceSummaries.values()),
    warnings,
    isSinglePage,
    stopReason: bundle?.stopReason,
    stoppedAtKnownReplayId: bundle?.stoppedAtKnownReplayId,
    knownReplayBoundaryCount: bundle?.knownReplayBoundaryCount,
  };
}

import type {
  BucklerCollectorBundle,
  BucklerCollectorPage,
  BucklerPageResponse,
  BucklerSourceType,
} from "../domain/buckler/types";
import { parseBucklerPage } from "../domain/buckler/parseBucklerPage";

export interface CollectorSource {
  sourceType: BucklerSourceType;
  sourcePath: string;
  routeSuffix: string;
}

export interface CollectorOptions {
  buildId: string;
  locale: string;
  userCode: number;
  origin?: string;
  sources?: CollectorSource[];
  fetcher?: typeof fetch;
  now?: () => Date;
  delayMs?: number;
  onProgress?: (progress: CollectorProgress) => void;
}

export interface CollectorProgress {
  sourceType: BucklerSourceType;
  page: number;
  totalPages?: number;
}

export const DEFAULT_COLLECTOR_SOURCES: CollectorSource[] = [
  { sourceType: "all", sourcePath: "/battlelog", routeSuffix: "" },
];

export const MODE_SPECIFIC_COLLECTOR_SOURCES: CollectorSource[] = [
  { sourceType: "ranked", sourcePath: "/battlelog/rank", routeSuffix: "/rank" },
  { sourceType: "casual", sourcePath: "/battlelog/casual", routeSuffix: "/casual" },
  { sourceType: "custom", sourcePath: "/battlelog/custom", routeSuffix: "/custom" },
  { sourceType: "hub", sourcePath: "/battlelog/hub", routeSuffix: "/hub" },
];

function assertPathSegment(value: string, name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return value;
}

export function buildBattleLogDataUrl(
  origin: string,
  buildId: string,
  locale: string,
  userCode: number,
  routeSuffix: string,
  page: number,
): string {
  if (!Number.isSafeInteger(userCode) || userCode <= 0) {
    throw new Error("userCode must be a positive safe integer");
  }
  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new Error("page must be a positive safe integer");
  }
  if (routeSuffix !== "" && !/^\/[a-z]+$/.test(routeSuffix)) {
    throw new Error("routeSuffix must be empty or a simple route segment");
  }

  const safeBuildId = assertPathSegment(buildId, "buildId");
  const safeLocale = assertPathSegment(locale.toLowerCase(), "locale");
  const path = `/6/buckler/_next/data/${safeBuildId}/${safeLocale}/profile/${userCode}/battlelog${routeSuffix}.json`;
  const url = new URL(path, origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sid", String(userCode));
  return url.toString();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function fetchPage(
  url: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Buckler returned a non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`Buckler request failed with HTTP ${response.status}`);
  }
  return json;
}

export async function collectBattleLogs(
  options: CollectorOptions,
): Promise<BucklerCollectorBundle> {
  const origin = options.origin ?? window.location.origin;
  const sources = options.sources ?? DEFAULT_COLLECTOR_SOURCES;
  const fetcher = options.fetcher ?? window.fetch.bind(window);
  const now = options.now ?? (() => new Date());
  const delayMs = options.delayMs ?? 200;
  const pages: BucklerCollectorPage[] = [];

  for (const source of sources) {
    let pageNumber = 1;
    let totalPages = 1;
    do {
      options.onProgress?.({
        sourceType: source.sourceType,
        page: pageNumber,
        totalPages: pageNumber === 1 ? undefined : totalPages,
      });
      const url = buildBattleLogDataUrl(
        origin,
        options.buildId,
        options.locale,
        options.userCode,
        source.routeSuffix,
        pageNumber,
      );
      const response = await fetchPage(url, fetcher);
      const preview = parseBucklerPage(response, options.userCode);
      totalPages = preview.totalPages;
      pages.push({
        sourceType: source.sourceType,
        sourcePath: source.sourcePath,
        page: pageNumber,
        fetchedAt: now().toISOString(),
        response: response as BucklerPageResponse,
      });
      pageNumber += 1;
      if (pageNumber <= totalPages && delayMs > 0) {
        await wait(delayMs);
      }
    } while (pageNumber <= totalPages);
  }

  return {
    format: "sf6-battlegraph.collector",
    version: 1,
    userCode: options.userCode,
    buildId: options.buildId,
    exportedAt: now().toISOString(),
    pages,
  };
}

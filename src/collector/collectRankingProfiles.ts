import { inferBattleMode } from "../domain/buckler/battleModes";
import type {
  BucklerCollectorBundle,
  BucklerPageResponse,
  RankingProfileSnapshot,
  RankingSnapshot,
} from "../domain/buckler/types";

export const RANKING_PROFILE_COUNT = 3;

/** Query observed on the Buckler master rating ranking page; the meaning of each flag is unverified. */
export function rankingQuery(characterSlug: string): Record<string, string> {
  return {
    character_filter: "4",
    character_id: characterSlug,
    platform: "1",
    home_filter: "1",
    home_category_id: "0",
    home_id: "0",
    page: "1",
    season_type: "1",
  };
}

/** The character the subject used in the latest ranked match of the bundle. */
export function latestRankedCharacterSlug(bundle: BucklerCollectorBundle): string | undefined {
  let latest: { at: number; slug: string } | undefined;
  for (const page of bundle.pages) {
    for (const replay of (page.response as BucklerPageResponse).pageProps.replay_list) {
      if (inferBattleMode(replay, page.sourceType) !== "ranked") continue;
      const subject =
        replay.player1_info.player.short_id === bundle.userCode
          ? replay.player1_info
          : replay.player2_info.player.short_id === bundle.userCode
            ? replay.player2_info
            : undefined;
      const slug = subject?.playing_character_tool_name ?? subject?.character_tool_name;
      if (slug && /^[a-z0-9_]+$/.test(slug) && (!latest || replay.uploaded_at > latest.at))
        latest = { at: replay.uploaded_at, slug };
    }
  }
  return latest?.slug;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Leaders in ranking order, excluding the subject. */
export function rankingLeaderCodes(response: unknown, subjectUserCode: number, count: number) {
  const ranking = record(record(record(response)?.pageProps)?.master_rating_ranking);
  const list = Array.isArray(ranking?.ranking_fighter_list) ? ranking.ranking_fighter_list : [];
  return list
    .map((entry) => {
      const item = record(entry);
      const userCode = record(record(item?.fighter_banner_info)?.personal_info)?.short_id;
      return { userCode, order: item?.order };
    })
    .filter(
      (item): item is { userCode: number; order: number } =>
        typeof item.userCode === "number" &&
        Number.isSafeInteger(item.userCode) &&
        item.userCode > 0 &&
        item.userCode !== subjectUserCode &&
        typeof item.order === "number",
    )
    .sort((left, right) => left.order - right.order)
    .slice(0, count);
}

async function fetchJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Buckler request failed with HTTP ${response.status}`);
  return response.json();
}

export async function collectRankingProfiles(
  bundle: BucklerCollectorBundle,
  fetcher: typeof fetch,
  origin: string,
  locale: string,
  now: () => Date = () => new Date(),
  delayMs = 200,
): Promise<RankingSnapshot | undefined> {
  const characterSlug = latestRankedCharacterSlug(bundle);
  if (!characterSlug) return undefined;
  const base = `/6/buckler/_next/data/${encodeURIComponent(bundle.buildId)}/${encodeURIComponent(locale)}`;
  const query = rankingQuery(characterSlug);
  const rankingUrl = new URL(`${base}/ranking/master.json`, origin);
  for (const [key, value] of Object.entries(query)) rankingUrl.searchParams.set(key, value);
  const response = await fetchJson(fetcher, rankingUrl.toString());
  const fetchedAt = now().toISOString();
  const topProfiles: RankingProfileSnapshot[] = [];
  for (const leader of rankingLeaderCodes(response, bundle.userCode, RANKING_PROFILE_COUNT)) {
    if (delayMs > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    const url = new URL(`${base}/profile/${leader.userCode}/play.json`, origin);
    url.searchParams.set("sid", String(leader.userCode));
    try {
      topProfiles.push({
        userCode: leader.userCode,
        order: leader.order,
        fetchedAt: now().toISOString(),
        response: await fetchJson(fetcher, url.toString()),
      });
    } catch {
      /* Keep the other leaders when one profile cannot be read. */
    }
  }
  return { characterSlug, query, fetchedAt, response, topProfiles };
}

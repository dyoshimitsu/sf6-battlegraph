import { parseOpponentPeak } from "../domain/buckler/opponentPeak";
import type {
  BucklerCollectorBundle,
  BucklerPageResponse,
  OpponentPeakSnapshot,
} from "../domain/buckler/types";

export async function collectOpponentPeaks(
  bundle: BucklerCollectorBundle,
  fetcher: typeof fetch,
  origin: string,
  locale: string,
  now: () => Date = () => new Date(),
): Promise<OpponentPeakSnapshot[]> {
  const playUrl = new URL(
    `/6/buckler/_next/data/${encodeURIComponent(bundle.buildId)}/${encodeURIComponent(locale)}/profile/${bundle.userCode}/play.json`,
    origin,
  );
  playUrl.searchParams.set("sid", String(bundle.userCode));
  const profile = await fetcher(playUrl.toString(), {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!profile.ok) throw new Error(`Profile request failed with HTTP ${profile.status}`);
  const data: unknown = await profile.json();
  const actId = (data as { pageProps?: { play?: { current_season_id?: unknown } } })?.pageProps
    ?.play?.current_season_id;
  if (typeof actId !== "number" || !Number.isSafeInteger(actId) || actId < 0)
    throw new Error("Current Act is unavailable");
  const opponents = new Set<number>();
  for (const page of bundle.pages) {
    const response = page.response as BucklerPageResponse;
    for (const replay of response.pageProps.replay_list) {
      const player =
        replay.player1_info.player.short_id === bundle.userCode
          ? replay.player2_info.player
          : replay.player1_info.player;
      if (
        Number.isSafeInteger(player.short_id) &&
        player.short_id > 0 &&
        player.short_id !== bundle.userCode
      )
        opponents.add(player.short_id);
    }
  }
  const snapshots: OpponentPeakSnapshot[] = [];
  for (const userCode of opponents) {
    try {
      const result = await fetcher(
        new URL("/6/buckler/api/profile/play/act/highest/master_rating_info", origin).toString(),
        {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({
            targetShortId: userCode,
            targetSeasonId: actId,
            locale,
            peak: false,
          }),
        },
      );
      if (!result.ok) continue;
      const snapshot = {
        userCode,
        actId,
        fetchedAt: now().toISOString(),
        response: (await result.json()) as unknown,
      };
      parseOpponentPeak(snapshot);
      snapshots.push(snapshot);
    } catch {
      /* Preserve the battle log when an individual profile cannot be read. */
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
  }
  return snapshots;
}

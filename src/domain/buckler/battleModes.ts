import type { BucklerReplay, BucklerSourceType } from "./types";

const MODES_BY_TYPE: Readonly<Record<number, BucklerSourceType>> = {
  1: "ranked",
};

export function inferBattleMode(
  replay: Pick<BucklerReplay, "replay_battle_type" | "replay_battle_type_name">,
  sourceType: BucklerSourceType = "unknown",
): BucklerSourceType {
  const name = replay.replay_battle_type_name?.trim().toUpperCase() ?? "";
  if (name.includes("RANKED")) return "ranked";
  if (name.includes("CASUAL")) return "casual";
  if (name.includes("BATTLE HUB")) return "hub";
  if (name.includes("CUSTOM") || name.includes("ROOM MATCH")) return "custom";
  if (replay.replay_battle_type !== undefined && MODES_BY_TYPE[replay.replay_battle_type]) return MODES_BY_TYPE[replay.replay_battle_type];
  return sourceType === "all" ? "unknown" : sourceType;
}

import type { BucklerPlayerInfo } from "./types";
import type { Locale } from "../../i18n/translations";

const ENGLISH_NAMES: Record<string, string> = {
  aki: "A.K.I.",
  akuma: "Akuma",
  alex: "Alex",
  blanka: "Blanka",
  cammy: "Cammy",
  chunli: "Chun-Li",
  cviper: "C. Viper",
  deejay: "Dee Jay",
  dhalsim: "Dhalsim",
  dictater: "M. Bison",
  dictator: "M. Bison",
  ed: "Ed",
  elena: "Elena",
  guile: "Guile",
  honda: "E. Honda",
  ehonda: "E. Honda",
  ingrid: "Ingrid",
  jamie: "Jamie",
  jp: "JP",
  juri: "Juri",
  ken: "Ken",
  kimberly: "Kimberly",
  lily: "Lily",
  luke: "Luke",
  mai: "Mai",
  manon: "Manon",
  marisa: "Marisa",
  mbison: "M. Bison",
  rashid: "Rashid",
  ryu: "Ryu",
  sagat: "Sagat",
  terry: "Terry",
  yasmine: "Yasmine",
  zangief: "Zangief",
};

export function getCharacterSlug(player: BucklerPlayerInfo): string {
  return player.playing_character_tool_name ?? player.character_tool_name ?? "unknown";
}

export function getCharacterName(
  player: BucklerPlayerInfo,
  locale: Locale,
): string {
  const rawName = player.playing_character_name ?? player.character_name;
  const slug = getCharacterSlug(player).toLowerCase();

  if (locale === "en") {
    return ENGLISH_NAMES[slug] ?? rawName ?? slug;
  }
  return rawName ?? ENGLISH_NAMES[slug] ?? slug;
}

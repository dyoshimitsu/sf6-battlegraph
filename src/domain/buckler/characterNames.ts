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
  random: "Random",
};

const JAPANESE_NAMES: Record<string, string> = {
  luke: "ルーク", jamie: "ジェイミー", manon: "マノン", kimberly: "キンバリー",
  marisa: "マリーザ", lily: "リリー", jp: "JP", juri: "ジュリ", deejay: "ディージェイ",
  cammy: "キャミィ", ryu: "リュウ", honda: "エドモンド本田", blanka: "ブランカ",
  guile: "ガイル", ken: "ケン", chunli: "春麗", zangief: "ザンギエフ", dhalsim: "ダルシム",
  rashid: "ラシード", aki: "A.K.I.", ed: "エド", akuma: "豪鬼", dictator: "ベガ",
  terry: "テリー", mai: "舞", elena: "エレナ", sagat: "サガット", cviper: "C.ヴァイパー",
  alex: "アレックス", ingrid: "イングリッド", yasmine: "ヤスミン", random: "ランダム",
};

export function getCharacterNameBySlug(slug: string, locale: Locale, rawName?: string): string {
  const normalized = slug.toLowerCase();
  return locale === "en"
    ? ENGLISH_NAMES[normalized] ?? rawName ?? slug
    : rawName ?? JAPANESE_NAMES[normalized] ?? ENGLISH_NAMES[normalized] ?? slug;
}

export function getCharacterSlug(player: BucklerPlayerInfo): string {
  return player.playing_character_tool_name ?? player.character_tool_name ?? "unknown";
}

export function getCharacterName(
  player: BucklerPlayerInfo,
  locale: Locale,
): string {
  const rawName = player.playing_character_name ?? player.character_name;
  const slug = getCharacterSlug(player).toLowerCase();

  return getCharacterNameBySlug(slug, locale, rawName);
}

export const CHARACTER_ORDER = [
  "luke", "jamie", "manon", "kimberly", "marisa", "lily", "jp", "juri",
  "deejay", "cammy", "ryu", "honda", "blanka", "guile", "ken", "chunli",
  "zangief", "dhalsim", "rashid", "aki", "ed", "akuma", "dictator", "terry",
  "mai", "elena", "sagat", "cviper", "alex", "ingrid", "yasmine", "random",
] as const;

export type RosterCharacterSlug = (typeof CHARACTER_ORDER)[number];

const SLUG_ALIASES: Record<string, string> = {
  ehonda: "honda",
  gouki: "akuma",
  mbison: "dictator",
  dictater: "dictator",
  vega: "dictator",
};

export function normalizeCharacterSlug(slug: string): string {
  return SLUG_ALIASES[slug.toLowerCase()] ?? slug.toLowerCase();
}

export function characterOrderIndex(slug: string): number {
  const normalized = normalizeCharacterSlug(slug);
  const index = CHARACTER_ORDER.indexOf(normalized as (typeof CHARACTER_ORDER)[number]);
  if (index >= 0) return index;
  // Unrecognized future characters belong immediately before RANDOM.
  return CHARACTER_ORDER.length - 1;
}

export function compareCharacterSlugs(left: string, right: string): number {
  const order = characterOrderIndex(left) - characterOrderIndex(right);
  return order || left.localeCompare(right);
}

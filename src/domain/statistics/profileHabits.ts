const fields = ["drive_impact", "drive_parry", "just_parry", "throw_count", "corner_time"] as const;
export type ProfileHabits = {
  fetchedAt: string;
  values: Partial<Record<(typeof fields)[number], number>>;
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseProfileHabits(
  raw: unknown,
  fetchedAt: unknown,
  userCode: number,
): ProfileHabits | null {
  const props = object(object(raw)?.pageProps),
    common = object(props?.common);
  const stats = object(object(props?.play)?.battle_stats);
  if (
    props?.sid !== userCode ||
    common?.statusCode !== 200 ||
    common?.isError === true ||
    !stats ||
    typeof fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(fetchedAt))
  )
    return null;
  const values: ProfileHabits["values"] = {};
  for (const field of fields) {
    const value = stats[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[field] = value;
  }
  return Object.keys(values).length ? { fetchedAt, values } : null;
}

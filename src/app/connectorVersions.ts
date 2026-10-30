// Raise this only when older connector versions are no longer compatible.
export const MIN_CONNECTOR_VERSION = "1.1.3";

function parts(version: string): number[] | null {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) return null;
  const values = version.split(".").map(Number);
  return values.every((value) => Number.isSafeInteger(value) && value >= 0) ? values : null;
}

function compare(left: number[], right: number[]): number {
  for (let index = 0; index < 4; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isConnectorCompatible(version: string | null | undefined, latest: string): boolean {
  if (!version) return false;
  const installed = parts(version),
    minimum = parts(MIN_CONNECTOR_VERSION),
    maximum = parts(latest);
  return (
    !!installed &&
    !!minimum &&
    !!maximum &&
    compare(installed, minimum) >= 0 &&
    compare(installed, maximum) <= 0
  );
}

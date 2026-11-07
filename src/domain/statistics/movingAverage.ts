export function movingAverage(values: (number | null)[], windowSize: number): (number | null)[] {
  if (!Number.isSafeInteger(windowSize) || windowSize < 1) throw new Error("Invalid window size");
  return values.map((_, index) => {
    if (index + 1 < windowSize) return null;
    const window = values.slice(index + 1 - windowSize, index + 1);
    if (window.some((value) => value === null || !Number.isFinite(value))) return null;
    return (window as number[]).reduce((total, value) => total + value, 0) / windowSize;
  });
}

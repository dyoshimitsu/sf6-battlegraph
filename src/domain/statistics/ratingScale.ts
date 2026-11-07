export function ratingScale(values: number[], baseStep: number) {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  let min = Math.floor(lowest / baseStep) * baseStep;
  let max = Math.ceil(highest / baseStep) * baseStep;
  if (min === max) {
    min -= baseStep;
    max += baseStep;
  }
  const step = Math.ceil((max - min) / baseStep / 6) * baseStep;
  return { min, max, step };
}

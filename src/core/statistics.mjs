export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function finiteNumbers(values) {
  return Array.from(values ?? []).filter(Number.isFinite);
}

export function average(values) {
  const numbers = finiteNumbers(values);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function median(values) {
  const numbers = finiteNumbers(values).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function quantile(values, probability) {
  const numbers = finiteNumbers(values).sort((a, b) => a - b);
  if (!numbers.length) return null;

  const p = clamp(Number(probability), 0, 1);
  const position = (numbers.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return numbers[lower];
  return numbers[lower] + (numbers[upper] - numbers[lower]) * (position - lower);
}

export function iqrFilter(values, multiplier = 1.5) {
  const numbers = finiteNumbers(values).sort((a, b) => a - b);
  if (numbers.length < 4) {
    return {
      kept: numbers,
      removed: [],
      lowerFence: null,
      upperFence: null,
      q1: null,
      q3: null,
      iqr: null
    };
  }

  const q1 = quantile(numbers, 0.25);
  const q3 = quantile(numbers, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - multiplier * iqr;
  const upperFence = q3 + multiplier * iqr;
  const kept = numbers.filter(value => value >= lowerFence && value <= upperFence);
  const removed = numbers.filter(value => value < lowerFence || value > upperFence);

  return {
    kept: kept.length ? kept : numbers,
    removed,
    lowerFence,
    upperFence,
    q1,
    q3,
    iqr
  };
}

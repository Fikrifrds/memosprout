/**
 * Uncertainty for proportions.
 *
 * Sample sizes here are small (15 cases x 3 repetitions per arm), so a
 * bare percentage would overstate what the run establishes. Wilson score
 * intervals behave sensibly at the boundaries, which matters because
 * several arms are expected to land on 0/n or n/n.
 */
export interface Proportion {
  passed: number;
  total: number;
  rate: number;
  /** 95% Wilson score interval. */
  ci95: [number, number];
}

const Z = 1.959963984540054;

export function proportion(passed: number, total: number): Proportion {
  if (total === 0) return { passed, total, rate: 0, ci95: [0, 0] };

  const rate = passed / total;
  const denominator = 1 + (Z * Z) / total;
  const centre = rate + (Z * Z) / (2 * total);
  const margin = Z * Math.sqrt((rate * (1 - rate)) / total + (Z * Z) / (4 * total * total));

  const round = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(4));
  return {
    passed,
    total,
    rate: Number(rate.toFixed(4)),
    ci95: [round((centre - margin) / denominator), round((centre + margin) / denominator)],
  };
}

export interface Distribution {
  n: number;
  mean: number;
  median: number;
  p95: number;
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) return { n: 0, mean: 0, median: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (quantile: number) => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]!;
  return {
    n: sorted.length,
    mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(1)),
    median: at(0.5),
    p95: at(0.95),
  };
}

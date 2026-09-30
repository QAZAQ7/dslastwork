import type { Split } from "./types";

export function money(value: unknown): number {
  return Math.round(Number(value) * 100) / 100;
}

export function validatePositiveAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  return money(amount);
}

export function validateSplit(split: Split): void {
  const values = [split.richard, split.anastasia, split.jean];
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
    throw new Error("Each commission share must be between 0% and 100%.");
  }
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 100) > 0.0001) {
    throw new Error("Commission shares must total exactly 100%.");
  }
}

export function calculateCommissions(amount: number, split: Split) {
  validateSplit(split);
  const pool = money(amount * 0.1);
  const result = {
    richard: money((pool * split.richard) / 100),
    anastasia: money((pool * split.anastasia) / 100),
    jean: money((pool * split.jean) / 100),
  };

  const difference = money(pool - result.richard - result.anastasia - result.jean);
  if (difference !== 0) {
    const largest = Math.max(split.richard, split.anastasia, split.jean);
    const priority: Array<keyof Split> = ["richard", "anastasia", "jean"];
    const recipient = priority.find((name) => split[name] === largest)!;
    result[recipient] = money(result[recipient] + difference);
  }

  return { pool, ...result };
}

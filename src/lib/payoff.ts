import type { Card } from "./types";

export type PayoffMethod = "snowball" | "avalanche";

export function sortByPayoff<T extends { card: Card }>(entries: readonly T[], method: PayoffMethod): T[] {
  return entries.map((entry) => {
    const rates = entry.card.aprs.map((apr) => apr.percentage).filter(Number.isFinite);
    const value = method === "snowball" ? entry.card.balance : rates.length ? Math.max(...rates) : null;
    return { entry, value: value !== null && Number.isFinite(value) ? value : null };
  }).sort((a, b) => {
    if (a.value === null) return b.value === null ? 0 : 1;
    if (b.value === null) return -1;
    return method === "snowball" ? a.value - b.value : b.value - a.value;
  }).map(({ entry }) => entry);
}

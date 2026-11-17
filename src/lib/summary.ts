import type { Card, Connection } from "./types";

// Sum only known USD balances; callers disclose how many cards were left out.
export function totalOwed(connections: Connection[]) {
  const cards = connections.flatMap((connection) => connection.cards);
  const usd = cards.filter((card) => card.currency === "USD" && card.balance !== null);
  return { totalUsd: usd.reduce((sum, card) => sum + card.balance!, 0), included: usd.length, count: cards.length };
}

// The user's local calendar date as YYYY-MM-DD, comparable with Plaid due dates.
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Soonest due date on or after today among cards that still owe money. Ties keep institution/card order.
export function nextPaymentDue(connections: Connection[], today: string): { card: Card; connection: Connection } | null {
  let next: { card: Card; connection: Connection } | null = null;
  for (const connection of connections) {
    for (const card of connection.cards) {
      if (!card.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(card.dueDate) || card.dueDate < today) continue;
      if (card.balance === null || !(card.balance > 0)) continue;
      if (!next || card.dueDate < next.card.dueDate!) next = { card, connection };
    }
  }
  return next;
}

export type Card = {
  id: string;
  name: string;
  mask: string | null;
  balance: number | null;
  currency: string | null;
  minimumPayment: number | null;
  dueDate: string | null;
  aprs: { percentage: number; type: string }[];
};

export type Connection = {
  id: string;
  institution: string;
  cards: Card[];
  fetchedAt: string | null;
  error: string | null;
};

export type DashboardData = { connections: Connection[] };

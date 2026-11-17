export type Card = {
  id: string;
  name: string;
  mask: string | null;
  balance: number | null;
  creditLimit: number | null;
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

export type PlanPayment = {
  connectionId: string;
  cardId: string;
  name: string;
  mask: string | null;
  institution: string;
  apr: number;
  paymentCents: number;
};
export type PayoffPlan = {
  version: 2;
  years: number;
  months: number;
  startMonth: string;
  targetMonth: string;
  estimatedPayoffMonth: string;
  monthlyBudgetCents: number;
  interestCents: number;
  totalPaidCents: number;
  method: "avalanche";
  initialPayments: PlanPayment[];
  sourceFingerprint: string;
};

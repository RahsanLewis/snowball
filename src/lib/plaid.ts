import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { StoredConnection } from "./session";

export function plaid() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("PLAID_NOT_CONFIGURED");
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: { timeout: 20000, headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
  }));
}

export async function refreshConnection(connection: StoredConnection) {
  const { data } = await plaid().liabilitiesGet({ access_token: connection.accessToken });
  const liabilities = new Map((data.liabilities.credit ?? []).map((item) => [item.account_id, item]));
  connection.cards = data.accounts.filter((account) => account.type === "credit" && account.subtype === "credit card").map((account) => {
    const liability = liabilities.get(account.account_id);
    return {
      id: account.account_id,
      name: account.name,
      mask: account.mask,
      balance: account.balances.current,
      currency: account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? null,
      minimumPayment: liability?.minimum_payment_amount ?? null,
      dueDate: liability?.next_payment_due_date ?? null,
      aprs: (liability?.aprs ?? []).map((apr) => ({ percentage: apr.apr_percentage, type: apr.apr_type })),
    };
  });
  connection.fetchedAt = new Date().toISOString();
  connection.error = null;
}

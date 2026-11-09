import { CountryCode, CreditAccountSubtype, Products } from "plaid";
import { assertSameOrigin, failure, json } from "@/lib/http";
import { plaid } from "@/lib/plaid";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = (await getSession(true))!;
    const { data } = await plaid().linkTokenCreate({
      user: { client_user_id: session.id },
      client_name: "Snowball",
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      account_filters: { credit: { account_subtypes: [CreditAccountSubtype.CreditCard] } },
    });
    return json({ linkToken: data.link_token });
  } catch (error) { return failure(error); }
}

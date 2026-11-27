import { CountryCode, CreditAccountSubtype, Products } from "plaid";
import { assertSameOrigin, failure, json } from "@/lib/http";
import { plaid } from "@/lib/plaid";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { data } = await plaid().linkTokenCreate({
      // The Supabase user id: stable and contains no personal details.
      user: { client_user_id: user.id },
      client_name: "Snowball",
      products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      account_filters: { credit: { account_subtypes: [CreditAccountSubtype.CreditCard] } },
    });
    return json({ linkToken: data.link_token });
  } catch (error) { return failure(error); }
}

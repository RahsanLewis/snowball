import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorMessage, failure, json, readBody, RequestError } from "@/lib/http";
import { fetchCards, plaid } from "@/lib/plaid";
import { addConnection, listConnections, markConnectionError, saveCards, withAccountLock } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readBody(request);
    if (typeof body.publicToken !== "string" || !/^public-sandbox-[a-zA-Z0-9-]+$/.test(body.publicToken)) {
      throw new RequestError("A valid Sandbox connection is required.");
    }
    const publicToken = body.publicToken;
    return await withAccountLock(user.id, async () => {
      const { data } = await plaid().itemPublicTokenExchange({ public_token: publicToken });
      const institution = typeof body.institution === "string" ? body.institution.slice(0, 150) : "Connected institution";
      // Save before fetching so temporary data errors do not lose the connection.
      try { await addConnection(user.id, { id: data.item_id, institution, accessToken: data.access_token }); }
      catch {
        // Plaid already created the Item; revoke it so nothing is left behind unsaved.
        await plaid().itemRemove({ access_token: data.access_token }).catch(() => {});
        throw new RequestError("We couldn’t save this connection. Please try again.", 500);
      }
      try { await saveCards(user.id, data.item_id, await fetchCards(data.access_token)); }
      catch (error) { await markConnectionError(user.id, data.item_id, errorMessage(error)); }
      return json({ connections: await listConnections(user.id) });
    });
  } catch (error) { return failure(error); }
}

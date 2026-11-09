import { assertSameOrigin, errorMessage, failure, json, readBody, RequestError } from "@/lib/http";
import { plaid, refreshConnection } from "@/lib/plaid";
import { getSession, publicConnections, withSessionLock, type StoredConnection } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) throw new RequestError("Your local session expired. Connect your card again.", 401);
    const body = await readBody(request);
    if (typeof body.publicToken !== "string" || !/^public-sandbox-[a-zA-Z0-9-]+$/.test(body.publicToken)) {
      throw new RequestError("A valid Sandbox connection is required.");
    }
    const publicToken = body.publicToken;
    return await withSessionLock(session, async () => {
      const { data } = await plaid().itemPublicTokenExchange({ public_token: publicToken });
      const connection: StoredConnection = {
        id: data.item_id, accessToken: data.access_token,
        institution: typeof body.institution === "string" ? body.institution.slice(0, 150) : "Connected institution",
        cards: [], fetchedAt: null, error: null,
      };
      // Save before fetching so temporary data errors do not lose the connection.
      session.connections.set(connection.id, connection);
      try { await refreshConnection(connection); }
      catch (error) { connection.error = errorMessage(error); }
      return json({ connections: publicConnections(session) });
    });
  } catch (error) { return failure(error); }
}

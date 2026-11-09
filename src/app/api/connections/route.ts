import { assertSameOrigin, errorMessage, failure, json, readBody, RequestError } from "@/lib/http";
import { plaid, refreshConnection } from "@/lib/plaid";
import { getSession, publicConnections, withSessionLock } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return json({ connections: publicConnections(await getSession()) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) throw new RequestError("Your local session expired. Connect your card again.", 401);
    return await withSessionLock(session, async () => {
      await Promise.all([...session.connections.values()].map(async (connection) => {
        try { await refreshConnection(connection); }
        catch (error) { connection.error = errorMessage(error); }
      }));
      return json({ connections: publicConnections(session) });
    });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) throw new RequestError("Your local session expired. Connect your card again.", 401);
    const { id } = await readBody(request);
    if (typeof id !== "string" || !session.connections.has(id)) throw new RequestError("Connection not found.", 404);
    return await withSessionLock(session, async () => {
      await plaid().itemRemove({ access_token: session.connections.get(id)!.accessToken });
      session.connections.delete(id);
      return json({ connections: publicConnections(session) });
    });
  } catch (error) { return failure(error); }
}

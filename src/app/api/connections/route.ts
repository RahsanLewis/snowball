import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorMessage, failure, json, readBody, RequestError } from "@/lib/http";
import { fetchCards, plaid } from "@/lib/plaid";
import { accessTokenFor, listConnections, markConnectionError, removeConnection, saveCards, withAccountLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return json({ connections: await listConnections((await requireUser()).id) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return await withAccountLock(user.id, async () => {
      await Promise.all((await listConnections(user.id)).map(async ({ id }) => {
        try { await saveCards(user.id, id, await fetchCards((await accessTokenFor(user.id, id))!)); }
        catch (error) { await markConnectionError(user.id, id, errorMessage(error)); }
      }));
      return json({ connections: await listConnections(user.id) });
    });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await readBody(request);
    if (typeof id !== "string") throw new RequestError("Connection not found.", 404);
    return await withAccountLock(user.id, async () => {
      let token: string | null;
      try { token = await accessTokenFor(user.id, id); }
      catch (error) {
        if (!(error instanceof Error && error.message === "TOKEN_UNREADABLE")) throw error;
        // Without the token it can't be revoked at Plaid; removing it beats leaving it stuck.
        await removeConnection(user.id, id);
        return json({
          connections: await listConnections(user.id),
          notice: "Institution removed from Snowball, but it couldn’t be revoked at Plaid. It may remain there until it’s cleaned up.",
        });
      }
      if (token === null) throw new RequestError("Connection not found.", 404);
      await plaid().itemRemove({ access_token: token });
      await removeConnection(user.id, id);
      return json({ connections: await listConnections(user.id) });
    });
  } catch (error) { return failure(error); }
}

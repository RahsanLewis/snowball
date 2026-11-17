import { createHash } from "node:crypto";
import { assertSameOrigin, failure, json, readBody, RequestError } from "@/lib/http";
import { calculatePlan, monthKey, monthsUntilTarget } from "@/lib/payoff-plan";
import { getSession, publicConnections, withSessionLock } from "@/lib/session";
import type { Connection } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fingerprint(connections: Connection[]) {
  return createHash("sha256").update(JSON.stringify(connections.map(({ id, institution, error, cards }) => ({
    id, institution, unavailable: !cards.length && !!error,
    cards: cards.map(({ id, name, mask, balance, currency, minimumPayment, aprs }) => ({ id, name, mask, balance, currency, minimumPayment, aprs })),
  })))).digest("hex");
}
function quoteFor(estimate: unknown) {
  return createHash("sha256").update(JSON.stringify(estimate)).digest("hex");
}

export async function GET() {
  try {
    const session = await getSession();
    const saved = session?.payoffPlan;
    // Earlier manually entered plans must be reviewed in the new calculator, not treated as forecasts.
    if (!saved || saved.version !== 2) return json({ plan: null, needsRecalculation: !!saved, stale: false });
    return json({ plan: saved, needsRecalculation: false,
      stale: saved.sourceFingerprint !== fingerprint(publicConnections(session)) || saved.startMonth !== monthKey(new Date()) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const now = new Date();
    const duration = monthsUntilTarget(body.targetMonth, now);
    if (!Object.keys(body).every((key) => ["action", "targetMonth", "quote"].includes(key))
      || !["preview", "save"].includes(body.action as string) || duration === null) {
      throw new RequestError("Choose a payoff month after the current month and within the next 100 years.");
    }
    const session = await getSession();
    if (!session) throw new RequestError("Connect your cards before calculating a payoff plan.", 401);
    return await withSessionLock(session, async () => {
      const connections = publicConnections(session);
      let result;
      try { result = calculatePlan(connections, duration, now); }
      catch (error) { throw new RequestError(error instanceof Error ? error.message : "Couldn’t calculate your plan."); }
      const estimate = { ...result, sourceFingerprint: fingerprint(connections) };
      const quote = quoteFor(estimate);
      if (body.action === "preview") return json({ estimate, quote });
      if (body.quote !== quote) throw new RequestError("Your card details or calculation month changed. Recalculate and review the updated payment before saving.", 409);
      session.payoffPlan = estimate;
      return json({ plan: estimate, stale: false, needsRecalculation: false });
    });
  } catch (error) { return failure(error); }
}

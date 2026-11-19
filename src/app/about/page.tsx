import Link from "next/link";

export default function AboutPage() {
  return <article className="prose">
    <h1 className="page-title">About Snowball</h1>
    <p className="muted subtitle">How the numbers are worked out, and what this prototype keeps.</p>

    <h2 id="estimates">How estimates work</h2>
    <p>Payoff plans use the <strong>Avalanche</strong> method. Each month, every card receives its reported minimum payment, and the remaining money goes to the card with the highest APR. When a card is paid off, its money moves to the next card.</p>
    <p>Snowball finds the lowest constant monthly payment that clears all balances by the month you choose, from next month up to 100 years ahead. The final payment may be smaller, and minimum payments can clear debt before your target.</p>
    <ul>
      <li>Each card’s highest reported APR is applied to its entire balance, and rates don’t change.</li>
      <li>Interest is calculated monthly as APR ÷ 12, rounded to cents. Card issuers may calculate interest daily.</li>
      <li>Reported minimum payments stay constant until a balance is nearly paid off.</li>
      <li>The first payment is one month after the plan is calculated. The plan assumes no new purchases, fees, or missed payments.</li>
      <li>Every card with a balance needs a USD balance, an APR, and a minimum payment, or Snowball can’t give a complete estimate.</li>
    </ul>
    <p>Results are estimates, not guarantees. Snowball doesn’t schedule or make payments. A longer timeframe lowers the monthly payment but usually increases interest.</p>

    <h2 id="data">Your card data</h2>
    <p>Balances, APRs, minimum payments, and due dates come from Plaid. Details an institution doesn’t provide are shown as “Not provided.” The total owed includes only USD balances.</p>
    <p>Refreshing fetches the details Plaid currently has, which may not be a live bank update. If a refresh fails, Snowball keeps showing the previously fetched details and says so. Each card page shows when its details were last fetched.</p>
    <p>A saved plan is flagged for recalculation when card details or the calendar month change.</p>

    <h2 id="sandbox">Test mode</h2>
    <p>This prototype uses Plaid Sandbox with test accounts only. Never enter real bank credentials. Reconnecting the same institution can create duplicate cards, so disconnect the earlier connection first.</p>

    <h2 id="session">Sessions and storage</h2>
    <p>You sign in with email and password or Google, and your connections and saved plan belong to your account; nobody else signed in can see them. For now they’re still kept in server memory, so restarting the server clears them until durable storage is added.</p>
    <p>Restarting the server doesn’t disconnect institutions at Plaid. Disconnect them in Snowball (from a card’s page, or the Cards page for an institution without cards) before stopping the server.</p>

    <p><Link href="/">Back to Snowball</Link></p>
  </article>;
}

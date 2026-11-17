# Snowball

Snowball is a local web app prototype for people who want a clearer picture of their credit-card debt. It connects test accounts through Plaid Sandbox and brings balances, APRs, minimum payments, and due dates into one dashboard. The current prototype supports US credit cards and uses test data only.

## Features

- Connect credit-card test accounts through Plaid Link and the Liabilities API.
- View card balances, APR categories, minimum payments, and payment due dates.
- See a combined USD balance and the number of cards included.
- Refresh available details and disconnect institutions with all their linked cards.
- Calculate a session-only Avalanche payoff plan by choosing a payoff month and year.
- Review the estimated monthly payment, interest, total paid, and first-month allocations; adjust the timeframe and recalculate before saving.
- Use a responsive interface on desktop and mobile, with loading, empty, and error states.

## Tech Stack

**Frontend**

- React
- TypeScript
- Plain CSS
- React Plaid Link

**Backend**

- Node.js
- Next.js App Router and API route handlers
- Plaid SDK using Sandbox
- In-memory, per-session storage with an opaque HttpOnly session cookie

Access tokens stay in server memory and are excluded from browser responses. Errors exclude raw Plaid responses and credentials. Mutations require the configured origin, and overlapping session mutations are rejected. Local servers bind to loopback.

## Getting Started

### Prerequisites

- Node.js 24 and npm
- A Plaid account with a client ID and Sandbox secret

There is no database to install or configure.

### Installation

**1. Obtain the project**

If you already have this folder, open it in your terminal. Otherwise, replace `<repository-url>` below with the actual repository URL; no remote URL is configured in this project folder.

```bash
git clone <repository-url> snowball
cd snowball
```

**2. Install dependencies**

Install the versions recorded in `package-lock.json`:

```bash
npm ci
```

**3. Configure environment variables**

Copy the example configuration:

```bash
cp .env.example .env.local
```

Privately fill in your Plaid credentials in `.env.local`:

```env
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_sandbox_secret
APP_ORIGIN=http://127.0.0.1:3000
```

The local environment file is covered by `.gitignore`. Never expose credentials through `NEXT_PUBLIC_` variables or commit secrets. The server always uses Plaid Sandbox and accepts only Sandbox public tokens.

**4. Start the development server**

```bash
npm run dev
```

Open **http://127.0.0.1:3000**. `APP_ORIGIN` must match the browser origin exactly, including the hostname and port. If you use a different port, update the setting to match.

## Usage

1. Open the dashboard; no account registration or sign-in is required.
2. Select **Connect credit card**, choose a Sandbox institution supporting Liabilities, and complete its test flow. Use Sandbox test accounts only, never real banking credentials.
3. Review the returned card balances, APR categories, minimum payments, and due dates.
4. Select **Refresh details** to fetch the data currently available from Plaid.
5. Select **Disconnect institution** to remove the entire Plaid Item and all its cards from this session. Disconnect before stopping the server.

### Payoff plan calculator

Connect your cards and select **Set up your payoff plan**. Use the year arrows or year dropdown, then choose a month from the grid (for example, November 2027). The selected date and number of months away appear beneath it. Unavailable months are disabled. Tab into the month grid and use arrow keys to select a month; Space or Enter selects the focused month. Then select **Calculate monthly payment**. Review the estimated monthly payment, interest, total paid, target month, and first-month payment allocation. Use **Adjust payoff month** to explore a different payment, or **Save plan** to keep the reviewed estimate. There is no manual budget entry or method selector: plans always use **Avalanche**.

The calculator models each month in cents: add interest, cover every card's minimum, then allocate remaining money to the highest-APR debt. Money freed by paying off a card goes to the next card. The server searches for the lowest constant monthly payment that clears all modeled balances within the timeframe while covering minimums. The final payment may be smaller. Minimum payments can cause payoff earlier than the requested target. Equal APRs preserve institution/card order.

**Calculation assumptions:**

- Each card's highest reported APR is applied to its entire balance, including when that rate relates to a different balance category. APRs remain unchanged. Monthly interest uses APR divided by 12, rounded to cents; actual issuers may calculate daily interest differently.
- Reported minimums remain constant until capped by the remaining balance plus interest. The app does not yet model issuer minimum-payment formulas.
- The first payment occurs one month after the calculation month, with subsequent monthly payments. There are no new purchases, fees, or missed payments. Payment due dates are not used to schedule payments.
- Positive debts must have USD balances, usable APRs, and reported minimum payments. Missing or invalid inputs prevent a complete estimate instead of silently omitting debts. Known zero or credit balances require no payment. Failed refreshes can leave cached data; the dashboard identifies this limitation.
- The payoff-month picker accepts next month through 100 years ahead. Current and past months, malformed dates, and dates beyond that range are rejected on both client and server. The server converts the selected month into the number of monthly payments using the UTC calculation month. Monetary calculations are bounded to $10 billion and APRs to 0–1,000%; unsupported values produce an error.

Results are estimates, not guaranteed payoff outcomes. The app does not schedule or make payments. A longer timeframe generally lowers the monthly payment but may increase interest. Choose a timeframe whose calculated payment fits your budget.

Preview and save both calculate on the server. A changed calculation requires a new preview before saving; browser-supplied payment amounts or methods are rejected. The saved target is a fixed calendar month (UTC), not a continuously moving duration. After card data or the calculation month changes, the prior estimate is flagged for recalculation rather than silently replaced. Recalculation initially preserves the target month when it is still in the future; an elapsed target defaults to next month for review. Old manually entered plans require recalculation and are not represented as forecasts.

Plans are stored only in the existing server-memory session, remain available on page reload with the same session cookie, and are lost or inaccessible after server restart or cookie loss. No plan data is written to a database or browser local storage. Calculating or saving a plan does not call Plaid.

### Testing with Plaid Sandbox

Use a custom Sandbox test user to test specific card names, balances, and multiple credit cards:

1. Configure your Plaid client ID and **Sandbox** secret in `.env.local` as described in Getting Started. Restart the development server after changing credentials, then open **http://127.0.0.1:3000** (or the exact origin configured in `APP_ORIGIN`). Keep API credentials private; they are not the bank login used in Plaid Link.
2. In the Plaid Dashboard, open **Build → Sandbox → Users** and create or edit a custom test user. Configure the desired credit-card accounts and liability details, then save the user. Snowball displays accounts with type `credit` and subtype `credit card`.
3. In **Snowball**, select **Connect credit card** to start its Plaid Link flow.
4. Choose **First Platypus Bank** or **First Gingham Credit Union**, which Plaid recommends for testing custom users without OAuth.
5. Enter the saved custom test user's username and any non-empty test password. Do not use real bank credentials. Using the default `user_good` login instead will not select your custom user's data.
6. Select all intended credit cards and complete Link. Back in Snowball, verify the card names, balances, and connected-card count against your custom user's configuration. Available APRs, minimum payments, and due dates should also appear; missing fields display as “Not provided.”
7. If you edit the custom user later, disconnect the old institution in Snowball and connect again with that user. Editing a saved custom user does not update existing Plaid Items, and **Refresh details** does not recreate the Item with the new configuration. Disconnecting first also avoids duplicate cards and double-counted balances.

**If custom cards become a generic card after Link:** OAuth institutions such as Chase can replace custom Sandbox data with defaults after the Link flow, even when the expected cards appeared during account selection. This occurred during Snowball testing with Chase; reconnecting through First Platypus Bank resolved it. Use one of the non-OAuth institutions above for this test instead.

See Plaid's [custom Sandbox user documentation](https://plaid.com/docs/sandbox/user-custom/) for configuration instructions and OAuth limitations. Disconnect test institutions before stopping the server; the session and cleanup limitations below still apply.

### Prototype limitations

This is a single-process local Sandbox prototype. There is no sign-in or durable database. Server restarts lose local connections, and losing the browser session makes stored connections inaccessible. Restarting does **not** revoke Items at Plaid; disconnect institutions before stopping or remove leftover Sandbox Items through Plaid tooling. Memory storage is unsuitable for distributed or long-running public deployments.

Debt fields depend on the institution. Missing values display as “Not provided”; zero is preserved. The overview sums only returned USD balances and shows how many cards are included. After a refresh error, it can include previously fetched data. Refreshing does not guarantee live institution data; the timestamp records when this app fetched details.

Reconnecting the same institution can create duplicate Items/cards and double-count balances. Disconnect the earlier connection first. OAuth redirect/resume flows, automatic updates/webhooks, production access, persistent authentication/storage, issuer-specific minimum-payment formulas, and payment scheduling are future work.

See the [Plaid Quickstart](https://plaid.com/docs/quickstart/), [Liabilities documentation](https://plaid.com/docs/liabilities/), and [Sandbox documentation](https://plaid.com/docs/sandbox/) for integration and test-flow details.

## Project Structure

```text
snowball/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── payoff-plan/route.ts     # Read and save session payoff plan
│   │   │   ├── connections/route.ts      # Read, refresh, and disconnect
│   │   │   └── plaid/
│   │   │       ├── exchange/route.ts     # Exchange tokens and fetch details
│   │   │       └── link-token/route.ts   # Create a Liabilities Link token
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── payoff-plan.tsx              # Timeframe calculator and saved estimate
│   │   └── dashboard.tsx
│   └── lib/
│       ├── http.ts                      # Origin checks and safe responses
│       ├── plaid.ts                     # Sandbox client and field mapping
│       ├── payoff-plan.ts               # Validation, allocation, and payoff simulation
│       ├── payoff-plan.test.cjs         # Calculator and ranking tests
│       ├── payoff-plan-api.test.cjs     # API and session isolation tests
│       ├── session.ts                   # Session and token storage
│       └── types.ts
├── .env.example
├── .gitignore
├── AGENTS.md
├── next-env.d.ts
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

## Contributing

Read the shared instructions in `~/.codex/AGENTS.md` and the Snowball-specific [AGENTS.md](AGENTS.md) in this project root before making changes. The shared file contains the universal approval, review-importance, testing, security, and Git restrictions; the project file contains Snowball README-maintenance requirements. With a custom `CODEX_HOME`, install the shared file there instead. The global file is local to your Codex setup and is not included in this repository; other computers and cloud environments need their own copy. Start a new Codex session after changing instruction files to load the new arrangement. Propose the intended changes, affected files, related tests, risks, and verification commands for approval. Keep edits within the approved scope and present the result for developer review.

Before each commit, review this README and update it when changes affect features, setup, dependencies, configuration, usage, project structure, or limitations. If no documentation change is needed, note that in the change summary. Human contributors should use Conventional Commits. The developer handles commits, pushes, and any publication or deployment; agents must follow the restrictions in `AGENTS.md`.

### Review and verification

Automated tests cover origin validation, payoff calculations, interest rounding, minimums, Avalanche allocations, input validation and ordering, and session-isolated plan API behavior. API tests use local mocks and do not contact Plaid. Developer review remains required.

Available checks, subject to the approval workflow:

- `node --conditions=react-server --experimental-transform-types --test src/lib/*.test.cjs` — local unit and API tests; transforms TypeScript in memory.
- `npm run typecheck` — TypeScript validation without incremental cache output.
- `npm run build` — production compilation; writes `.next/` and may update generated Next.js typings.
- `npm run dev` — local browser walkthrough; writes development output to `.next/` and calls Plaid Sandbox when connecting, refreshing, or disconnecting.

## License

No license is currently specified, and no `LICENSE` file is included.

# Snowball

Snowball is a local web app prototype for people who want a clearer picture of their credit-card debt. It connects test accounts through Plaid Sandbox and brings balances, APRs, minimum payments, and due dates into one dashboard. The current prototype supports US credit cards and uses test data only.

## Features

- Sign up or sign in with email and password (with email confirmation and password reset) or Google, through Supabase Auth. Cards and plans belong to the signed-in account.
- Connect credit-card test accounts through Plaid Link and the Liabilities API.
- See what matters at a glance on the overview: total USD owed, your payoff plan's monthly payment, and the next payment due.
- Browse cards by institution on the **Cards** page, and open a card for its balance, credit limit, APRs, minimum payment, due date, and last-fetched time.
- Refresh available details and disconnect institutions (with confirmation) with all their linked cards.
- Calculate an Avalanche payoff plan on the **Plan** page by choosing a payoff month and year.
- Review the estimated monthly payment, interest, total paid, and first-month allocations; adjust the timeframe and recalculate before saving.
- Find calculation assumptions, data notes, and session limitations on the **About** page and in small (i) info pop-ups instead of on the main screens.
- Use a minimal, responsive interface with automatic light and dark mode.

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
- Supabase Auth through `@supabase/ssr` (server-side only), with `src/proxy.ts` refreshing sessions and guarding private pages
- In-memory storage keyed by signed-in user (temporary; moving to Postgres)
- Supabase Postgres schema, migrations (Drizzle), and AES-256-GCM token encryption — groundwork for durable storage; the app does not read or write the database yet

Access tokens stay in server memory and are excluded from browser responses. Every API route requires a signed-in user (401 otherwise), and the server verifies the Supabase token's signature rather than trusting the cookie. Sign-in errors never reveal whether an account exists, and post-sign-in redirects only go to paths inside the app. Errors exclude raw Plaid and Supabase responses and credentials. Mutations require the configured origin, and overlapping mutations for the same user are rejected. Local servers bind to loopback.

## Getting Started

### Prerequisites

- Node.js 24 and npm
- A Plaid account with a client ID and Sandbox secret
- A Supabase project for sign-in (see [Supabase setup](#supabase-setup))

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

The local environment file is covered by `.gitignore`. Never expose credentials through `NEXT_PUBLIC_` variables (the Supabase URL and publishable key are the only public values) or commit secrets. The server always uses Plaid Sandbox and accepts only Sandbox public tokens.

**4. Start the development server**

```bash
npm run dev
```

Open **http://127.0.0.1:3000**. `APP_ORIGIN` must match the browser origin exactly, including the hostname and port. If you use a different port, update the setting to match.

### Supabase setup

Sign-in requires a Supabase project. Connections and plans still live in server memory; the Postgres schema below is ready but not yet used by the app.

1. Create a Supabase project (a separate one for development is recommended).
2. In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API), `DATABASE_URL` (transaction pooler, port 6543), and `MIGRATION_DATABASE_URL` (session pooler or direct connection, port 5432). The publishable key is designed to be public; every other value is a secret.
3. Generate `TOKEN_ENCRYPTION_KEY` and add it to `.env.local`. Keep it out of Supabase; losing it makes stored Plaid tokens unusable.

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. Apply the migrations in `drizzle/`: `npx drizzle-kit migrate`. This changes the database.
5. In the Supabase dashboard, under **Authentication → URL Configuration**, set the Site URL to `http://127.0.0.1:3000` (your `APP_ORIGIN`) and add `http://127.0.0.1:3000/**` as a redirect URL. (Sign-in links include a return path, so an exact callback URL is not enough.)
6. Optional, and only possible after setting up custom SMTP: under **Authentication → Email Templates**, change the link in **Confirm signup** to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` and in **Reset password** to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. These links work in any browser. With the default templates, confirmation and reset links go through `/auth/callback` and must be opened in the same browser where you signed up or requested the reset; otherwise sign-in shows that the link has expired.
7. For Google sign-in, create an OAuth client in Google Cloud with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, then enter its client ID and secret under **Authentication → Providers → Google**.

Supabase's built-in email service only delivers to your project's team members and sends very few messages per hour. That's enough to test with your own address; configure custom SMTP before letting anyone else sign up.

The tables (`plaid_items`, `payoff_plans`, `account_locks`) have row-level security enabled with no policies, so the browser's public key can't read them; only server code connecting with `DATABASE_URL` can. Access tokens are stored encrypted, bound to their user and Item. `plaid_items` blocks deleting a Supabase user who still has Items, so connected banks are removed at Plaid first.

## Usage

1. Open the app and select **Create account** (email and password, then confirm through the emailed link) or **Continue with Google**. Signed-out visitors to private pages are sent to **Sign in** and returned afterwards. Use the header to move between **Overview**, **Cards**, **Plan**, **About** (the **?** icon), and **Account**, where you can change your password or sign out.
2. Select **Connect credit card** on the overview (or **Connect card** on the Cards page), choose a Sandbox institution supporting Liabilities, and complete its test flow. Use Sandbox test accounts only, never real banking credentials.
3. The overview shows the total owed, your payoff plan, and the next payment due. Open **Cards** and select a card to review its balance, APR categories, minimum payment, and due date.
4. Select **Refresh** on the Cards page to fetch the data currently available from Plaid.
5. To remove an institution's Plaid Item and all its cards from this session, open one of its cards and select **Disconnect**, then confirm. An institution that returned no cards shows **Disconnect** on the Cards page instead. Disconnect before stopping the server.

### Payoff plan calculator

Connect your cards, open **Plan**, and select **Set up plan**. Use the year arrows or year dropdown, then choose a month from the grid (for example, November 2027). The selected date and number of months away appear beneath it. Unavailable months are disabled. Tab into the month grid and use arrow keys to select a month; Space or Enter selects the focused month. Then select **Calculate payment**. Review the estimated monthly payment, interest, total paid, target month, and first-month payment allocation. Use **Change month** to explore a different payment, or **Save plan** to keep the reviewed estimate. There is no manual budget entry or method selector: plans always use **Avalanche**.

The calculator models each month in cents: add interest, cover every card's minimum, then allocate remaining money to the highest-APR debt. Money freed by paying off a card goes to the next card. The server searches for the lowest constant monthly payment that clears all modeled balances within the timeframe while covering minimums. The final payment may be smaller. Minimum payments can cause payoff earlier than the requested target. Equal APRs preserve institution/card order.

**Calculation assumptions:**

- Each card's highest reported APR is applied to its entire balance, including when that rate relates to a different balance category. APRs remain unchanged. Monthly interest uses APR divided by 12, rounded to cents; actual issuers may calculate daily interest differently.
- Reported minimums remain constant until capped by the remaining balance plus interest. The app does not yet model issuer minimum-payment formulas.
- The first payment occurs one month after the calculation month, with subsequent monthly payments. There are no new purchases, fees, or missed payments. Payment due dates are not used to schedule payments.
- Positive debts must have USD balances, usable APRs, and reported minimum payments. Missing or invalid inputs prevent a complete estimate instead of silently omitting debts. Known zero or credit balances require no payment. Failed refreshes can leave cached data; the Plan page identifies this limitation.
- The payoff-month picker accepts next month through 100 years ahead. Current and past months, malformed dates, and dates beyond that range are rejected on both client and server. The server converts the selected month into the number of monthly payments using the UTC calculation month. Monetary calculations are bounded to $10 billion and APRs to 0–1,000%; unsupported values produce an error.

Results are estimates, not guaranteed payoff outcomes. The app does not schedule or make payments. A longer timeframe generally lowers the monthly payment but may increase interest. Choose a timeframe whose calculated payment fits your budget.

Preview and save both calculate on the server. A changed calculation requires a new preview before saving; browser-supplied payment amounts or methods are rejected. The saved target is a fixed calendar month (UTC), not a continuously moving duration. After card data or the calculation month changes, the prior estimate is flagged for recalculation rather than silently replaced. Recalculation initially preserves the target month when it is still in the future; an elapsed target defaults to next month for review. Old manually entered plans require recalculation and are not represented as forecasts.

Plans are stored in server memory for the signed-in user, remain available across reloads and sign-ins, and are lost after a server restart. No plan data is written to a database or browser local storage. Calculating or saving a plan does not call Plaid.

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

This is a single-process local Sandbox prototype. Sign-in uses Supabase, but connections and plans are not yet stored durably: server restarts lose them. Restarting does **not** revoke Items at Plaid; disconnect institutions before stopping or remove leftover Sandbox Items through Plaid tooling. Memory storage is unsuitable for distributed or long-running public deployments.

Debt fields depend on the institution. Missing values display as “Not provided”; zero is preserved. The overview sums only returned USD balances and shows how many cards are included. After a refresh error, it can include previously fetched data. Refreshing does not guarantee live institution data; the timestamp records when this app fetched details.

Reconnecting the same institution can create duplicate Items/cards and double-count balances. Disconnect the earlier connection first. OAuth redirect/resume flows, automatic updates/webhooks, production access, durable storage, account deletion, issuer-specific minimum-payment formulas, and payment scheduling are future work.

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
│   │   ├── (auth)/
│   │   │   ├── actions.ts               # Server Actions: sign in/up, Google, reset, sign out
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx  # Choose a new password (needs a session)
│   │   ├── auth/
│   │   │   ├── callback/route.ts        # Finishes Google sign-in
│   │   │   └── confirm/route.ts         # Email confirmation and reset links
│   │   ├── about/page.tsx               # Assumptions, data, sandbox, and account notes
│   │   ├── account/page.tsx             # Email, sign-in method, change password, sign out
│   │   ├── cards/
│   │   │   ├── page.tsx                 # Cards grouped by institution
│   │   │   └── [id]/page.tsx            # One card's details and disconnect
│   │   ├── plan/page.tsx                # Payoff plan calculator
│   │   ├── globals.css                  # Design tokens, light/dark themes, components
│   │   ├── layout.tsx                   # Header, status line, shared connection state
│   │   └── page.tsx                     # Overview, or landing when signed out
│   ├── db/
│   │   ├── client.ts                    # Server-only Postgres connection (Drizzle)
│   │   └── schema.ts                    # Tables, row-level security, foreign keys
│   ├── components/
│   │   ├── app-header.tsx               # Navigation and account link
│   │   ├── auth-form.tsx                # Shared sign-in form and Google button
│   │   ├── cards.tsx                    # Card list and card detail
│   │   ├── connections-provider.tsx     # Shared connections, Plaid Link, status messages
│   │   ├── dashboard.tsx                # Overview: total, plan summary, next payment
│   │   ├── info-tip.tsx                 # (i) info pop-ups
│   │   ├── landing.tsx                  # Signed-out home
│   │   └── payoff-plan.tsx              # Timeframe calculator, saved estimate, plan summary
│   ├── proxy.ts                         # Session refresh and private-page redirects
│   └── lib/
│       ├── auth.ts                      # Current user, redirect safety, auth error messages
│       ├── auth.test.cjs                # Auth helper tests
│       ├── crypto.ts                    # Access-token encryption (AES-256-GCM)
│       ├── crypto.test.cjs              # Encryption tests
│       ├── format.ts                    # Money and date display formatting
│       ├── format.test.cjs              # Formatting tests
│       ├── http.ts                      # Origin checks and safe responses
│       ├── http.test.cjs                # Origin validation tests
│       ├── plaid.ts                     # Sandbox client and field mapping
│       ├── payoff-plan.ts               # Validation, allocation, and payoff simulation
│       ├── payoff-plan.test.cjs         # Calculator and ranking tests
│       ├── payoff-plan-api.test.cjs     # API, sign-in requirement, and user isolation tests
│       ├── session.ts                   # Per-user in-memory connection and plan storage
│       ├── supabase/server.ts           # Server-only Supabase client
│       ├── summary.ts                   # Total owed and next payment due
│       ├── summary.test.cjs             # Overview summary tests
│       └── types.ts
├── drizzle/                         # Generated SQL migrations and snapshots
├── .env.example
├── .gitignore
├── AGENTS.md
├── drizzle.config.ts                # Migration settings (reads .env.local)
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

Automated tests cover origin validation, payoff calculations, interest rounding, minimums, Avalanche allocations, input validation and ordering, signed-in-only, user-isolated plan API behavior, sign-in redirect safety and error messages, overview totals and next-payment selection, display formatting, and access-token encryption (tampering, wrong keys, and tokens moved between users are rejected). There are no automated React component tests; check UI behavior in a browser walkthrough. API tests use local mocks and do not contact Plaid or Supabase. Developer review remains required.

Available checks, subject to the approval workflow:

- `node --conditions=react-server --experimental-transform-types --test src/lib/*.test.cjs` — local unit and API tests; transforms TypeScript in memory.
- `npm run typecheck` — TypeScript validation without incremental cache output.
- `npm run build` — production compilation; writes `.next/` and may update generated Next.js typings.
- `npm run dev` — local browser walkthrough; writes development output to `.next/` and calls Supabase when signing in and Plaid Sandbox when connecting, refreshing, or disconnecting.
- `npx drizzle-kit generate` — writes a new migration to `drizzle/` after schema changes; needs no database.
- `npx drizzle-kit migrate` — applies migrations to the database in `MIGRATION_DATABASE_URL` (or `DATABASE_URL`).

## License

No license is currently specified, and no `LICENSE` file is included.

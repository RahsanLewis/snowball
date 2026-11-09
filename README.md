# Snowball

Snowball is a local web app prototype for people who want a clearer picture of their credit-card debt. It connects test accounts through Plaid Sandbox and brings balances, APRs, minimum payments, and due dates into one dashboard. The current prototype supports US credit cards and uses test data only.

## Features

- Connect credit-card test accounts through Plaid Link and the Liabilities API.
- View card balances, APR categories, minimum payments, and payment due dates.
- See a combined USD balance and the number of cards included.
- Refresh available details and disconnect institutions with all their linked cards.
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

### Prototype limitations

This is a single-process local Sandbox prototype. There is no sign-in or durable database. Server restarts lose local connections, and losing the browser session makes stored connections inaccessible. Restarting does **not** revoke Items at Plaid; disconnect institutions before stopping or remove leftover Sandbox Items through Plaid tooling. Memory storage is unsuitable for distributed or long-running public deployments.

Debt fields depend on the institution. Missing values display as “Not provided”; zero is preserved. The overview sums only returned USD balances and shows how many cards are included. After a refresh error, it can include previously fetched data. Refreshing does not guarantee live institution data; the timestamp records when this app fetched details.

Reconnecting the same institution can create duplicate Items/cards and double-count balances. Disconnect the earlier connection first. OAuth redirect/resume flows, automatic updates/webhooks, production access, persistent authentication/storage, and payoff calculations are future work.

See the [Plaid Quickstart](https://plaid.com/docs/quickstart/), [Liabilities documentation](https://plaid.com/docs/liabilities/), and [Sandbox documentation](https://plaid.com/docs/sandbox/) for integration and test-flow details.

## Project Structure

```text
snowball/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── connections/route.ts      # Read, refresh, and disconnect
│   │   │   └── plaid/
│   │   │       ├── exchange/route.ts     # Exchange tokens and fetch details
│   │   │       └── link-token/route.ts   # Create a Liabilities Link token
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── dashboard.tsx
│   └── lib/
│       ├── http.ts                      # Origin checks and safe responses
│       ├── plaid.ts                     # Sandbox client and field mapping
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

Read [AGENTS.md](AGENTS.md) before making changes. Propose the intended changes, affected files, related tests, risks, and verification commands for approval. Keep edits within the approved scope and present the result for developer review.

Before each commit, review this README and update it when changes affect features, setup, dependencies, configuration, usage, project structure, or limitations. If no documentation change is needed, note that in the change summary. Human contributors should use Conventional Commits. The developer handles commits, pushes, and any publication or deployment; agents must follow the restrictions in `AGENTS.md`.

### Review and verification

Application implementation remains pending developer review. No automated tests are currently provided, and application checks have not been run as part of this documentation update.

Available checks, subject to the approval workflow:

- `npm run typecheck` — TypeScript validation without incremental cache output.
- `npm run build` — production compilation; writes `.next/` and may update generated Next.js typings.
- `npm run dev` — local browser walkthrough; writes development output to `.next/` and calls Plaid Sandbox when connecting, refreshing, or disconnecting.

## License

No license is currently specified, and no `LICENSE` file is included.

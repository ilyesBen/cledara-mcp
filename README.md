# cledara-mcp

A read-only [MCP](https://modelcontextprotocol.io) server for [Cledara](https://www.cledara.com), the SaaS and spend management platform. It lets Claude (or any MCP client) look up your applications, transactions, invoices, spend, renewals and people.

It wraps the [Cledara public API](https://api-docs.cledara.com) (v0). That API is read-only, and so is this server: no tool can change anything in Cledara.

## Read-only by design

This server cannot change anything in Cledara:

- **Requests:** it only ever makes HTTP `GET` requests, and only to `/v0/applications`, `/v0/transactions` and `/v0/transactions/{id}/invoice-url`. A test fails the build if any tool sends another kind of request or calls another path.
- **Tools:** every tool is marked `readOnlyHint: true` and `destructiveHint: false`, so MCP clients know none of them have side effects.
- **Local files:** it writes nothing to disk. The only cache is an in-memory copy of the application list.
- **The Cledara API (v0):** it has no write endpoints at all.

A Cledara API key carries all the permissions of the user who created it, and Cledara has no read-only key type. If Cledara adds write endpoints later, this server still won't call them, but the key itself could. Treat the key like a password.

## Tools

| Tool | What it does |
|---|---|
| `list_applications` | Apps with status, owner, teams, budget, balance, next renewal and next payment. Filter by status, name, owner or team. |
| `list_transactions` | Raw transactions for a date range (default: last 30 days), optionally for specific apps or transaction types. Paginated. |
| `get_invoice_url` | Download link for a transaction's invoice (valid for 5 minutes). |
| `spend_summary` | Spend over a date range grouped by application, team, owner, card, month or account type, totalled per currency. |
| `upcoming_renewals` | Apps renewing or due a payment in the next N days (default 30) with the expected amount. Cledara often leaves the renewal date empty, so the expected next payment date is used instead (`dateSource` says which). |
| `missing_invoices` | Card payments with no invoice uploaded, for month-end close. |
| `list_people` | People and teams, inferred from app owners and cardholders (Cledara has no users endpoint). |

How the computed tools work:

- **Spend** counts card payments (`cardSend`) net of refunds (`cardReceive`), plus `reimbursement`. Debits are shown as positive numbers. Top-ups, flushes and transfers are left out because they only move money between Cledara accounts. You can override this with `transactionTypes`.
- **Currencies are never converted.** Every total is per currency.
- **Team totals:** an app assigned to several teams counts in full under each team.
- **Owner:** the application owner when the payment is for an app, otherwise the cardholder.
- **Large ranges:** aggregate tools fetch up to 50 API pages. If a range has more, the result includes a `warning`.

## Requirements

- Node.js 20.12 or later. Running the tests or `npm run dev` needs Node 23.6 or later.
- A Cledara API key. Only users with the **SaaS Admin/Finance** or **Spend Admin/Accountant** role can create one: in Cledara, go to **Profile → API Keys → Create API key**.
  - **The key can see everything the user who created it can see.** Create it from the least-privileged eligible user and give it an expiry.
  - Each key works for one Cledara account only.

## Install

### Option A: clone (recommended for development)

```sh
git clone https://github.com/ilyesBen/cledara-mcp.git
cd cledara-mcp
npm install            # also builds dist/
cp .env.example .env   # then paste your key after CLEDARA_API_KEY=
chmod 600 .env
claude mcp add --scope user cledara -- node "$PWD/dist/index.js"
```

### Option B: straight from GitHub with npx

```sh
mkdir -p ~/.config/cledara-mcp
printf 'CLEDARA_API_KEY=\n' > ~/.config/cledara-mcp/.env   # then paste your key
chmod 600 ~/.config/cledara-mcp/.env
claude mcp add --scope user cledara -- npx -y github:ilyesBen/cledara-mcp
```

### Claude Desktop (one-click extension)

[Download `cledara.mcpb`](https://github.com/ilyesBen/cledara-mcp/releases/latest/download/cledara.mcpb) and double-click it. Claude Desktop asks for your API key and stores it in the system keychain. Node.js isn't needed.

There's a step-by-step guide for non-technical users in [docs/claude-desktop.md](docs/claude-desktop.md).

To build the extension yourself, run `npm run mcpb`. It writes `build/cledara.mcpb`. To publish a release, bump `version` in `package.json`, then push a matching `vX.Y.Z` tag; the Release workflow builds the extension and attaches it.

### Other MCP clients

For Claude Desktop, Cursor and similar clients, add this to the client's MCP config:

```json
{
  "mcpServers": {
    "cledara": { "command": "npx", "args": ["-y", "github:ilyesBen/cledara-mcp"] }
  }
}
```

`--scope user` makes the server available in every Claude Code project. Use `--scope project` to write it to a shared `.mcp.json` instead.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CLEDARA_API_KEY` | — | Required. Your Cledara API key. |
| `CLEDARA_ENV_FILE` | — | Path to an env file to read the key from. |
| `CLEDARA_API_BASE_URL` | `https://api.cledara.com` | Override the API host, e.g. for a mock server. |

The server takes the first non-empty key it finds, in this order:

1. The process environment
2. `$CLEDARA_ENV_FILE`
3. `.env` in the package root (a git clone)
4. `~/.config/cledara-mcp/.env`

Prefer an env file over `claude mcp add -e CLEDARA_API_KEY=...`, which stores the key in plain text in `~/.claude.json`.

The key is only ever sent to the Cledara API in the `Authorization` header. It is never logged or included in error messages.

## Rate limits

Cledara allows 120 requests per minute per key. The server:

- Limits itself to 100 requests per minute, so other users of the key keep some headroom.
- When it gets a `429`, waits for the time in `Retry-After` and retries, up to 3 times.
- Caches the application list for 5 minutes.

## Development

```sh
npm test           # unit, server and stdio end-to-end tests against mocks (no API key needed)
npm run typecheck
npm run build      # compiles src/ to dist/
npm run dev        # runs src/index.ts directly
```

The tests use synthetic fixtures based on Cledara's published OpenAPI spec and never call the real API.

You can try the server interactively with the MCP Inspector: `npx @modelcontextprotocol/inspector node dist/index.js`.

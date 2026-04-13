# Project Structure

```
├── docker-compose.yml          # Orchestrates rest + mcp services
├── rest/                       # Core REST API service
│   ├── src/
│   │   ├── app.ts              # Fastify app factory (buildApp)
│   │   ├── server.ts           # Entry point — starts the HTTP server
│   │   ├── lib/                # Shared utilities
│   │   │   ├── credentials.ts  # Header extraction & validation for auth/IMAP/SMTP config
│   │   │   ├── imap.ts         # ImapFlow client creation & teardown
│   │   │   ├── parse.ts        # Raw email → ParsedMessage via mailparser
│   │   │   ├── search.ts       # Query param → IMAP search criteria
│   │   │   └── smtp.ts         # nodemailer send helper
│   │   └── routes/             # Fastify route plugins (one file per resource)
│   │       ├── health.ts
│   │       ├── mailboxes.ts
│   │       ├── messages.ts     # CRUD + reply for messages
│   │       └── send.ts
│   └── test/
│       └── routes/             # Jest tests mirroring routes (one test file per route/verb)
├── mcp/                        # MCP server wrapping the REST API
│   └── src/
│       └── server.ts           # Single-file MCP server (tools, HTTP handler)
└── .kiro/
    └── steering/               # AI assistant steering rules
```

## Architecture Patterns

- **Stateless per-request auth**: Every request carries credentials and server config in headers. No sessions, no stored config.
- **Fastify plugin pattern**: Routes are registered as async Fastify plugins via `app.register()`. Each route file exports a single async function `(app: FastifyInstance) => Promise<void>`.
- **Lib layer**: Reusable logic lives in `rest/src/lib/`. Routes import from lib — lib modules do not import from routes.
- **IMAP client lifecycle**: Each request creates a fresh ImapFlow client and disconnects in a `finally` block.
- **Error handling**: `CredentialError` is caught in routes and mapped to 401. Validation errors return 400. Unhandled errors propagate to Fastify's default handler.
- **Test structure**: Tests use `buildApp()` + Fastify's `app.inject()` for in-process HTTP testing. External dependencies (IMAP, SMTP) are mocked with `jest.mock()`.
- **MCP as thin proxy**: The MCP server is a stateless wrapper — it builds a fresh `McpServer` per HTTP request and delegates to the rest service via `fetch()`.

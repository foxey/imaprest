# Tech Stack & Build

## Runtime
- Node.js >= 22
- TypeScript 5.x (ES2022 target, CommonJS modules, strict mode)

## rest service
- **Framework**: Fastify 5
- **IMAP**: imapflow
- **Email parsing**: mailparser
- **SMTP**: nodemailer
- **Testing**: Jest + ts-jest + fast-check (mocks for IMAP/SMTP libs, property-based testing)
- **Linting**: ESLint 9 with @typescript-eslint

## mcp service
- **MCP SDK**: @modelcontextprotocol/sdk (StreamableHTTP transport)
- **Validation**: zod 3
- No tests currently

## Common Commands

All commands run from the respective service directory (`rest/` or `mcp/`).

| Command | Directory | Description |
|---------|-----------|-------------|
| `npm ci` | rest/, mcp/ | Install dependencies |
| `npm run build` | rest/, mcp/ | Compile TypeScript (`tsc -p tsconfig.build.json`) |
| `npm start` | rest/, mcp/ | Run compiled output (`node dist/server.js`) |
| `npm run dev` | rest/ | Dev mode with auto-reload |
| `npm run typecheck` | rest/, mcp/ | Type-check without emitting |
| `npm run lint` | rest/ | ESLint over src/ and test/ |
| `npm test` | rest/ | Run Jest test suite |
| `docker compose up -d` | repo root | Build and start both services |

## TypeScript Conventions
- `tsconfig.json` — base config (strict, ES2022, CommonJS)
- `tsconfig.build.json` — extends base, sets `rootDir: src` and `include: [src]` for production builds
- Output goes to `dist/`

## Docker
- Multi-stage builds (build → runtime) using `node:22-alpine`
- Runtime stage runs as non-root `node` user
- rest listens on port 3000, mcp on port 3001

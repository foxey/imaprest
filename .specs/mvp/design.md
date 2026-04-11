# imaprest — Design

## Overview

`imaprest` is a stateless HTTP bridge. Each incoming HTTP request maps 1-to-1 to a single IMAP or SMTP operation. There is no shared state between requests, no connection pooling, and no database.

---

## Component Architecture

```
┌────────────────────────────────────────────────────┐
│                    Fastify HTTP                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ /health  │  │ /send    │  │ /mailboxes        │  │
│  │          │  │ /messages│  │ /messages/:uid    │  │
│  └──────────┘  └────┬─────┘  └────────┬─────────┘  │
│                     │                 │             │
│            ┌────────┴──┐     ┌────────┴──────┐     │
│            │ SMTP svc  │     │  IMAP svc     │     │
│            │(nodemailer│     │  (imapflow)   │     │
│            └────┬──────┘     └────────┬──────┘     │
└─────────────────┼────────────────────┼────────────┘
                  ▼                    ▼
            SMTP server          IMAP server
```

---

## Project Structure

```
imaprest/
├── src/
│   ├── server.ts          # Entry point — creates Fastify app, starts listening
│   ├── app.ts             # App factory — registers plugins, routes, hooks
│   ├── routes/
│   │   ├── health.ts
│   │   ├── mailboxes.ts
│   │   ├── messages.ts    # GET /messages, GET /messages/:uid,
│   │   │                  # PATCH /messages/:uid, DELETE /messages/:uid
│   │   └── send.ts
│   ├── services/
│   │   ├── imap.ts        # All ImapFlow operations
│   │   └── smtp.ts        # All nodemailer operations
│   └── types/
│       └── index.ts       # Shared TypeScript interfaces
├── test/
│   ├── routes/
│   └── services/
├── Dockerfile
├── .github/workflows/ci.yml
├── tsconfig.json
├── eslint.config.mjs
├── jest.config.ts
└── package.json
```

---

## Request Lifecycle

### IMAP request (e.g. `GET /messages`)

1. Fastify receives request
2. `onRequest` hook extracts and validates IMAP credential headers
   (`X-Mail-User`, `X-Mail-Password`, `X-IMAP-Host`, `X-IMAP-Port`, `X-IMAP-TLS`)
   → missing required header → `400 Bad Request` immediately
3. Route handler parses and validates query parameters (JSON Schema via Fastify)
4. Route handler calls `imap.ts` service function with extracted credentials + params
5. IMAP service:
   a. Constructs `ImapFlow` client — `host`, `port`, `tls`, `auth: { user, pass }`
   b. `await client.connect()`
   c. `await client.mailboxOpen(mailbox)`
   d. Executes `SEARCH` / `FETCH` / `STORE` / `EXPUNGE` as appropriate
   e. `await client.logout()` (always, even on error via `try/finally`)
6. Route handler serialises result to JSON and returns

### SMTP request (`POST /send`)

1. Fastify receives and validates request body (JSON Schema)
2. `onRequest` hook validates SMTP credential headers
   (`X-Mail-User`, `X-Mail-Password`, `X-SMTP-Host`, `X-SMTP-Port`, `X-SMTP-TLS`)
3. Route handler calls `smtp.ts` service function
4. SMTP service:
   a. Creates nodemailer `transporter` — `host`, `port`, `secure` (TLS), `auth: { user, pass }`
   b. Calls `transporter.sendMail(message)`
   c. Returns message ID on success
5. Route handler returns `202 Accepted` with `{ "messageId": "..." }`

---

## Data Models

### `MessageSummary` — `GET /messages` array item

```typescript
interface MessageSummary {
  uid:     number;
  date:    string;   // ISO 8601
  from:    string;   // "Name <addr>" or bare address
  subject: string;
  seen:    boolean;
  size:    number;   // bytes
}
```

### `Message` — `GET /messages/:uid` response

```typescript
interface Attachment {
  filename:    string | null;
  contentType: string;
  size:        number;
  contentId:   string | null;
}

interface Message {
  uid:         number;
  date:        string;
  from:        string;
  to:          string[];
  cc:          string[];
  subject:     string;
  text:        string | null;
  html:        string | null;
  attachments: Attachment[];
}
```

---

## Credential Extraction

A Fastify `onRequest` hook runs before every route except `GET /health`.

The hook reads headers, coerces types, and attaches a typed credentials object to the request:

```typescript
interface ImapCredentials {
  user:     string;
  password: string;
  host:     string;
  port:     number;   // default 993
  tls:      boolean;  // default true
}

interface SmtpCredentials {
  user:     string;
  password: string;
  host:     string;
  port:     number;   // default 587
  tls:      boolean;  // default true
}
```

IMAP credentials are required for `/mailboxes` and `/messages` routes.  
SMTP credentials are required for `/send`.

---

## Error Mapping

| Condition                              | HTTP Status         |
|----------------------------------------|---------------------|
| Missing required header                | `400 Bad Request`   |
| Invalid query parameter / body         | `400 Bad Request`   |
| IMAP / SMTP authentication failure     | `401 Unauthorized`  |
| Mailbox not found                      | `404 Not Found`     |
| Message UID not found                  | `404 Not Found`     |
| IMAP / SMTP connection refused/timeout | `502 Bad Gateway`   |
| Unexpected internal error              | `500 Internal Server Error` |

All error responses share the shape:
```json
{ "error": "human-readable message" }
```

---

## IMAP Search Strategy

`GET /messages` always uses IMAP `SEARCH` — never fetches all messages:

| Query parameter | IMAP SEARCH criterion         |
|-----------------|-------------------------------|
| `unseen=true`   | `UNSEEN`                      |
| `since=<date>`  | `SINCE <DD-Mon-YYYY>`         |
| (both)          | `UNSEEN SINCE <date>` (AND)   |
| (none)          | `ALL`                         |

UIDs returned by `SEARCH` are then capped to `limit` (default 50, max 200) and fetched in a single `FETCH` call for envelope data (date, from, subject, flags, size).

Message bodies are **never** fetched by the list endpoint — only by `GET /messages/:uid`.

---

## Docker

Multi-stage build:

```dockerfile
# Stage 1 — build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src ./src
RUN npm run build

# Stage 2 — runtime
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The `node` user (uid 1000) is built into the `node:22-alpine` image — no additional user creation needed.

---

## Security Notes

- Credentials are read from request headers and passed as local variables only — never written to logs, environment variables, or any persistent store.
- Fastify's default logger is configured to redact `X-Mail-Password` from access logs.
- The `/health` endpoint requires no credentials and is safe to expose to load-balancer probes.

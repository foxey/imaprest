# imaprest — Requirements

## Overview

`imaprest` is a lightweight, stateless HTTP bridge that exposes a REST API for reading email via IMAP and sending email via SMTP. It is designed to be run as a Docker container behind a credential-injecting proxy (such as OneCLI), which supplies the mail credentials as HTTP request headers. The bridge itself stores no credentials.

---

## Functional Requirements

### Mailboxes

- `GET /mailboxes` — list all mailboxes/folders available on the IMAP server

### Messages

- `GET /messages` — list messages in a mailbox
  - Query parameters:
    - `mailbox` (default: `INBOX`)
    - `unseen` (boolean, default: `false`) — filter to unread messages only
    - `since` (ISO 8601 date-time) — filter to messages received after this timestamp
    - `limit` (integer, default: `50`, max: `200`) — cap the number of results
  - Response: array of message summaries (UID, date, from, subject, seen flag, size)
  - All filtering performed via server-side IMAP `SEARCH` — never bulk-fetches

- `GET /messages/:uid` — fetch a single message by UID
  - Query parameters:
    - `mailbox` (default: `INBOX`)
  - Response: full message (headers, plain text body, HTML body, attachment metadata)

- `PATCH /messages/:uid` — update message flags
  - Body: `{ "seen": true|false }`
  - Mailbox via query parameter (default: `INBOX`)

- `DELETE /messages/:uid` — delete (expunge) a message
  - Mailbox via query parameter (default: `INBOX`)

### Send

- `POST /send` — send an email via SMTP
  - Body:
    ```json
    {
      "from": "string",
      "to": ["string"],
      "cc": ["string"],
      "bcc": ["string"],
      "subject": "string",
      "text": "string",
      "html": "string"
    }
    ```
  - `from`, `to`, and at least one of `text`/`html` are required

### Health

- `GET /health` — returns `200 OK` with service status; does not require credentials

---

## Credential Injection via HTTP Headers

Credentials are **not** stored in the container. They are split into two categories:

### Injected by OneCLI proxy (secrets)

OneCLI intercepts each request and injects the following headers automatically. The calling agent never handles these values directly.

| Header | Description |
|---|---|
| `X-Mail-User` | Mail account username (e.g. `user@example.com`) |
| `X-Mail-Password` | Mail account password |

OneCLI supports injecting multiple headers per request (via `Vec<Injection>` rules in its gateway), so both headers are injected in a single operation. The same credentials are used for both IMAP and SMTP connections.

### Provided by the caller (non-secret config)

| Header | Description | Default |
|---|---|---|
| `X-IMAP-Host` | IMAP server hostname | — |
| `X-IMAP-Port` | IMAP server port | `993` |
| `X-IMAP-TLS` | Use TLS (`true`/`false`) | `true` |
| `X-SMTP-Host` | SMTP server hostname | — |
| `X-SMTP-Port` | SMTP server port | `587` |
| `X-SMTP-TLS` | Use TLS (`true`/`false`) | `true` |

`X-IMAP-*` headers are required for all `/mailboxes` and `/messages` endpoints.
`X-SMTP-*` headers are required for `POST /send`.

---

## Non-Functional Requirements

- **Stateless** — no database, no persistent state; each request opens and closes its own IMAP/SMTP connection
- **Performance** — all message filtering uses server-side IMAP `SEARCH`; message bodies are only fetched when explicitly requested
- **Docker-first** — official `Dockerfile`, minimal image (Node.js Alpine base)
- **No privileged access** — runs as a non-root user inside the container
- **Configurable listen port** — via `PORT` environment variable (default: `3000`)

---

## Implementation Requirements

### Language & Runtime

- **TypeScript only** — no plain JavaScript source files
- **TypeScript strict mode** — `strict: true` in `tsconfig.json`
- **Node.js 22 LTS** — minimum runtime version; used as the Docker base image

### HTTP Framework

- **Fastify** — TypeScript-native, minimal, built-in JSON schema validation

### Dependencies

- **Minimal** — only add a dependency if it provides substantial value over a native implementation
- **No deprecated packages** — all dependencies must be actively maintained
- **No known vulnerabilities** — enforced via `npm audit` in CI

### Key Libraries

- [`imapflow`](https://github.com/postalsys/imapflow) — IMAP client
- [`nodemailer`](https://github.com/nodemailer/nodemailer) — SMTP client

### Testing

- **Jest** — test framework
- **Minimal tests** — cover critical paths; no hard coverage floor
- Tests run as part of CI on every PR

### Code Quality

- **ESLint** — TypeScript-aware linting
- **Prettier** — code formatting

### CI (GitHub Actions)

Every pull request runs:
1. `tsc` — type checking
2. `eslint` — linting
3. `jest` — tests
4. `npm audit` — dependency vulnerability check

### Docker

- Multi-stage build — separate build and runtime stages
- Alpine-based runtime image — minimal footprint
- Runs as non-root user

---

## Out of Scope (v1)

- OAuth / multi-account support
- Attachment upload or download (metadata only in v1)
- Push notifications (IMAP IDLE) — polling only
- Message threading / conversation grouping
- Search by body content (subject/from/date filters only)

# imaprest — Requirements

## Overview

`imaprest` is a lightweight, stateless HTTP bridge that exposes a REST API for reading email via IMAP and sending email via SMTP. It is designed to be run as a Docker container behind a credential-injecting proxy (such as OneCLI), which supplies IMAP/SMTP credentials as HTTP request headers. The bridge itself stores no credentials.

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

Credentials are **not** stored in the container. They are supplied by the caller (e.g. OneCLI proxy) as HTTP request headers on every request:

| Header | Description |
|---|---|
| `X-IMAP-Host` | IMAP server hostname |
| `X-IMAP-Port` | IMAP server port (default: `993`) |
| `X-IMAP-TLS` | `true`/`false` (default: `true`) |
| `X-IMAP-User` | IMAP username |
| `X-IMAP-Password` | IMAP password |
| `X-SMTP-Host` | SMTP server hostname |
| `X-SMTP-Port` | SMTP server port (default: `587`) |
| `X-SMTP-TLS` | `true`/`false` (default: `true`) |
| `X-SMTP-User` | SMTP username |
| `X-SMTP-Password` | SMTP password |

IMAP headers are required for all `/mailboxes` and `/messages` endpoints.  
SMTP headers are required for `POST /send`.

---

## Non-Functional Requirements

- **Stateless** — no database, no persistent state; each request opens and closes its own IMAP connection
- **Performance** — all message filtering uses server-side IMAP `SEARCH`; message bodies are only fetched when explicitly requested
- **Docker-first** — official `Dockerfile`, minimal image (Node.js Alpine base)
- **No privileged access** — runs as a non-root user inside the container
- **Configurable listen port** — via `PORT` environment variable (default: `3000`)

---

## Out of Scope (v1)

- OAuth / multi-account support
- Attachment upload or download (metadata only in v1)
- Push notifications (IMAP IDLE) — polling only
- Message threading / conversation grouping
- Search by body content (subject/from/date filters only)

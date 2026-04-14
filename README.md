# imaprest

A lightweight REST API for IMAP mailboxes and SMTP sending, built with [Fastify](https://fastify.dev) and TypeScript.

## Overview

imaprest lets you interact with email accounts over HTTP. Credentials and server configuration are passed per-request via headers — no server-side configuration needed.

## Installation

### Docker (recommended)

```bash
docker compose up -d
```

The API will be available on `http://localhost:3000`.

To expose a different port, set the `PORT` environment variable and update the port mapping in `docker-compose.yml`:

```yaml
services:
  imaprest:
    ports:
      - "8080:8080"
    environment:
      PORT: "8080"
```

### From source

```bash
cd rest
npm ci
npm run build
npm start
```

Or for development with auto-reload:

```bash
cd rest
npm run dev
```

## Authentication Headers

Every request must include:

| Header | Description |
|--------|-------------|
| `X-Mail-User` | Email address / IMAP username |
| `X-Mail-Password` | Password |

### IMAP configuration (mailbox & message routes)

| Header | Default | Description |
|--------|---------|-------------|
| `X-IMAP-Host` | *(required)* | IMAP server hostname |
| `X-IMAP-Port` | `993` | IMAP port |
| `X-IMAP-TLS` | `true` | Use TLS (`true`/`false`) |

### SMTP configuration (send & reply routes)

| Header | Default | Description |
|--------|---------|-------------|
| `X-SMTP-Host` | *(required)* | SMTP server hostname |
| `X-SMTP-Port` | `587` | SMTP port |
| `X-SMTP-TLS` | `false` | Use TLS (`true`/`false`) |

## Endpoints

### Mailboxes

```
GET /mailboxes
```

List all mailboxes.

### Messages

```
GET    /mailboxes/:mailbox/messages               # list messages (paginated)
GET    /mailboxes/:mailbox/messages/search        # search messages (paginated)
GET    /mailboxes/:mailbox/messages/:uid          # get full message
DELETE /mailboxes/:mailbox/messages/:uid          # move message to Trash
PATCH  /mailboxes/:mailbox/messages/:uid          # update flags, e.g. { "seen": true }
POST   /mailboxes/:mailbox/messages/:uid/reply    # reply to a message
POST   /mailboxes/:mailbox/messages/:uid/move     # move single message
POST   /mailboxes/:mailbox/messages/:uid/copy     # copy single message
```

#### Pagination

The listing and search endpoints support cursor-based pagination:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cursor` | — | UID cursor; returns messages with UID < cursor |
| `limit` | `50` | Page size (max 100) |

Response shape:

```json
{
  "messages": [...],
  "nextCursor": 480,
  "hasMore": true
}
```

#### Search parameters

| Parameter | Description |
|-----------|-------------|
| `q` | Full-text body search |
| `from` | Filter by sender |
| `subject` | Filter by subject |
| `since` | Messages sent on or after this ISO-8601 date |
| `before` | Messages sent before this ISO-8601 date |
| `unseen` | Only unread messages (`true`) |

### Bulk Operations

```
PATCH /mailboxes/:mailbox/messages                # bulk mark seen/flagged
POST  /mailboxes/:mailbox/messages/move           # bulk move to another mailbox
POST  /mailboxes/:mailbox/messages/copy           # bulk copy to another mailbox
```

Bulk mark body:

```json
{
  "uids": [10, 20, 30],
  "seen": true,
  "flagged": false
}
```

Bulk move/copy body:

```json
{
  "uids": [10, 20, 30],
  "destination": "Archive"
}
```

All bulk endpoints cap `uids` at 100 entries per request.

### Send

```
POST /send
```

Body:

```json
{
  "to": ["recipient@example.com"],
  "cc": ["cc@example.com"],
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>"
}
```

`to` is required; `cc`, `text`, and `html` are optional (at least one of `text`/`html` must be provided).

## Development

```bash
cd rest
npm run typecheck   # TypeScript type checking
npm run lint        # ESLint
npm test            # Jest tests
```

## License

MIT — see [LICENSE](./LICENSE).

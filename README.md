# imaprest

A lightweight REST API for IMAP mailboxes and SMTP sending, built with [Fastify](https://fastify.dev) and TypeScript.

## Overview

imaprest lets you interact with email accounts over HTTP. Credentials and server configuration are passed per-request via headers — no server-side configuration needed.

## Installation

```bash
npm ci
npm run build
node dist/index.js
```

Or for development with auto-reload:

```bash
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
GET    /mailboxes/:mailbox/messages               # list messages (supports search query params)
GET    /mailboxes/:mailbox/messages/:uid          # get full message
DELETE /mailboxes/:mailbox/messages/:uid          # move message to Trash
PATCH  /mailboxes/:mailbox/messages/:uid          # update flags, e.g. { "seen": true }
POST   /mailboxes/:mailbox/messages/:uid/reply    # reply to a message
```

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
npm run typecheck   # TypeScript type checking
npm run lint        # ESLint
npm test            # Jest tests
```

## License

MIT — see [LICENSE](./LICENSE).

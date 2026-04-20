# imaprest

A lightweight REST API for IMAP mailboxes and SMTP sending, built with [Fastify](https://fastify.dev) and TypeScript.

## Overview

imaprest lets you interact with email accounts over HTTP. Credentials and server configuration are passed per-request via headers — no server-side configuration needed.

An optional **MCP server** (`imaprest-mcp`) is included, wrapping the REST API as [Model Context Protocol](https://modelcontextprotocol.io) tools for use with LLM agents.

## Installation

### Docker (recommended)

```bash
docker compose up -d
```

The REST API will be available on `http://localhost:3000`.  
The MCP server will be available on `http://localhost:3001`.

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

## Authentication

imaprest supports two authentication modes:

### Mode 1: Per-request headers

Pass credentials and server config with every request:

| Header | Description |
|--------|-------------|
| `X-Mail-User` | Email address / IMAP username |
| `X-Mail-Password` | Password |

**IMAP configuration**

| Header | Default | Description |
|--------|---------|-------------|
| `X-IMAP-Host` | *(required)* | IMAP server hostname |
| `X-IMAP-Port` | `993` | IMAP port |
| `X-IMAP-TLS` | `true` | Use TLS (`true`/`false`) |

**SMTP configuration**

| Header | Default | Description |
|--------|---------|-------------|
| `X-SMTP-Host` | *(required)* | SMTP server hostname |
| `X-SMTP-Port` | `465` | SMTP port |
| `X-SMTP-TLS` | `true` | Use TLS (`true`/`false`) |

For any header, the corresponding env var is used as a fallback if the header is omitted.

### Mode 2: HTTP Basic auth + server env vars

Pass credentials via a standard `Authorization: Basic` header. IMAP/SMTP server config is not accepted in headers — it must be set server-side via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_IMAP_HOST` | *(required)* | IMAP server hostname |
| `MAIL_IMAP_PORT` | `993` | IMAP port |
| `MAIL_IMAP_TLS` | `true` | IMAP TLS (`true`/`false`) |
| `MAIL_SMTP_HOST` | *(required)* | SMTP server hostname |
| `MAIL_SMTP_PORT` | `587` | SMTP port |
| `MAIL_SMTP_TLS` | `true` | SMTP TLS (`true`/`false`) |

This mode is useful when deploying imaprest as a dedicated single-account server (e.g. behind a proxy) and you don't want clients to be able to specify arbitrary mail servers.

## Endpoints

### Mailboxes

```
GET /mailboxes
```

List all mailboxes.

### Messages

```
GET    /mailboxes/:mailbox/messages                              # list messages (paginated)
GET    /mailboxes/:mailbox/messages/search                       # search messages (paginated)
GET    /mailboxes/:mailbox/messages/:uid                         # get full message
GET    /mailboxes/:mailbox/messages/:uid/attachments/:index      # download attachment (returns binary)
DELETE /mailboxes/:mailbox/messages/:uid                         # move message to Trash
PATCH  /mailboxes/:mailbox/messages/:uid                         # update flags, e.g. { "seen": true }
POST   /mailboxes/:mailbox/messages/:uid/reply                   # reply to a message
POST   /mailboxes/:mailbox/messages/:uid/move                    # move single message
POST   /mailboxes/:mailbox/messages/:uid/copy                    # copy single message
```

### Threads

```
GET /mailboxes/:mailbox/thread/:messageId
```

Retrieve all messages in a conversation thread by `Message-ID` header value.

#### Pagination

The listing and search endpoints support cursor-based pagination:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cursor` | — | UID cursor; returns messages with UID < cursor |
| `limit` | `50` | Page size (max 100) |
| `sort` | `desc` | Sort order: `asc` (oldest first) or `desc` (newest first) |

Response shape:

```json
{
  "messages": [...],
  "nextCursor": 480,
  "hasMore": true
}
```

#### List filters

The list endpoint accepts optional query parameters to pre-filter results:

| Parameter | Description |
|-----------|-------------|
| `from` | Filter by sender address |
| `since` | Messages sent on or after this ISO-8601 date |
| `unseen` | Only unread messages (`true`) |

#### Search parameters

The dedicated search endpoint supports richer filtering:

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
PATCH /mailboxes/:mailbox/messages                # bulk mark seen/unseen and/or flagged/unflagged
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

At least one of `seen` or `flagged` must be provided. All bulk endpoints cap `uids` at 100 entries per request.

Bulk move/copy body:

```json
{
  "uids": [10, 20, 30],
  "destination": "Archive"
}
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
  "html": "<p>HTML body</p>",
  "attachments": [
    {
      "filename": "report.pdf",
      "contentType": "application/pdf",
      "content": "<base64-encoded content>"
    }
  ]
}
```

`to` and `subject` are required; `cc`, `text`, `html`, and `attachments` are optional (at least one of `text`/`html` must be provided).

### Reply

```
POST /mailboxes/:mailbox/messages/:uid/reply
```

Body:

```json
{
  "text": "Plain text reply",
  "attachments": [
    {
      "filename": "file.txt",
      "contentType": "text/plain",
      "content": "<base64-encoded content>"
    }
  ]
}
```

`text` is required; `attachments` is optional.

## MCP Server

`imaprest-mcp` is a [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) MCP server that wraps the REST API and exposes it as MCP tools for LLM agents.

### Running

The MCP server is included in `docker-compose.yml` and starts automatically alongside the REST API:

```bash
docker compose up -d
```

It listens on `http://172.17.0.1:3001` by default (bound to the Docker bridge interface; adjust in `docker-compose.yml` if needed).

The MCP endpoint is `POST /mcp`. A health check is available at `GET /health`.

### Configuration

Credentials and server settings are configured once via environment variables — the MCP tools do not require per-request headers:

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAPREST_URL` | `http://imaprest:3000` | URL of the REST API |
| `MAIL_USER` | *(required)* | Email address / IMAP username |
| `MAIL_PASSWORD` | *(required)* | Password |
| `MAIL_IMAP_HOST` | *(required)* | IMAP server hostname |
| `MAIL_IMAP_PORT` | `993` | IMAP port |
| `MAIL_IMAP_TLS` | `true` | IMAP TLS (`true`/`false`) |
| `MAIL_SMTP_HOST` | *(required)* | SMTP server hostname |
| `MAIL_SMTP_PORT` | `465` | SMTP port |
| `MAIL_SMTP_TLS` | `true` | SMTP TLS (`true`/`false`) |
| `PORT` | `3001` | Port the MCP server listens on |

Set these in a `.env` file at the project root:

```dotenv
MAIL_USER=you@example.com
MAIL_PASSWORD=secret
MAIL_IMAP_HOST=imap.example.com
MAIL_SMTP_HOST=smtp.example.com
```

### Tools

| Tool | Description |
|------|-------------|
| `list_mailboxes` | List all IMAP folders |
| `list_messages` | List messages with optional filters (`unseen`, `from`, `since`, `sort`, `cursor`, `limit`) |
| `search_messages` | Full-text search (`q`, `from`, `subject`, `since`, `before`, `unseen`, `sort`) |
| `get_message` | Fetch a single message by UID |
| `get_thread` | Fetch all messages in a thread by `Message-ID` |
| `download_attachment` | Download an attachment by index (returns base64) |
| `send_email` | Compose and send a new email (supports attachments) |
| `reply_to_message` | Reply to a message by UID (supports attachments) |
| `mark_message` | Mark a single message as `seen`/`unseen` |
| `bulk_mark_messages` | Mark multiple messages as `seen`/`unseen` and/or `flagged` (max 100 UIDs) |
| `delete_message` | Move a message to Trash |
| `move_message` | Move a single message to another mailbox |
| `copy_message` | Copy a single message to another mailbox |
| `bulk_move_messages` | Move multiple messages at once (max 100 UIDs) |
| `bulk_copy_messages` | Copy multiple messages at once (max 100 UIDs) |

### Connecting an agent

Point your MCP client at `http://<host>:3001/mcp`. Example NanoClaw config:

```json
{
  "mcpServers": {
    "imaprest": {
      "type": "http",
      "url": "http://172.17.0.1:3001/mcp"
    }
  }
}
```

## Development

```bash
cd rest
npm run typecheck   # TypeScript type checking
npm run lint        # ESLint
npm test            # Jest tests
```

For the MCP server:

```bash
cd mcp
npm run typecheck
npm run lint
npm test
```

## License

MIT — see [LICENSE](./LICENSE).



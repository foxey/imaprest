# Product Overview

imaprest is a stateless REST API that bridges HTTP to IMAP mailboxes and SMTP sending. Credentials and server config are passed per-request via headers — no server-side state or configuration is stored.

The project has two deployable services:

- **rest** — The core Fastify HTTP API. Exposes endpoints for listing mailboxes, reading/searching/deleting/flagging messages, replying, sending email, and bulk operations (mark, move, copy). Message listing and search support cursor-based pagination.
- **mcp** — A Model Context Protocol (MCP) server that wraps the REST API, exposing mail operations as tools for AI agents. It forwards requests to the rest service using environment-configured credentials.

Both services are containerised and orchestrated via Docker Compose.

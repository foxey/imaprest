import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const credentialHeaders = [
  {
    name: "X-Mail-User",
    in: "header" as const,
    description: "Mail account username (alternative to Authorization: Basic)",
    schema: { type: "string" },
  },
  {
    name: "X-Mail-Password",
    in: "header" as const,
    description: "Mail account password (alternative to Authorization: Basic)",
    schema: { type: "string" },
  },
];

const imapHeaders = [
  {
    name: "X-IMAP-Host",
    in: "header" as const,
    description:
      "IMAP server hostname. Used only with X-Mail-User/Password auth; ignored when using Authorization header (falls back to IMAP_HOST env var).",
    schema: { type: "string" },
  },
  {
    name: "X-IMAP-Port",
    in: "header" as const,
    description: "IMAP port. Used only with X-Mail-User/Password auth (default: 993, or IMAP_PORT env var).",
    schema: { type: "integer", default: 993 },
  },
  {
    name: "X-IMAP-TLS",
    in: "header" as const,
    description: "Use TLS for IMAP. Used only with X-Mail-User/Password auth (default: true, or IMAP_TLS env var).",
    schema: { type: "string", enum: ["true", "false"], default: "true" },
  },
];

const smtpHeaders = [
  {
    name: "X-SMTP-Host",
    in: "header" as const,
    description:
      "SMTP server hostname. Used only with X-Mail-User/Password auth; ignored when using Authorization header (falls back to SMTP_HOST env var).",
    schema: { type: "string" },
  },
  {
    name: "X-SMTP-Port",
    in: "header" as const,
    description: "SMTP port. Used only with X-Mail-User/Password auth (default: 587, or SMTP_PORT env var).",
    schema: { type: "integer", default: 587 },
  },
  {
    name: "X-SMTP-TLS",
    in: "header" as const,
    description: "Use implicit TLS for SMTP. Used only with X-Mail-User/Password auth (default: true, or SMTP_TLS env var).",
    schema: { type: "string", enum: ["true", "false"], default: "true" },
  },
];

const listQueryParams = [
  {
    name: "cursor",
    in: "query" as const,
    description: "Pagination cursor (UID of last seen message)",
    schema: { type: "integer" },
  },
  {
    name: "limit",
    in: "query" as const,
    description: "Number of messages to return (default: 20)",
    schema: { type: "integer", default: 20 },
  },
  {
    name: "sort",
    in: "query" as const,
    description: "Sort order by UID (default: desc)",
    schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
  },
  {
    name: "q",
    in: "query" as const,
    description: "Full-text search query",
    schema: { type: "string" },
  },
  {
    name: "unseen",
    in: "query" as const,
    description: "Filter to unread messages only",
    schema: { type: "boolean" },
  },
  {
    name: "from",
    in: "query" as const,
    description: "Filter by sender address",
    schema: { type: "string" },
  },
  {
    name: "subject",
    in: "query" as const,
    description: "Filter by subject",
    schema: { type: "string" },
  },
  {
    name: "since",
    in: "query" as const,
    description: "Filter messages since date (ISO 8601)",
    schema: { type: "string", format: "date" },
  },
  {
    name: "before",
    in: "query" as const,
    description: "Filter messages before date (ISO 8601)",
    schema: { type: "string", format: "date" },
  },
];

const messageSummarySchema = {
  type: "object",
  properties: {
    uid: { type: "integer" },
    from: { type: "string" },
    subject: { type: "string" },
    date: { type: "string", format: "date-time" },
    seen: { type: "boolean" },
  },
};

const paginatedListSchema = {
  type: "object",
  properties: {
    messages: { type: "array", items: messageSummarySchema },
    nextCursor: { type: "integer", nullable: true },
    hasMore: { type: "boolean" },
  },
};

const attachmentSchema = {
  type: "object",
  properties: {
    filename: { type: "string" },
    contentType: { type: "string" },
    size: { type: "integer" },
  },
};

const fullMessageSchema = {
  type: "object",
  properties: {
    uid: { type: "integer" },
    messageId: { type: "string" },
    from: { type: "string" },
    to: { type: "array", items: { type: "string" } },
    cc: { type: "array", items: { type: "string" } },
    subject: { type: "string" },
    date: { type: "string", format: "date-time" },
    seen: { type: "boolean" },
    text: { type: "string", nullable: true },
    html: { type: "string", nullable: true },
    attachments: { type: "array", items: attachmentSchema },
    references: { type: "array", items: { type: "string" } },
    inReplyTo: { type: "string", nullable: true },
  },
};

const errorSchema = {
  type: "object",
  properties: { error: { type: "string" } },
};

const spec = {
  openapi: "3.0.3",
  info: {
    title: "imaprest",
    version: "1.0.0",
    description:
      "REST API for IMAP/SMTP mail access.\n\n" +
      "**Two authentication modes:**\n\n" +
      "1. **Authorization header** — `Authorization: Basic base64(user:password)`. " +
      "IMAP/SMTP server config is taken from server env vars (`IMAP_HOST`, `SMTP_HOST`, etc.). " +
      "Per-request `X-IMAP-*` / `X-SMTP-*` headers are ignored.\n\n" +
      "2. **X-Mail headers** — `X-Mail-User` + `X-Mail-Password`. " +
      "IMAP/SMTP server config is provided via `X-IMAP-Host` / `X-SMTP-Host` headers " +
      "(or env var fallbacks `IMAP_HOST` / `SMTP_HOST`).",
  },
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
        description: "HTTP Basic auth — credentials are base64(user:password)",
      },
    },
  },
  security: [{ basicAuth: [] }],
  paths: {
    "/imaprest/health": {
      get: {
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "Server is running",
            content: {
              "application/json": {
                schema: { type: "object", properties: { status: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    "/imaprest/openapi.json": {
      get: {
        summary: "OpenAPI specification",
        security: [],
        responses: {
          "200": { description: "This document" },
        },
      },
    },
    "/imaprest/mailboxes": {
      get: {
        summary: "List mailboxes",
        parameters: [...credentialHeaders, ...imapHeaders],
        responses: {
          "200": {
            description: "List of mailboxes",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      path: { type: "string" },
                      name: { type: "string" },
                      delimiter: { type: "string" },
                      flags: { type: "array", items: { type: "string" } },
                      subscribed: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages": {
      get: {
        summary: "List messages",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          ...credentialHeaders,
          ...imapHeaders,
          ...listQueryParams,
        ],
        responses: {
          "200": {
            description: "Paginated message list",
            content: { "application/json": { schema: paginatedListSchema } },
          },
          "400": { description: "Invalid query parameters", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
      patch: {
        summary: "Bulk mark messages (seen/flagged)",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["uids"],
                properties: {
                  uids: { type: "array", items: { type: "integer" } },
                  seen: { type: "boolean" },
                  flagged: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/search": {
      get: {
        summary: "Search messages (requires at least one filter criterion)",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          ...credentialHeaders,
          ...imapHeaders,
          ...listQueryParams,
        ],
        responses: {
          "200": {
            description: "Paginated search results",
            content: { "application/json": { schema: paginatedListSchema } },
          },
          "400": { description: "No search criteria provided", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/move": {
      post: {
        summary: "Bulk move messages",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["uids", "destination"],
                properties: {
                  uids: { type: "array", items: { type: "integer" } },
                  destination: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "UID mapping (source → destination)",
            content: {
              "application/json": {
                schema: { type: "object", properties: { uids: { type: "object" } } },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Destination mailbox not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/copy": {
      post: {
        summary: "Bulk copy messages",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["uids", "destination"],
                properties: {
                  uids: { type: "array", items: { type: "integer" } },
                  destination: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "UID mapping (source → destination)",
            content: {
              "application/json": {
                schema: { type: "object", properties: { uids: { type: "object" } } },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Destination mailbox not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/{uid}": {
      get: {
        summary: "Get message by UID",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        responses: {
          "200": {
            description: "Full message",
            content: { "application/json": { schema: fullMessageSchema } },
          },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
      delete: {
        summary: "Delete message (moves to Trash)",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        responses: {
          "204": { description: "Deleted" },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
      patch: {
        summary: "Update message flags",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["seen"],
                properties: { seen: { type: "boolean" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated",
            content: {
              "application/json": {
                schema: { type: "object", properties: { uid: { type: "integer" }, seen: { type: "boolean" } } },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/{uid}/reply": {
      post: {
        summary: "Reply to a message",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
          ...smtpHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  html: { type: "string" },
                  attachments: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["filename", "contentType", "content"],
                      properties: {
                        filename: { type: "string" },
                        contentType: { type: "string" },
                        content: { type: "string", description: "Base64-encoded content" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Queued",
            content: { "application/json": { schema: { type: "object", properties: { queued: { type: "boolean" } } } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/{uid}/move": {
      post: {
        summary: "Move a single message",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["destination"],
                properties: { destination: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "New UID in destination",
            content: { "application/json": { schema: { type: "object", properties: { uid: { type: "integer" } } } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message or destination not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/{uid}/copy": {
      post: {
        summary: "Copy a single message",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["destination"],
                properties: { destination: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "New UID in destination",
            content: { "application/json": { schema: { type: "object", properties: { uid: { type: "integer" } } } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message or destination not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/messages/{uid}/attachments/{index}": {
      get: {
        summary: "Download an attachment",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          { name: "uid", in: "path", required: true, schema: { type: "integer" } },
          { name: "index", in: "path", required: true, description: "Zero-based attachment index", schema: { type: "integer" } },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        responses: {
          "200": { description: "Attachment binary content" },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
          "404": { description: "Message or attachment not found", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/mailboxes/{mailbox}/thread/{messageId}": {
      get: {
        summary: "Get thread by Message-ID",
        parameters: [
          { name: "mailbox", in: "path", required: true, schema: { type: "string" } },
          {
            name: "messageId",
            in: "path",
            required: true,
            description: "URL-encoded Message-ID (e.g. %3Cfoo%40bar.com%3E)",
            schema: { type: "string" },
          },
          ...credentialHeaders,
          ...imapHeaders,
        ],
        responses: {
          "200": {
            description: "Thread messages",
            content: { "application/json": { schema: { type: "array", items: fullMessageSchema } } },
          },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/imaprest/send": {
      post: {
        summary: "Send a new email",
        parameters: [...credentialHeaders, ...smtpHeaders],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["to", "subject"],
                properties: {
                  to: { type: "array", items: { type: "string" } },
                  cc: { type: "array", items: { type: "string" } },
                  subject: { type: "string" },
                  text: { type: "string" },
                  html: { type: "string" },
                  attachments: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["filename", "contentType", "content"],
                      properties: {
                        filename: { type: "string" },
                        contentType: { type: "string" },
                        content: { type: "string", description: "Base64-encoded content" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Queued",
            content: { "application/json": { schema: { type: "object", properties: { queued: { type: "boolean" } } } } },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
          "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
  },
};

export async function openapiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/openapi.json", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.type("application/json").send(spec);
  });
}

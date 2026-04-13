import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const IMAPREST_URL = process.env.IMAPREST_URL ?? 'http://imaprest:3000';
const MAIL_USER = process.env.MAIL_USER ?? '';
const MAIL_PASSWORD = process.env.MAIL_PASSWORD ?? '';
const MAIL_IMAP_HOST = process.env.MAIL_IMAP_HOST ?? '';
const MAIL_IMAP_PORT = process.env.MAIL_IMAP_PORT ?? '993';
const MAIL_IMAP_TLS = process.env.MAIL_IMAP_TLS ?? 'true';
const MAIL_SMTP_HOST = process.env.MAIL_SMTP_HOST ?? '';
const MAIL_SMTP_PORT = process.env.MAIL_SMTP_PORT ?? '587';
const MAIL_SMTP_TLS = process.env.MAIL_SMTP_TLS ?? 'false';
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ---------------------------------------------------------------------------
// Credential headers
// ---------------------------------------------------------------------------

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Mail-User': MAIL_USER,
  'X-Mail-Password': MAIL_PASSWORD,
};

const IMAP_HEADERS: Record<string, string> = {
  ...BASE_HEADERS,
  'X-IMAP-Host': MAIL_IMAP_HOST,
  'X-IMAP-Port': MAIL_IMAP_PORT,
  'X-IMAP-TLS': MAIL_IMAP_TLS,
};

const SMTP_HEADERS: Record<string, string> = {
  ...BASE_HEADERS,
  'X-SMTP-Host': MAIL_SMTP_HOST,
  'X-SMTP-Port': MAIL_SMTP_PORT,
  'X-SMTP-TLS': MAIL_SMTP_TLS,
};

const IMAP_SMTP_HEADERS: Record<string, string> = {
  ...IMAP_HEADERS,
  'X-SMTP-Host': MAIL_SMTP_HOST,
  'X-SMTP-Port': MAIL_SMTP_PORT,
  'X-SMTP-TLS': MAIL_SMTP_TLS,
};

// ---------------------------------------------------------------------------
// imaprest HTTP helper
// ---------------------------------------------------------------------------

async function callImaprest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${IMAPREST_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Tool input schemas
// Defined at module level so TypeScript computes each type once and caches it.
// Passed as `shape as any` to server.tool() to avoid tsc OOM: the MCP SDK +
// Zod generic chain is too deep for tsc to infer inline without exhausting
// the heap. The callback args are still explicitly typed via z.infer<>.
// ---------------------------------------------------------------------------

const listMessagesInput = z.object({
  mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
  unseen: z.boolean().optional().describe('Only return unseen messages'),
  from: z.string().optional().describe('Filter by sender address'),
  since: z.string().optional().describe('ISO 8601 date — return messages since this date'),
  limit: z.number().int().positive().optional().describe('Maximum number of messages to return'),
});

const markMessageInput = z.object({
  mailbox: z.string().describe('Mailbox name'),
  uid: z.number().int().positive().describe('Message UID'),
  seen: z.boolean().describe('true = mark as seen, false = mark as unseen'),
});

const sendEmailInput = z.object({
  to: z.array(z.string()).describe('Recipient addresses'),
  subject: z.string().describe('Email subject'),
  text: z.string().optional().describe('Plain-text body'),
  html: z.string().optional().describe('HTML body'),
  cc: z.array(z.string()).optional().describe('CC addresses'),
});

// ---------------------------------------------------------------------------
// MCP server factory — one instance per request (stateless)
// ---------------------------------------------------------------------------

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'imaprest', version: '0.1.0' });

  // list_mailboxes
  server.tool(
    'list_mailboxes',
    'List all IMAP mailboxes / folders for the configured account.',
    {},
    async () => {
      const { status, data } = await callImaprest('GET', '/mailboxes', IMAP_HEADERS);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // list_messages
  server.tool(
    'list_messages',
    'List messages in a mailbox, with optional filters.',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listMessagesInput.shape as any,
    async ({ mailbox, unseen, from, since, limit }: z.infer<typeof listMessagesInput>) => {
      const params = new URLSearchParams();
      if (unseen) params.set('unseen', 'true');
      if (from) params.set('from', from);
      if (since) params.set('since', since);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const path = `/mailboxes/${encodeURIComponent(mailbox)}/messages${qs ? `?${qs}` : ''}`;
      const { status, data } = await callImaprest('GET', path, IMAP_HEADERS);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // get_message
  server.tool(
    'get_message',
    'Fetch a single message by UID.',
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      uid: z.number().int().positive().describe('Message UID'),
    },
    async ({ mailbox, uid }) => {
      const { status, data } = await callImaprest(
        'GET',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        IMAP_HEADERS,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // delete_message
  server.tool(
    'delete_message',
    'Move a message to the Trash folder.',
    {
      mailbox: z.string().describe('Source mailbox name'),
      uid: z.number().int().positive().describe('Message UID'),
    },
    async ({ mailbox, uid }) => {
      const { status, data } = await callImaprest(
        'DELETE',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        IMAP_HEADERS,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // mark_message
  server.tool(
    'mark_message',
    'Mark a message as seen or unseen.',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markMessageInput.shape as any,
    async ({ mailbox, uid, seen }: z.infer<typeof markMessageInput>) => {
      const { status, data } = await callImaprest(
        'PATCH',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        IMAP_HEADERS,
        { seen },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // reply_to_message
  server.tool(
    'reply_to_message',
    'Send a plain-text reply to an existing message.',
    {
      mailbox: z.string().describe('Mailbox containing the original message'),
      uid: z.number().int().positive().describe('UID of the message to reply to'),
      text: z.string().describe('Plain-text body of the reply'),
    },
    async ({ mailbox, uid, text }) => {
      const { status, data } = await callImaprest(
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}/reply`,
        IMAP_SMTP_HEADERS,
        { text },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // send_email
  server.tool(
    'send_email',
    'Compose and send a new email.',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEmailInput.shape as any,
    async ({ to, subject, text, html, cc }: z.infer<typeof sendEmailInput>) => {
      const { status, data } = await callImaprest('POST', '/send', SMTP_HEADERS, {
        to,
        subject,
        ...(text !== undefined ? { text } : {}),
        ...(html !== undefined ? { html } : {}),
        ...(cc !== undefined ? { cc } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const rawBody = await readBody(req);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = buildMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
  res.on('close', () => {
    transport.close().catch(() => {});
  });
}

const httpServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/mcp') {
      await handleMcpRequest(req, res);
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    console.error('Unhandled error:', err);
  }
});

httpServer.listen(PORT, () => {
  console.log(`imaprest-mcp listening on port ${PORT}`);
});

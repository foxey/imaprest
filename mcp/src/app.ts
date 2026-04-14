import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpAppConfig {
  imaprestUrl: string;
  mailUser: string;
  mailPassword: string;
  imapHost: string;
  imapPort: string;
  imapTls: string;
  smtpHost: string;
  smtpPort: string;
  smtpTls: string;
}

// ---------------------------------------------------------------------------
// Credential headers
// ---------------------------------------------------------------------------

function buildHeaders(cfg: McpAppConfig) {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Mail-User': cfg.mailUser,
    'X-Mail-Password': cfg.mailPassword,
  };

  const imap: Record<string, string> = {
    ...base,
    'X-IMAP-Host': cfg.imapHost,
    'X-IMAP-Port': cfg.imapPort,
    'X-IMAP-TLS': cfg.imapTls,
  };

  const smtp: Record<string, string> = {
    ...base,
    'X-SMTP-Host': cfg.smtpHost,
    'X-SMTP-Port': cfg.smtpPort,
    'X-SMTP-TLS': cfg.smtpTls,
  };

  const imapSmtp: Record<string, string> = {
    ...imap,
    'X-SMTP-Host': cfg.smtpHost,
    'X-SMTP-Port': cfg.smtpPort,
    'X-SMTP-TLS': cfg.smtpTls,
  };

  return { base, imap, smtp, imapSmtp };
}

// ---------------------------------------------------------------------------
// imaprest HTTP helper
// ---------------------------------------------------------------------------

export async function callImaprest(
  imaprestUrl: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${imaprestUrl}${path}`, {
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
// MCP server factory
// ---------------------------------------------------------------------------

export function buildMcpServer(cfg: McpAppConfig): McpServer {
  const hdrs = buildHeaders(cfg);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = new McpServer({ name: 'imaprest', version: '0.1.0' }) as any;

  // list_mailboxes
  server.tool(
    'list_mailboxes',
    'List all IMAP mailboxes / folders for the configured account.',
    {},
    async () => {
      const { status, data } = await callImaprest(cfg.imaprestUrl, 'GET', '/mailboxes', hdrs.imap);
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
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      unseen: z.boolean().optional().describe('Only return unseen messages'),
      from: z.string().optional().describe('Filter by sender address'),
      since: z.string().optional().describe('ISO 8601 date — return messages since this date'),
      limit: z.number().int().positive().optional().describe('Maximum number of messages to return'),
      cursor: z.number().int().positive().optional().describe('Pagination cursor — UID to start from (exclusive, returns older messages)'),
      sort: z.enum(['asc', 'desc']).optional().describe('Sort order: asc (oldest first) or desc (newest first)'),
    },
    async ({
      mailbox,
      unseen,
      from,
      since,
      limit,
      cursor,
      sort,
    }: {
      mailbox: string;
      unseen?: boolean;
      from?: string;
      since?: string;
      limit?: number;
      cursor?: number;
      sort?: 'asc' | 'desc';
    }) => {
      const params = new URLSearchParams();
      if (unseen) params.set('unseen', 'true');
      if (from) params.set('from', from);
      if (since) params.set('since', since);
      if (limit !== undefined) params.set('limit', String(limit));
      if (cursor !== undefined) params.set('cursor', String(cursor));
      if (sort) params.set('sort', sort);
      const qs = params.toString();
      const path = `/mailboxes/${encodeURIComponent(mailbox)}/messages${qs ? `?${qs}` : ''}`;
      const { status, data } = await callImaprest(cfg.imaprestUrl, 'GET', path, hdrs.imap);
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
    async ({ mailbox, uid }: { mailbox: string; uid: number }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'GET',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        hdrs.imap,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // get_thread
  server.tool(
    'get_thread',
    'Retrieve all messages in a conversation thread given a Message-ID.',
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      messageId: z.string().describe('Message-ID header value to find the thread for'),
    },
    async ({ mailbox, messageId }: { mailbox: string; messageId: string }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'GET',
        `/mailboxes/${encodeURIComponent(mailbox)}/thread/${encodeURIComponent(messageId)}`,
        hdrs.imap,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // download_attachment
  server.tool(
    'download_attachment',
    'Download a specific attachment from an email message.',
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      uid: z.number().int().positive().describe('Message UID'),
      index: z.number().int().min(0).describe('Attachment index (zero-based)'),
    },
    async ({ mailbox, uid, index }: { mailbox: string; uid: number; index: number }) => {
      const path = `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}/attachments/${index}`;
      const res = await fetch(`${cfg.imaprestUrl}${path}`, {
        method: 'GET',
        headers: hdrs.imap,
      });
      if (res.status >= 400) {
        const text = await res.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = text; }
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: res.status, data }) }],
          isError: true,
        };
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        content: [{ type: 'text', text: buffer.toString('base64') }],
        isError: false,
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
    async ({ mailbox, uid }: { mailbox: string; uid: number }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'DELETE',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        hdrs.imap,
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
    {
      mailbox: z.string().describe('Mailbox name'),
      uid: z.number().int().positive().describe('Message UID'),
      seen: z.boolean().describe('true = mark as seen, false = mark as unseen'),
    },
    async ({ mailbox, uid, seen }: { mailbox: string; uid: number; seen: boolean }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'PATCH',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}`,
        hdrs.imap,
        { seen },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // bulk_mark_messages
  server.tool(
    'bulk_mark_messages',
    'Mark multiple messages as seen/unseen and/or flagged/unflagged in bulk.',
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      uids: z.array(z.number().int().positive()).describe('Array of message UIDs to update'),
      seen: z.boolean().optional().describe('true = mark as seen, false = mark as unseen'),
      flagged: z.boolean().optional().describe('true = flag, false = unflag'),
    },
    async ({ mailbox, uids, seen, flagged }: { mailbox: string; uids: number[]; seen?: boolean; flagged?: boolean }) => {
      const body: Record<string, unknown> = { uids };
      if (seen !== undefined) body.seen = seen;
      if (flagged !== undefined) body.flagged = flagged;
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'PATCH',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages`,
        hdrs.imap,
        body,
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
      attachments: z.array(z.object({
        filename: z.string(),
        contentType: z.string(),
        content: z.string().describe('Base64-encoded file content'),
      })).optional().describe('File attachments'),
    },
    async ({ mailbox, uid, text, attachments }: { mailbox: string; uid: number; text: string; attachments?: { filename: string; contentType: string; content: string }[] }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}/reply`,
        hdrs.imapSmtp,
        { text, ...(attachments !== undefined ? { attachments } : {}) },
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
    {
      to: z.array(z.string()).describe('Recipient addresses'),
      subject: z.string().describe('Email subject'),
      text: z.string().optional().describe('Plain-text body'),
      html: z.string().optional().describe('HTML body'),
      cc: z.array(z.string()).optional().describe('CC addresses'),
      attachments: z.array(z.object({
        filename: z.string(),
        contentType: z.string(),
        content: z.string().describe('Base64-encoded file content'),
      })).optional().describe('File attachments'),
    },
    async ({
      to,
      subject,
      text,
      html,
      cc,
      attachments,
    }: {
      to: string[];
      subject: string;
      text?: string;
      html?: string;
      cc?: string[];
      attachments?: { filename: string; contentType: string; content: string }[];
    }) => {
      const { status, data } = await callImaprest(cfg.imaprestUrl, 'POST', '/send', hdrs.smtp, {
        to,
        subject,
        ...(text !== undefined ? { text } : {}),
        ...(html !== undefined ? { html } : {}),
        ...(cc !== undefined ? { cc } : {}),
        ...(attachments !== undefined ? { attachments } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // move_message
  server.tool(
    'move_message',
    'Move a message from one mailbox to another.',
    {
      mailbox: z.string().describe('Source mailbox name, e.g. INBOX'),
      uid: z.number().int().positive().describe('Message UID'),
      destination: z.string().describe('Destination mailbox name'),
    },
    async ({ mailbox, uid, destination }: { mailbox: string; uid: number; destination: string }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}/move`,
        hdrs.imap,
        { destination },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // copy_message
  server.tool(
    'copy_message',
    'Copy a message from one mailbox to another.',
    {
      mailbox: z.string().describe('Source mailbox name, e.g. INBOX'),
      uid: z.number().int().positive().describe('Message UID'),
      destination: z.string().describe('Destination mailbox name'),
    },
    async ({ mailbox, uid, destination }: { mailbox: string; uid: number; destination: string }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/${uid}/copy`,
        hdrs.imap,
        { destination },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // bulk_move_messages
  server.tool(
    'bulk_move_messages',
    'Move multiple messages from one mailbox to another.',
    {
      mailbox: z.string().describe('Source mailbox name, e.g. INBOX'),
      uids: z.array(z.number().int().positive()).describe('Array of message UIDs to move'),
      destination: z.string().describe('Destination mailbox name'),
    },
    async ({ mailbox, uids, destination }: { mailbox: string; uids: number[]; destination: string }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/move`,
        hdrs.imap,
        { uids, destination },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // bulk_copy_messages
  server.tool(
    'bulk_copy_messages',
    'Copy multiple messages from one mailbox to another.',
    {
      mailbox: z.string().describe('Source mailbox name, e.g. INBOX'),
      uids: z.array(z.number().int().positive()).describe('Array of message UIDs to copy'),
      destination: z.string().describe('Destination mailbox name'),
    },
    async ({ mailbox, uids, destination }: { mailbox: string; uids: number[]; destination: string }) => {
      const { status, data } = await callImaprest(
        cfg.imaprestUrl,
        'POST',
        `/mailboxes/${encodeURIComponent(mailbox)}/messages/copy`,
        hdrs.imap,
        { uids, destination },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  // search_messages
  server.tool(
    'search_messages',
    'Search messages in a mailbox by keyword, sender, subject, date range, and read status.',
    {
      mailbox: z.string().describe('Mailbox name, e.g. INBOX'),
      q: z.string().optional().describe('Full-text search keyword'),
      from: z.string().optional().describe('Filter by sender address'),
      subject: z.string().optional().describe('Filter by subject line'),
      since: z.string().optional().describe('ISO 8601 date — return messages on or after this date'),
      before: z.string().optional().describe('ISO 8601 date — return messages before this date'),
      unseen: z.boolean().optional().describe('Only return unread messages'),
      limit: z.number().int().positive().optional().describe('Maximum number of results to return'),
      cursor: z.number().int().positive().optional().describe('Pagination cursor — UID to start from (exclusive, returns older messages)'),
      sort: z.enum(['asc', 'desc']).optional().describe('Sort order: asc (oldest first) or desc (newest first)'),
    },
    async ({
      mailbox,
      q,
      from,
      subject,
      since,
      before,
      unseen,
      limit,
      cursor,
      sort,
    }: {
      mailbox: string;
      q?: string;
      from?: string;
      subject?: string;
      since?: string;
      before?: string;
      unseen?: boolean;
      limit?: number;
      cursor?: number;
      sort?: 'asc' | 'desc';
    }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (from) params.set('from', from);
      if (subject) params.set('subject', subject);
      if (since) params.set('since', since);
      if (before) params.set('before', before);
      if (unseen) params.set('unseen', 'true');
      if (limit !== undefined) params.set('limit', String(limit));
      if (cursor !== undefined) params.set('cursor', String(cursor));
      if (sort) params.set('sort', sort);
      const qs = params.toString();
      const path = `/mailboxes/${encodeURIComponent(mailbox)}/messages/search${qs ? `?${qs}` : ''}`;
      const { status, data } = await callImaprest(cfg.imaprestUrl, 'GET', path, hdrs.imap);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status, data }) }],
        isError: status >= 400,
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP request handling
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
  cfg: McpAppConfig,
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
  const mcpServer = buildMcpServer(cfg);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
  res.on('close', () => {
    transport.close().catch(() => {});
  });
}

export function createHttpServer(cfg: McpAppConfig): http.Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/mcp') {
        await handleMcpRequest(cfg, req, res);
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
}

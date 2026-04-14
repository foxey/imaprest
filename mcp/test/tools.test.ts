import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, McpAppConfig } from '../src/app';

const TEST_CFG: McpAppConfig = {
  imaprestUrl: 'http://localhost:9999',
  mailUser: 'user@test.com',
  mailPassword: 'pass',
  imapHost: 'imap.test.com',
  imapPort: '993',
  imapTls: 'true',
  smtpHost: 'smtp.test.com',
  smtpPort: '587',
  smtpTls: 'false',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let client: Client;
let fetchSpy: jest.SpyInstance;

function mockFetchResponse(status: number, data: unknown): void {
  fetchSpy.mockResolvedValueOnce({
    status,
    text: async () => JSON.stringify(data),
  } as Response);
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await client.callTool({ name, arguments: args })) as any;
}

function parseToolText(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');

  const mcpServer = buildMcpServer(TEST_CFG);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: 'test-client', version: '1.0.0' });
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('list_mailboxes', () => {
  it('calls GET /mailboxes with IMAP headers and returns data', async () => {
    const mailboxes = [{ path: 'INBOX', name: 'INBOX' }];
    mockFetchResponse(200, mailboxes);

    const result = await callTool('list_mailboxes');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes');
    expect(opts.method).toBe('GET');
    expect(opts.headers['X-IMAP-Host']).toBe('imap.test.com');

    expect(result.isError).toBeFalsy();
    expect(parseToolText(result)).toEqual({ status: 200, data: mailboxes });
  });

  it('sets isError when REST returns 4xx', async () => {
    mockFetchResponse(401, { error: 'Unauthorized' });

    const result = await callTool('list_mailboxes');
    expect(result.isError).toBe(true);
  });
});

describe('list_messages', () => {
  it('calls GET /mailboxes/:mailbox/messages with query params', async () => {
    mockFetchResponse(200, []);

    await callTool('list_messages', {
      mailbox: 'INBOX',
      unseen: true,
      from: 'alice@test.com',
      since: '2025-01-01',
      limit: 10,
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/mailboxes/INBOX/messages?');
    expect(url).toContain('unseen=true');
    expect(url).toContain('from=alice%40test.com');
    expect(url).toContain('since=2025-01-01');
    expect(url).toContain('limit=10');
  });

  it('omits query string when no optional filters provided', async () => {
    mockFetchResponse(200, []);

    await callTool('list_messages', { mailbox: 'INBOX' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages');
  });

  it('encodes mailbox name in path', async () => {
    mockFetchResponse(200, []);

    await callTool('list_messages', { mailbox: 'Sent Items' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/mailboxes/Sent%20Items/messages');
  });
});

describe('get_message', () => {
  it('calls GET /mailboxes/:mailbox/messages/:uid', async () => {
    const msg = { uid: 42, subject: 'Hello' };
    mockFetchResponse(200, msg);

    const result = await callTool('get_message', { mailbox: 'INBOX', uid: 42 });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages/42');
    expect(opts.method).toBe('GET');
    expect(parseToolText(result)).toEqual({ status: 200, data: msg });
  });
});

describe('delete_message', () => {
  it('calls DELETE /mailboxes/:mailbox/messages/:uid', async () => {
    mockFetchResponse(204, '');

    const result = await callTool('delete_message', { mailbox: 'INBOX', uid: 7 });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages/7');
    expect(opts.method).toBe('DELETE');
    expect(result.isError).toBeFalsy();
  });
});

describe('mark_message', () => {
  it('calls PATCH with { seen } body', async () => {
    mockFetchResponse(200, { uid: 5, seen: true });

    await callTool('mark_message', { mailbox: 'INBOX', uid: 5, seen: true });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages/5');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ seen: true });
  });
});

describe('reply_to_message', () => {
  it('calls POST /mailboxes/:mailbox/messages/:uid/reply with IMAP+SMTP headers', async () => {
    mockFetchResponse(202, { queued: true });

    const result = await callTool('reply_to_message', {
      mailbox: 'INBOX',
      uid: 10,
      text: 'Thanks!',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages/10/reply');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-IMAP-Host']).toBe('imap.test.com');
    expect(opts.headers['X-SMTP-Host']).toBe('smtp.test.com');
    expect(JSON.parse(opts.body)).toEqual({ text: 'Thanks!' });
    expect(result.isError).toBeFalsy();
  });
});

describe('send_email', () => {
  it('calls POST /send with SMTP headers and full body', async () => {
    mockFetchResponse(202, { queued: true });

    await callTool('send_email', {
      to: ['bob@test.com'],
      subject: 'Hi',
      text: 'Hello',
      html: '<p>Hello</p>',
      cc: ['carol@test.com'],
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/send');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-SMTP-Host']).toBe('smtp.test.com');
    expect(JSON.parse(opts.body)).toEqual({
      to: ['bob@test.com'],
      subject: 'Hi',
      text: 'Hello',
      html: '<p>Hello</p>',
      cc: ['carol@test.com'],
    });
  });

  it('omits optional fields when not provided', async () => {
    mockFetchResponse(202, { queued: true });

    await callTool('send_email', {
      to: ['bob@test.com'],
      subject: 'Hi',
      text: 'Hello',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ to: ['bob@test.com'], subject: 'Hi', text: 'Hello' });
    expect(body.html).toBeUndefined();
    expect(body.cc).toBeUndefined();
  });

  it('sets isError on 4xx response', async () => {
    mockFetchResponse(400, { error: 'bad request' });

    const result = await callTool('send_email', {
      to: ['bob@test.com'],
      subject: 'Hi',
      text: 'Hello',
    });

    expect(result.isError).toBe(true);
  });
});

describe('get_thread', () => {
  it('calls GET /mailboxes/:mailbox/thread/:messageId with URL-encoded messageId', async () => {
    const thread = [
      { uid: 10, from: 'alice@test.com', subject: 'Hello', date: '2024-06-01T10:00:00Z', seen: true },
      { uid: 15, from: 'bob@test.com', subject: 'Re: Hello', date: '2024-06-01T11:00:00Z', seen: false },
    ];
    mockFetchResponse(200, thread);

    const result = await callTool('get_thread', {
      mailbox: 'INBOX',
      messageId: '<abc@example.com>',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'http://localhost:9999/mailboxes/INBOX/thread/%3Cabc%40example.com%3E',
    );
    expect(opts.method).toBe('GET');
    expect(result.isError).toBeFalsy();
    expect(parseToolText(result)).toEqual({ status: 200, data: thread });
  });

  it('sets isError when REST returns 4xx', async () => {
    mockFetchResponse(404, { error: 'Not found' });

    const result = await callTool('get_thread', {
      mailbox: 'INBOX',
      messageId: '<missing@example.com>',
    });

    expect(result.isError).toBe(true);
  });
});

describe('download_attachment', () => {
  it('calls GET /mailboxes/:mailbox/messages/:uid/attachments/:index', async () => {
    const src = Buffer.from('pdf-content');
    const ab = new ArrayBuffer(src.length);
    new Uint8Array(ab).set(src);
    fetchSpy.mockResolvedValueOnce({
      status: 200,
      arrayBuffer: async () => ab,
    } as unknown as Response);

    const result = await callTool('download_attachment', {
      mailbox: 'INBOX',
      uid: 42,
      index: 0,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9999/mailboxes/INBOX/messages/42/attachments/0');
    expect(opts.method).toBe('GET');
    expect(result.isError).toBe(false);
    // Verify the response is base64-encoded
    expect(result.content[0].text).toBe(Buffer.from('pdf-content').toString('base64'));
  });

  it('sets isError when REST returns 4xx', async () => {
    fetchSpy.mockResolvedValueOnce({
      status: 404,
      text: async () => JSON.stringify({ error: 'Not found' }),
    } as unknown as Response);

    const result = await callTool('download_attachment', {
      mailbox: 'INBOX',
      uid: 42,
      index: 99,
    });

    expect(result.isError).toBe(true);
  });
});

describe('send_email with attachments', () => {
  it('includes attachments in the request body when provided', async () => {
    mockFetchResponse(202, { queued: true });

    const attachments = [
      { filename: 'report.pdf', contentType: 'application/pdf', content: 'JVBERi0xLjQK' },
    ];

    const result = await callTool('send_email', {
      to: ['bob@test.com'],
      subject: 'Report',
      text: 'See attached.',
      attachments,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.attachments).toEqual(attachments);
    expect(result.isError).toBeFalsy();
  });
});

describe('reply_to_message with attachments', () => {
  it('includes attachments in the request body when provided', async () => {
    mockFetchResponse(202, { queued: true });

    const attachments = [
      { filename: 'notes.txt', contentType: 'text/plain', content: 'SGVsbG8=' },
    ];

    const result = await callTool('reply_to_message', {
      mailbox: 'INBOX',
      uid: 10,
      text: 'See attached notes.',
      attachments,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.attachments).toEqual(attachments);
    expect(result.isError).toBeFalsy();
  });
});

describe('list_messages with sort', () => {
  it('forwards sort query parameter when provided', async () => {
    mockFetchResponse(200, []);

    await callTool('list_messages', { mailbox: 'INBOX', sort: 'asc' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('sort=asc');
  });
});

describe('search_messages with sort', () => {
  it('forwards sort query parameter when provided', async () => {
    mockFetchResponse(200, []);

    await callTool('search_messages', { mailbox: 'INBOX', q: 'hello', sort: 'asc' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('sort=asc');
  });
});

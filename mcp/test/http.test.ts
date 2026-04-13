import http from 'http';
import { createHttpServer, McpAppConfig } from '../src/app';

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

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') return reject(new Error('no address'));
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, method, path, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('HTTP server', () => {
  let server: http.Server;

  beforeAll((done) => {
    server = createHttpServer(TEST_CFG);
    server.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /health returns 200 with { status: "ok" }', async () => {
    const res = await request(server, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(server, 'GET', '/unknown');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
  });

  it('POST /mcp with invalid JSON returns 400', async () => {
    const res = await request(server, 'POST', '/mcp', 'not json');
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON' });
  });
});

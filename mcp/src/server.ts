import { createHttpServer, McpAppConfig } from './app';

const hasProxy = !!(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
const mailUser = process.env.MAIL_USER ?? '';
const mailPassword = process.env.MAIL_PASSWORD ?? '';

if (!hasProxy && (!mailUser || !mailPassword)) {
  console.error(
    'Error: MAIL_USER and MAIL_PASSWORD must be set when HTTP_PROXY/HTTPS_PROXY is not configured.',
  );
  process.exit(1);
}

const cfg: McpAppConfig = {
  imaprestUrl: process.env.IMAPREST_URL ?? 'http://imaprest:3000',
  ...(hasProxy ? {} : { mailUser, mailPassword }),
  imapHost: process.env.MAIL_IMAP_HOST ?? '',
  imapPort: process.env.MAIL_IMAP_PORT ?? '993',
  imapTls: process.env.MAIL_IMAP_TLS ?? 'true',
  smtpHost: process.env.MAIL_SMTP_HOST ?? '',
  smtpPort: process.env.MAIL_SMTP_PORT ?? '465',
  smtpTls: process.env.MAIL_SMTP_TLS ?? 'true',
};

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const httpServer = createHttpServer(cfg);

httpServer.listen(PORT, () => {
  console.log(`imaprest-mcp listening on port ${PORT}`);
});

import { ImapFlow } from "imapflow";
import { BaseCredentials, ImapConfig } from "./credentials";

export interface Mailbox {
  path: string;
  name: string;
  delimiter: string;
  flags: string[];
  subscribed: boolean;
}

export async function createImapClient(
  creds: BaseCredentials,
  imap: ImapConfig
): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.tls,
    auth: {
      user: creds.user,
      pass: creds.password,
    },
    logger: false,
  });
  await client.connect();
  return client;
}

export async function disconnectImapClient(client: ImapFlow): Promise<void> {
  await client.logout();
}

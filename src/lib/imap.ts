import { ImapFlow } from "imapflow";
import { Credentials } from "./credentials";

export interface Mailbox {
  path: string;
  name: string;
  delimiter: string;
  flags: string[];
  subscribed: boolean;
}

export async function createImapClient(creds: Credentials): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: creds.imap.host,
    port: creds.imap.port,
    secure: creds.imap.tls,
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

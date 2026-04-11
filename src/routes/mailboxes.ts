import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CredentialError, extractCredentials, extractImapConfig } from "../lib/credentials";
import { createImapClient, disconnectImapClient, Mailbox } from "../lib/imap";

export async function mailboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mailboxes", async (request: FastifyRequest, reply: FastifyReply) => {
    let creds;
    let imap;
    try {
      creds = extractCredentials(request.headers as Record<string, string | string[] | undefined>);
      imap = extractImapConfig(request.headers as Record<string, string | string[] | undefined>);
    } catch (err) {
      if (err instanceof CredentialError) {
        return reply.status(401).send({ error: err.message });
      }
      throw err;
    }

    const client = await createImapClient(creds, imap);
    try {
      const entries = await client.list();
      const mailboxes: Mailbox[] = entries.map((entry) => ({
        path: entry.path,
        name: entry.name,
        delimiter: entry.delimiter ?? "/",
        flags: [...entry.flags],
        subscribed: entry.subscribed ?? false,
      }));
      return reply.send(mailboxes);
    } finally {
      await disconnectImapClient(client);
    }
  });
}

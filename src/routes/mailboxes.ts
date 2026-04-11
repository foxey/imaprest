import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CredentialError, extractCredentials } from "../lib/credentials";
import { createImapClient, disconnectImapClient, Mailbox } from "../lib/imap";

export async function mailboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mailboxes", async (request: FastifyRequest, reply: FastifyReply) => {
    let creds;
    try {
      creds = extractCredentials(request.headers as Record<string, string | string[] | undefined>);
    } catch (err) {
      if (err instanceof CredentialError) {
        return reply.status(401).send({ error: err.message });
      }
      throw err;
    }

    const client = await createImapClient(creds);
    try {
      const mailboxes: Mailbox[] = [];
      for await (const entry of client.list()) {
        mailboxes.push({
          path: entry.path,
          name: entry.name,
          delimiter: entry.delimiter ?? "/",
          flags: [...entry.flags],
          subscribed: entry.subscribed ?? false,
        });
      }
      return reply.send(mailboxes);
    } finally {
      await disconnectImapClient(client);
    }
  });
}

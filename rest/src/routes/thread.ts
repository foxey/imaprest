import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { getThread } from "../lib/thread";

type ThreadParams = { mailbox: string; messageId: string };

export async function threadRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: ThreadParams }>(
    "/mailboxes/:mailbox/thread/:messageId",
    async (
      request: FastifyRequest<{ Params: ThreadParams }>,
      reply: FastifyReply
    ) => {
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

      const decodedMessageId = decodeURIComponent(request.params.messageId);

      let client;
      try {
        client = await createImapClient(creds, imap);
      } catch {
        return reply.status(502).send({ error: "Failed to connect to IMAP server" });
      }

      try {
        await client.mailboxOpen(request.params.mailbox);
        const messages = await getThread(client, decodedMessageId, request.log);
        return reply.send(messages);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

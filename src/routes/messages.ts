import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CredentialError, extractCredentials } from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { buildSearchCriteria, SearchParams } from "../lib/search";

interface MessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

type MailboxParams = { mailbox: string };

export async function messagesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: MailboxParams; Querystring: SearchParams }>(
    "/mailboxes/:mailbox/messages",
    async (
      request: FastifyRequest<{ Params: MailboxParams; Querystring: SearchParams }>,
      reply: FastifyReply
    ) => {
      let creds;
      try {
        creds = extractCredentials(
          request.headers as Record<string, string | string[] | undefined>
        );
      } catch (err) {
        if (err instanceof CredentialError) {
          return reply.status(401).send({ error: err.message });
        }
        throw err;
      }

      let criteria;
      try {
        criteria = buildSearchCriteria(request.query);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const client = await createImapClient(creds);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const uids = await client.search(criteria, { uid: true });
        if (!uids || uids.length === 0) {
          return reply.send([]);
        }

        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch(
          uids,
          { uid: true, envelope: true, flags: true },
          { uid: true }
        )) {
          messages.push({
            uid: msg.uid,
            from: msg.envelope?.from?.[0]?.address ?? "",
            subject: msg.envelope?.subject ?? "",
            date: msg.envelope?.date?.toISOString() ?? "",
            seen: msg.flags?.has("\\Seen") ?? false,
          });
        }

        return reply.send(messages);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

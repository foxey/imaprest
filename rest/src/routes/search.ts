import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import {
  SearchParams,
  validateSearchParams,
  buildSearchCriteria,
} from "../lib/search";

interface MessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

type MailboxParams = { mailbox: string };

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: MailboxParams; Querystring: SearchParams }>(
    "/mailboxes/:mailbox/messages/search",
    async (
      request: FastifyRequest<{ Params: MailboxParams; Querystring: SearchParams }>,
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

      try {
        validateSearchParams(request.query);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const criteria = buildSearchCriteria(request.query);

      const limitStr = request.query.limit;
      const limit = limitStr ? parseInt(limitStr, 10) : 50;

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const uids = await client.search(criteria, { uid: true });
        if (!uids || uids.length === 0) {
          return reply.send([]);
        }

        const sortedUids = uids.sort((a, b) => b - a);
        const fetchUids = sortedUids.slice(0, limit);

        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch(
          fetchUids,
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

        messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return reply.send(messages);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

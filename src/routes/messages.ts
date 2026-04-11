import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CredentialError, extractCredentials } from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { parseRawMessage } from "../lib/parse";
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

  type MessageParams = { mailbox: string; uid: string };

  app.get<{ Params: MessageParams }>(
    "/mailboxes/:mailbox/messages/:uid",
    async (
      request: FastifyRequest<{ Params: MessageParams }>,
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

      const uidInt = parseInt(request.params.uid, 10);
      if (isNaN(uidInt) || uidInt <= 0) {
        return reply.status(400).send({ error: "Invalid UID — must be a positive integer" });
      }

      const client = await createImapClient(creds);
      try {
        await client.mailboxOpen(request.params.mailbox);

        let result = null;
        for await (const msg of client.fetch(
          [uidInt],
          { uid: true, source: true },
          { uid: true }
        )) {
          if (msg.source) {
            result = await parseRawMessage(msg.uid, msg.source);
          }
          break;
        }

        if (result === null) {
          return reply.status(404).send({ error: "Message not found" });
        }

        return reply.send(result);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

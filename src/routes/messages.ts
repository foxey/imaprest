import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractSmtpConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { parseRawMessage } from "../lib/parse";
import { buildSearchCriteria, SearchParams } from "../lib/search";
import { sendMail } from "../lib/smtp";

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

  type ReplyParams = { mailbox: string; uid: string };

  interface ReplyBody {
    text?: unknown;
    html?: unknown;
  }

  app.post<{ Params: ReplyParams; Body: ReplyBody }>(
    "/mailboxes/:mailbox/messages/:uid/reply",
    async (
      request: FastifyRequest<{ Params: ReplyParams; Body: ReplyBody }>,
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

      let smtp;
      try {
        smtp = extractSmtpConfig(
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

      const body = request.body ?? {};

      if (
        (typeof body.text !== "string" || body.text.trim() === "") &&
        (typeof body.html !== "string" || body.html.trim() === "")
      ) {
        return reply
          .status(400)
          .send({ error: "At least one of 'text' or 'html' is required" });
      }

      const client = await createImapClient(creds);
      try {
        await client.mailboxOpen(request.params.mailbox);

        let original = null;
        for await (const msg of client.fetch(
          [uidInt],
          { uid: true, source: true },
          { uid: true }
        )) {
          if (msg.source) {
            original = await parseRawMessage(msg.uid, msg.source);
          }
          break;
        }

        if (original === null) {
          return reply.status(404).send({ error: "Message not found" });
        }

        const reSubject = original.subject.match(/^re:\s/i)
          ? original.subject
          : `Re: ${original.subject}`;

        const references = original.messageId
          ? [...original.references, original.messageId]
          : original.references;

        await sendMail(
          { user: creds.user, password: creds.password },
          smtp,
          {
            from: creds.user,
            to: [original.from],
            subject: reSubject,
            text: typeof body.text === "string" ? body.text : null,
            html: typeof body.html === "string" ? body.html : null,
            inReplyTo: original.messageId,
            references,
          }
        );

        return reply.status(202).send({ queued: true });
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
  extractSmtpConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { buildUidRangeCriteria, paginateUids } from "../lib/paginate";
import { parseRawMessage } from "../lib/parse";
import { buildSearchCriteria, SearchParams } from "../lib/search";
import { sendMail } from "../lib/smtp";
import { validatePaginationParams } from "../lib/validate";

interface MessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

type MailboxParams = { mailbox: string };
type ListQuerystring = SearchParams & { cursor?: string };

export async function messagesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: MailboxParams; Querystring: ListQuerystring }>(
    "/mailboxes/:mailbox/messages",
    async (
      request: FastifyRequest<{ Params: MailboxParams; Querystring: ListQuerystring }>,
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

      let pagination;
      try {
        pagination = validatePaginationParams(request.query.cursor, request.query.limit);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      let searchCriteria;
      try {
        searchCriteria = buildSearchCriteria(request.query);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const mailbox = client.mailbox;
        const uidNext = mailbox ? mailbox.uidNext : 1;

        // UID range strategy:
        // - Unfiltered listing: use tight UID window for IMAP-level efficiency
        // - Filtered listing: use simple ceiling (uid < cursor) since matching
        //   UIDs may be scattered across the entire mailbox
        const hasSearchFilters = Object.keys(searchCriteria).length > 0;
        let uidRangeCriteria: { uid?: string } = {};
        if (hasSearchFilters) {
          if (pagination.cursor !== undefined) {
            uidRangeCriteria = { uid: `1:${pagination.cursor - 1}` };
          }
        } else {
          uidRangeCriteria = buildUidRangeCriteria(pagination.cursor, pagination.limit, uidNext);
        }

        const criteria = { ...searchCriteria, ...uidRangeCriteria };

        const uids = await client.search(criteria, { uid: true });
        if (!uids || uids.length === 0) {
          return reply.send({ messages: [], nextCursor: null, hasMore: false });
        }

        const page = paginateUids(uids, pagination.limit);

        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch(
          page.uids,
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

        return reply.send({
          messages,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        });
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

      const uidInt = parseInt(request.params.uid, 10);
      if (isNaN(uidInt) || uidInt <= 0) {
        return reply.status(400).send({ error: "Invalid UID — must be a positive integer" });
      }

      const client = await createImapClient(creds, imap);
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

  type DeleteParams = { mailbox: string; uid: string };

  app.delete<{ Params: DeleteParams }>(
    "/mailboxes/:mailbox/messages/:uid",
    async (
      request: FastifyRequest<{ Params: DeleteParams }>,
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

      const uidInt = parseInt(request.params.uid, 10);
      if (isNaN(uidInt) || uidInt <= 0) {
        return reply.status(400).send({ error: "Invalid UID — must be a positive integer" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const found = await client.search({ uid: String(uidInt) }, { uid: true });
        if (!found || found.length === 0) {
          return reply.status(404).send({ error: "Message not found" });
        }

        await client.messageMove([uidInt], "Trash", { uid: true });

        return reply.status(204).send();
      } finally {
        await disconnectImapClient(client);
      }
    }
  );

  type PatchParams = { mailbox: string; uid: string };

  interface PatchBody {
    seen?: unknown;
  }

  app.patch<{ Params: PatchParams; Body: PatchBody }>(
    "/mailboxes/:mailbox/messages/:uid",
    async (
      request: FastifyRequest<{ Params: PatchParams; Body: PatchBody }>,
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

      const uidInt = parseInt(request.params.uid, 10);
      if (isNaN(uidInt) || uidInt <= 0) {
        return reply.status(400).send({ error: "Invalid UID — must be a positive integer" });
      }

      const body = request.body ?? {};

      if (typeof body.seen !== "boolean") {
        return reply.status(400).send({ error: "'seen' must be a boolean" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const found = await client.search({ uid: String(uidInt) }, { uid: true });
        if (!found || found.length === 0) {
          return reply.status(404).send({ error: "Message not found" });
        }

        if (body.seen) {
          await client.messageFlagsAdd([uidInt], ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove([uidInt], ["\\Seen"], { uid: true });
        }

        return reply.send({ uid: uidInt, seen: body.seen });
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
      let imap;
      let smtp;
      try {
        creds = extractCredentials(request.headers as Record<string, string | string[] | undefined>);
        imap = extractImapConfig(request.headers as Record<string, string | string[] | undefined>);
        smtp = extractSmtpConfig(request.headers as Record<string, string | string[] | undefined>);
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

      const client = await createImapClient(creds, imap);
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
          creds,
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

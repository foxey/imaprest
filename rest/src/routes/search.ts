import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { paginateUids } from "../lib/paginate";
import {
  SearchParams,
  validateSearchParams,
  buildSearchCriteria,
} from "../lib/search";
import { validatePaginationParams, validateSortParam } from "../lib/validate";

interface MessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

type MailboxParams = { mailbox: string };
type SearchQuerystring = SearchParams & { cursor?: string; sort?: string };

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: MailboxParams; Querystring: SearchQuerystring }>(
    "/mailboxes/:mailbox/messages/search",
    async (
      request: FastifyRequest<{ Params: MailboxParams; Querystring: SearchQuerystring }>,
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

      let pagination;
      try {
        pagination = validatePaginationParams(request.query.cursor, request.query.limit);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      let sortDirection: 'asc' | 'desc';
      try {
        sortDirection = validateSortParam(request.query.sort);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const criteria = buildSearchCriteria(request.query);

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        // Only apply UID range when a cursor is provided.
        // For filtered searches, use a simple ceiling/floor since matching
        // UIDs may be scattered across the entire mailbox, not clustered
        // near the cursor.
        let uidRangeCriteria: { uid?: string } = {};
        if (pagination.cursor !== undefined) {
          if (sortDirection === 'asc') {
            uidRangeCriteria = { uid: `${pagination.cursor + 1}:*` };
          } else {
            uidRangeCriteria = { uid: `1:${pagination.cursor - 1}` };
          }
        }

        const mergedCriteria = { ...criteria, ...uidRangeCriteria };

        const uids = await client.search(mergedCriteria, { uid: true });
        if (!uids || uids.length === 0) {
          return reply.send({ messages: [], nextCursor: null, hasMore: false });
        }

        const page = paginateUids(uids, pagination.limit, sortDirection);

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
}

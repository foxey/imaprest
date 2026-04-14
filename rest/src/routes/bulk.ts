import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { validateUidArray } from "../lib/validate";

interface BulkParams {
  mailbox: string;
}

interface BulkMarkBody {
  uids?: unknown;
  seen?: unknown;
  flagged?: unknown;
}

interface BulkMoveCopyBody {
  uids?: unknown;
  destination?: unknown;
}

export async function bulkRoutes(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: BulkParams; Body: BulkMarkBody }>(
    "/mailboxes/:mailbox/messages",
    async (
      request: FastifyRequest<{ Params: BulkParams; Body: BulkMarkBody }>,
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

      const body = request.body ?? {};

      let uids: number[];
      try {
        uids = validateUidArray((body as BulkMarkBody).uids);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const { seen, flagged } = body as BulkMarkBody;

      if (seen !== undefined && typeof seen !== "boolean") {
        return reply.status(400).send({ error: "'seen' must be a boolean" });
      }

      if (flagged !== undefined && typeof flagged !== "boolean") {
        return reply.status(400).send({ error: "'flagged' must be a boolean" });
      }

      if (seen === undefined && flagged === undefined) {
        return reply.status(400).send({ error: "At least one of 'seen' or 'flagged' is required" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        if (seen === true) {
          await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
        } else if (seen === false) {
          await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
        }

        if (flagged === true) {
          await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
        } else if (flagged === false) {
          await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
        }

        const response: Record<string, unknown> = { uids };
        if (seen !== undefined) {
          response.seen = seen;
        }
        if (flagged !== undefined) {
          response.flagged = flagged;
        }

        return reply.status(200).send(response);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );

  app.post<{ Params: BulkParams; Body: BulkMoveCopyBody }>(
    "/mailboxes/:mailbox/messages/move",
    async (
      request: FastifyRequest<{ Params: BulkParams; Body: BulkMoveCopyBody }>,
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

      const body = request.body ?? {};

      let uids: number[];
      try {
        uids = validateUidArray((body as BulkMoveCopyBody).uids);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const { destination } = body as BulkMoveCopyBody;

      if (typeof destination !== "string" || destination.trim() === "") {
        return reply.status(400).send({ error: "'destination' is required" });
      }

      if (destination === request.params.mailbox) {
        return reply.status(400).send({ error: "Source and destination mailbox must differ" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        let result;
        try {
          result = await client.messageMove(uids, destination, { uid: true });
        } catch (err) {
          const message = (err as Error).message ?? "";
          if (message.includes("TRYCREATE") || message.toLowerCase().includes("mailbox")) {
            return reply.status(404).send({ error: "Destination mailbox not found" });
          }
          throw err;
        }

        const uidMap: Record<string, number> = {};
        if (result && result.uidMap) {
          for (const [srcUid, dstUid] of result.uidMap) {
            uidMap[srcUid.toString()] = dstUid;
          }
        }

        return reply.status(200).send({ uids: uidMap });
      } finally {
        await disconnectImapClient(client);
      }
    }
  );

  app.post<{ Params: BulkParams; Body: BulkMoveCopyBody }>(
    "/mailboxes/:mailbox/messages/copy",
    async (
      request: FastifyRequest<{ Params: BulkParams; Body: BulkMoveCopyBody }>,
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

      const body = request.body ?? {};

      let uids: number[];
      try {
        uids = validateUidArray((body as BulkMoveCopyBody).uids);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const { destination } = body as BulkMoveCopyBody;

      if (typeof destination !== "string" || destination.trim() === "") {
        return reply.status(400).send({ error: "'destination' is required" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        let result;
        try {
          result = await client.messageCopy(uids, destination, { uid: true });
        } catch (err) {
          const message = (err as Error).message ?? "";
          if (message.includes("TRYCREATE") || message.toLowerCase().includes("mailbox")) {
            return reply.status(404).send({ error: "Destination mailbox not found" });
          }
          throw err;
        }

        const uidMap: Record<string, number> = {};
        if (result && result.uidMap) {
          for (const [srcUid, dstUid] of result.uidMap) {
            uidMap[srcUid.toString()] = dstUid;
          }
        }

        return reply.status(200).send({ uids: uidMap });
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

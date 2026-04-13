import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";

interface MoveCopyParams {
  mailbox: string;
  uid: string;
}

interface MoveCopyBody {
  destination?: unknown;
}

export async function moveCopyRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: MoveCopyParams; Body: MoveCopyBody }>(
    "/mailboxes/:mailbox/messages/:uid/move",
    async (
      request: FastifyRequest<{ Params: MoveCopyParams; Body: MoveCopyBody }>,
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
      const destination = body.destination;

      if (typeof destination !== "string" || destination.trim() === "") {
        return reply.status(400).send({ error: "'destination' is required" });
      }

      if (destination === request.params.mailbox) {
        return reply.status(400).send({ error: "Source and destination mailbox must differ" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const found = await client.search({ uid: String(uidInt) }, { uid: true });
        if (!found || found.length === 0) {
          return reply.status(404).send({ error: "Message not found" });
        }

        let result;
        try {
          result = await client.messageMove([uidInt], destination, { uid: true });
        } catch (err) {
          const message = (err as Error).message ?? "";
          if (message.includes("TRYCREATE") || message.toLowerCase().includes("mailbox")) {
            return reply.status(404).send({ error: "Destination mailbox not found" });
          }
          throw err;
        }

        const newUid = result && result.uidMap?.get(uidInt);
        return reply.send({ uid: newUid });
      } finally {
        await disconnectImapClient(client);
      }
    }
  );

  app.post<{ Params: MoveCopyParams; Body: MoveCopyBody }>(
    "/mailboxes/:mailbox/messages/:uid/copy",
    async (
      request: FastifyRequest<{ Params: MoveCopyParams; Body: MoveCopyBody }>,
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
      const destination = body.destination;

      if (typeof destination !== "string" || destination.trim() === "") {
        return reply.status(400).send({ error: "'destination' is required" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        const found = await client.search({ uid: String(uidInt) }, { uid: true });
        if (!found || found.length === 0) {
          return reply.status(404).send({ error: "Message not found" });
        }

        let result;
        try {
          result = await client.messageCopy([uidInt], destination, { uid: true });
        } catch (err) {
          const message = (err as Error).message ?? "";
          if (message.includes("TRYCREATE") || message.toLowerCase().includes("mailbox")) {
            return reply.status(404).send({ error: "Destination mailbox not found" });
          }
          throw err;
        }

        const newUid = result && result.uidMap?.get(uidInt);
        return reply.send({ uid: newUid });
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

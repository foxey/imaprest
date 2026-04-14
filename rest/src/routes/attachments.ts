import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractImapConfig,
} from "../lib/credentials";
import { createImapClient, disconnectImapClient } from "../lib/imap";
import { simpleParser } from "mailparser";

type AttachmentParams = { mailbox: string; uid: string; index: string };

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: AttachmentParams }>(
    "/mailboxes/:mailbox/messages/:uid/attachments/:index",
    async (
      request: FastifyRequest<{ Params: AttachmentParams }>,
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

      const indexInt = parseInt(request.params.index, 10);
      if (isNaN(indexInt) || indexInt < 0) {
        return reply.status(400).send({ error: "Invalid attachment index — must be a non-negative integer" });
      }

      const client = await createImapClient(creds, imap);
      try {
        await client.mailboxOpen(request.params.mailbox);

        let source: Buffer | null = null;
        for await (const msg of client.fetch(
          [uidInt],
          { uid: true, source: true },
          { uid: true }
        )) {
          if (msg.source) {
            source = msg.source;
          }
          break;
        }

        if (source === null) {
          return reply.status(404).send({ error: "Message not found" });
        }

        const parsed = await simpleParser(source);

        const attachments = (parsed.attachments ?? []).filter(
          (a) => a.contentDisposition === "attachment" || !!a.filename
        );

        if (indexInt >= attachments.length) {
          return reply.status(404).send({ error: "Attachment not found" });
        }

        const attachment = attachments[indexInt];
        const contentType = attachment.contentType;
        const content = attachment.content;

        let dispositionHeader = "attachment";
        if (attachment.filename) {
          dispositionHeader = `attachment; filename="${attachment.filename}"`;
        }

        return reply
          .type(contentType)
          .header("Content-Disposition", dispositionHeader)
          .send(content);
      } finally {
        await disconnectImapClient(client);
      }
    }
  );
}

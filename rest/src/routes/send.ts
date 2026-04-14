import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CredentialError,
  extractCredentials,
  extractSmtpConfig,
} from "../lib/credentials";
import { sendMail } from "../lib/smtp";
import { validateAttachments } from "../lib/validate";

interface SendBody {
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  attachments?: unknown;
}

export async function sendRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SendBody }>(
    "/send",
    async (
      request: FastifyRequest<{ Body: SendBody }>,
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

      const body = request.body ?? {};

      if (
        !Array.isArray(body.to) ||
        body.to.length === 0 ||
        !body.to.every((a) => typeof a === "string")
      ) {
        return reply
          .status(400)
          .send({ error: "'to' is required and must be a non-empty array of strings" });
      }

      if (typeof body.subject !== "string" || body.subject.trim() === "") {
        return reply.status(400).send({ error: "'subject' is required" });
      }

      if (
        (typeof body.text !== "string" || body.text.trim() === "") &&
        (typeof body.html !== "string" || body.html.trim() === "")
      ) {
        return reply
          .status(400)
          .send({ error: "At least one of 'text' or 'html' is required" });
      }

      if (
        body.cc !== undefined &&
        (!Array.isArray(body.cc) || !body.cc.every((a) => typeof a === "string"))
      ) {
        return reply
          .status(400)
          .send({ error: "'cc' must be an array of strings" });
      }

      let validatedAttachments;
      if (body.attachments && Array.isArray(body.attachments) && body.attachments.length > 0) {
        try {
          validatedAttachments = validateAttachments(body.attachments);
        } catch (err) {
          return reply.status(400).send({ error: (err as Error).message });
        }
      }

      await sendMail(
        { user: creds.user, password: creds.password },
        smtp,
        {
          from: creds.user,
          to: body.to as string[],
          cc: body.cc as string[] | undefined,
          subject: body.subject as string,
          text: typeof body.text === "string" ? body.text : null,
          html: typeof body.html === "string" ? body.html : null,
          ...(validatedAttachments ? { attachments: validatedAttachments } : {}),
        }
      );

      return reply.status(202).send({ queued: true });
    }
  );
}

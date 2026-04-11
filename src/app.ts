import Fastify, { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";
import { mailboxRoutes } from "./routes/mailboxes";
import { messagesRoutes } from "./routes/messages";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers['x-mail-password']"],
    },
  });

  await app.register(healthRoutes);
  await app.register(mailboxRoutes);
  await app.register(messagesRoutes);

  return app;
}

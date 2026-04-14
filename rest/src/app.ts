import Fastify, { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";
import { mailboxRoutes } from "./routes/mailboxes";
import { messagesRoutes } from "./routes/messages";
import { moveCopyRoutes } from "./routes/move-copy";
import { searchRoutes } from "./routes/search";
import { sendRoutes } from "./routes/send";
import { bulkRoutes } from "./routes/bulk";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers['x-mail-password']"],
    },
  });

  await app.register(healthRoutes);
  await app.register(mailboxRoutes);
  await app.register(searchRoutes);
  await app.register(messagesRoutes);
  await app.register(sendRoutes);
  await app.register(moveCopyRoutes);
  await app.register(bulkRoutes);

  return app;
}

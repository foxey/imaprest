import Fastify, { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";
import { mailboxRoutes } from "./routes/mailboxes";
import { messagesRoutes } from "./routes/messages";
import { moveCopyRoutes } from "./routes/move-copy";
import { openapiRoutes } from "./routes/openapi";
import { searchRoutes } from "./routes/search";
import { sendRoutes } from "./routes/send";
import { bulkRoutes } from "./routes/bulk";
import { threadRoutes } from "./routes/thread";
import { attachmentRoutes } from "./routes/attachments";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers['x-mail-password']"] },
  });
  await app.register(async (api) => {
    await api.register(openapiRoutes);
    await api.register(healthRoutes);
    await api.register(mailboxRoutes);
    await api.register(searchRoutes);
    await api.register(messagesRoutes);
    await api.register(sendRoutes);
    await api.register(moveCopyRoutes);
    await api.register(bulkRoutes);
    await api.register(threadRoutes);
    await api.register(attachmentRoutes);
  }, { prefix: "/imaprest" });
  return app;
}

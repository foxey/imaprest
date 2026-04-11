import Fastify, { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers['x-mail-password']"],
    },
  });

  await app.register(healthRoutes);

  return app;
}

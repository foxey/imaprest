import { buildApp } from "./app";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function start(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

import { buildApp } from "../../src/app";

describe("GET /health", () => {
  it("returns 200 with { status: 'ok' }", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });

    await app.close();
  });
});

import { buildApp } from "../../src/app";
import * as smtpLib from "../../src/lib/smtp";

jest.mock("../../src/lib/smtp");

const CRED_HEADERS = {
  "x-mail-user": "user@example.com",
  "x-mail-password": "secret",
  "x-smtp-host": "smtp.example.com",
};

const VALID_BODY = {
  to: ["alice@example.com"],
  subject: "Hello",
  text: "Hi there",
};

describe("POST /send", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (smtpLib.sendMail as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 401 when credential headers are missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when X-SMTP-Host is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: {
        "x-mail-user": "user@example.com",
        "x-mail-password": "secret",
      },
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 202 without X-IMAP-Host (IMAP not needed for send)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: {
        "x-mail-user": "user@example.com",
        "x-mail-password": "secret",
        "x-smtp-host": "smtp.example.com",
      },
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(202);
    await app.close();
  });

  it("returns 400 when 'to' is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: { subject: "Hello", text: "Hi" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when 'to' is empty array", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: { to: [], subject: "Hello", text: "Hi" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when 'subject' is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: { to: ["alice@example.com"], text: "Hi" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when neither text nor html is provided", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: { to: ["alice@example.com"], subject: "Hello" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 202 with queued:true on success", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("calls sendMail with correct arguments", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: {
        to: ["alice@example.com"],
        cc: ["bob@example.com"],
        subject: "Greetings",
        text: "Hello!",
        html: "<p>Hello!</p>",
      },
    });
    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      { user: "user@example.com", password: "secret" },
      { host: "smtp.example.com", port: 587, tls: false },
      expect.objectContaining({
        from: "user@example.com",
        to: ["alice@example.com"],
        cc: ["bob@example.com"],
        subject: "Greetings",
        text: "Hello!",
        html: "<p>Hello!</p>",
      })
    );
    await app.close();
  });

  it("accepts html-only body", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/send",
      headers: CRED_HEADERS,
      payload: { to: ["alice@example.com"], subject: "Hi", html: "<p>hi</p>" },
    });
    expect(response.statusCode).toBe(202);
    await app.close();
  });
});

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

describe("POST /send — attachments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (smtpLib.sendMail as jest.Mock).mockResolvedValue(undefined);
  });

  it("returns 202 with valid attachments", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: Buffer.from("hello").toString("base64"),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("returns 400 when attachment missing filename", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [{ contentType: "text/plain", content: "aGVsbG8=" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when attachment missing contentType", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [{ filename: "test.txt", content: "aGVsbG8=" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when attachment missing content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [{ filename: "test.txt", contentType: "text/plain" }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for invalid base64 content", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: "!!!invalid!!!",
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 202 without attachments (backward compatibility)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("returns 202 with empty attachments array", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: { ...VALID_BODY, attachments: [] },
    });
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ queued: true });
    await app.close();
  });

  it("calls sendMail with decoded attachment buffers", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/imaprest/send",
      headers: CRED_HEADERS,
      payload: {
        ...VALID_BODY,
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: "aGVsbG8=",
          },
        ],
      },
    });

    expect(smtpLib.sendMail).toHaveBeenCalledWith(
      { user: "user@example.com", password: "secret" },
      { host: "smtp.example.com", port: 587, tls: true },
      expect.objectContaining({
        from: "user@example.com",
        to: ["alice@example.com"],
        subject: "Hello",
        text: "Hi there",
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: Buffer.from("hello"),
          },
        ],
      })
    );
    await app.close();
  });
});

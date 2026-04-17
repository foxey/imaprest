import { extractCredentials } from "../../src/lib/credentials";

type Headers = Record<string, string | string[] | undefined>;

function basicAuth(user: string, password: string): string {
  return "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
}

describe("extractCredentials", () => {
  describe("Authorization: Basic header", () => {
    it("extracts user and password from a valid Basic auth header", () => {
      const headers: Headers = { authorization: basicAuth("user@example.com", "s3cr3t") };
      const creds = extractCredentials(headers);
      expect(creds.user).toBe("user@example.com");
      expect(creds.password).toBe("s3cr3t");
    });

    it("handles passwords containing colons", () => {
      const headers: Headers = { authorization: basicAuth("user@example.com", "p:a:s:s") };
      const creds = extractCredentials(headers);
      expect(creds.user).toBe("user@example.com");
      expect(creds.password).toBe("p:a:s:s");
    });

    it("throws on a non-Basic Authorization scheme", () => {
      const headers: Headers = { authorization: "Bearer some-token" };
      expect(() => extractCredentials(headers)).toThrow(
        "Invalid Authorization header: expected Basic scheme",
      );
    });

    it("throws when the decoded value has no colon", () => {
      const noColon = "Basic " + Buffer.from("nocolon").toString("base64");
      const headers: Headers = { authorization: noColon };
      expect(() => extractCredentials(headers)).toThrow(
        "Invalid Authorization header: missing colon separator",
      );
    });

    it("throws when user is empty", () => {
      const headers: Headers = { authorization: basicAuth("", "password") };
      expect(() => extractCredentials(headers)).toThrow(
        "Invalid Authorization header: user and password are required",
      );
    });

    it("throws when password is empty", () => {
      const headers: Headers = { authorization: basicAuth("user@example.com", "") };
      expect(() => extractCredentials(headers)).toThrow(
        "Invalid Authorization header: user and password are required",
      );
    });
  });

  describe("X-Mail-* headers (fallback)", () => {
    it("extracts credentials from X-Mail-User and X-Mail-Password when no Authorization header", () => {
      const headers: Headers = {
        "x-mail-user": "user@example.com",
        "x-mail-password": "s3cr3t",
      };
      const creds = extractCredentials(headers);
      expect(creds.user).toBe("user@example.com");
      expect(creds.password).toBe("s3cr3t");
    });

    it("throws when both X-Mail headers are absent", () => {
      const headers: Headers = {};
      expect(() => extractCredentials(headers)).toThrow("Missing required headers");
    });

    it("throws listing the missing header name when only one is absent", () => {
      const headers: Headers = { "x-mail-user": "user@example.com" };
      expect(() => extractCredentials(headers)).toThrow("X-Mail-Password");
    });
  });

  describe("Authorization takes priority over X-Mail-*", () => {
    it("uses Authorization and ignores X-Mail headers when both are present", () => {
      const headers: Headers = {
        authorization: basicAuth("auth-user@example.com", "auth-pass"),
        "x-mail-user": "xmail-user@example.com",
        "x-mail-password": "xmail-pass",
      };
      const creds = extractCredentials(headers);
      expect(creds.user).toBe("auth-user@example.com");
      expect(creds.password).toBe("auth-pass");
    });
  });
});

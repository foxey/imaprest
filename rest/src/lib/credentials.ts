export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export interface BaseCredentials {
  user: string;
  password: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  tls: boolean;
}

type Headers = Record<string, string | string[] | undefined>;

function getHeader(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function extractCredentials(headers: Headers): BaseCredentials {
  const auth = getHeader(headers, "authorization");
  if (auth) {
    const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(auth);
    if (!match) {
      throw new CredentialError("Invalid Authorization header: expected Basic scheme");
    }
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) {
      throw new CredentialError("Invalid Authorization header: missing colon separator");
    }
    const user = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    if (!user || !password) {
      throw new CredentialError("Invalid Authorization header: user and password are required");
    }
    return { user, password };
  }

  const user = getHeader(headers, "x-mail-user");
  const password = getHeader(headers, "x-mail-password");

  if (!user || !password) {
    const missing = [!user && "X-Mail-User", !password && "X-Mail-Password"]
      .filter(Boolean)
      .join(", ");
    throw new CredentialError(`Missing required headers: ${missing}`);
  }

  return { user, password };
}

export function extractImapConfig(headers: Headers): ImapConfig {
  const host = getHeader(headers, "x-imap-host");

  if (!host) {
    throw new CredentialError("Missing required header: X-IMAP-Host");
  }

  const portStr = getHeader(headers, "x-imap-port") ?? "993";
  const tlsStr = getHeader(headers, "x-imap-tls") ?? "true";
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new CredentialError("X-IMAP-Port must be a valid port number (1-65535)");
  }

  return { host, port, tls: tlsStr.toLowerCase() !== "false" };
}

export function extractSmtpConfig(headers: Headers): SmtpConfig {
  const host = getHeader(headers, "x-smtp-host");

  if (!host) {
    throw new CredentialError("Missing required header: X-SMTP-Host");
  }

  const portStr = getHeader(headers, "x-smtp-port") ?? "587";
  const tlsStr = getHeader(headers, "x-smtp-tls") ?? "false";
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new CredentialError("X-SMTP-Port must be a valid port number (1-65535)");
  }

  return { host, port, tls: tlsStr.toLowerCase() === "true" };
}

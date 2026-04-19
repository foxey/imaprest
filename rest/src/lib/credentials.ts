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

function parseBasicAuth(authHeader: string): { user: string; password: string } | null {
  if (!authHeader.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;
    return { user: decoded.slice(0, colonIndex), password: decoded.slice(colonIndex + 1) };
  } catch {
    return null;
  }
}

export function extractCredentials(headers: Headers): BaseCredentials {
  const user = getHeader(headers, "x-mail-user");
  const password = getHeader(headers, "x-mail-password");

  if (user && password) {
    return { user, password };
  }

  const auth = getHeader(headers, "authorization");
  if (auth) {
    const parsed = parseBasicAuth(auth);
    if (parsed) return parsed;
    throw new CredentialError("Invalid Authorization header — expected Basic base64(user:password)");
  }

  const missing = [!user && "X-Mail-User", !password && "X-Mail-Password"]
    .filter(Boolean)
    .join(", ");
  throw new CredentialError(`Missing required headers: ${missing}`);
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

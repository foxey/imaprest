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

/**
 * Returns true when the request uses HTTP Basic auth (Authorization header)
 * rather than X-Mail-User / X-Mail-Password headers.
 * In this mode IMAP/SMTP connection config must come from server env vars.
 */
function isAuthorizationMode(headers: Headers): boolean {
  return !!getHeader(headers, "authorization") && !getHeader(headers, "x-mail-user");
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
  if (isAuthorizationMode(headers)) {
    // Authorization header mode: IMAP config must come from env vars
    const host = process.env.IMAP_HOST;
    if (!host) {
      throw new CredentialError(
        "IMAP_HOST env var is required when using the Authorization header"
      );
    }
    const portStr = process.env.IMAP_PORT ?? "993";
    const tlsStr = process.env.IMAP_TLS ?? "true";
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new CredentialError("IMAP_PORT env var must be a valid port number (1-65535)");
    }
    return { host, port, tls: tlsStr.toLowerCase() !== "false" };
  }

  // X-Mail-User mode: X-IMAP-Host required (env var fallback allowed)
  const host = getHeader(headers, "x-imap-host") ?? process.env.IMAP_HOST;
  if (!host) {
    throw new CredentialError("Missing required header: X-IMAP-Host (or set IMAP_HOST env var)");
  }

  const portStr = getHeader(headers, "x-imap-port") ?? process.env.IMAP_PORT ?? "993";
  const tlsStr = getHeader(headers, "x-imap-tls") ?? process.env.IMAP_TLS ?? "true";
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new CredentialError("X-IMAP-Port must be a valid port number (1-65535)");
  }

  return { host, port, tls: tlsStr.toLowerCase() !== "false" };
}

export function extractSmtpConfig(headers: Headers): SmtpConfig {
  if (isAuthorizationMode(headers)) {
    // Authorization header mode: SMTP config must come from env vars
    const host = process.env.SMTP_HOST;
    if (!host) {
      throw new CredentialError(
        "SMTP_HOST env var is required when using the Authorization header"
      );
    }
    const portStr = process.env.SMTP_PORT ?? "587";
    const tlsStr = process.env.SMTP_TLS ?? "true";
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new CredentialError("SMTP_PORT env var must be a valid port number (1-65535)");
    }
    return { host, port, tls: tlsStr.toLowerCase() === "true" };
  }

  // X-Mail-User mode: X-SMTP-Host required (env var fallback allowed)
  const host = getHeader(headers, "x-smtp-host") ?? process.env.SMTP_HOST;
  if (!host) {
    throw new CredentialError("Missing required header: X-SMTP-Host (or set SMTP_HOST env var)");
  }

  const portStr = getHeader(headers, "x-smtp-port") ?? process.env.SMTP_PORT ?? "587";
  const tlsStr = getHeader(headers, "x-smtp-tls") ?? process.env.SMTP_TLS ?? "true";
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new CredentialError("X-SMTP-Port must be a valid port number (1-65535)");
  }

  return { host, port, tls: tlsStr.toLowerCase() === "true" };
}

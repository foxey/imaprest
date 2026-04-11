export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
}

export interface Credentials {
  user: string;
  password: string;
  imap: ImapConfig;
}

type Headers = Record<string, string | string[] | undefined>;

function getHeader(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function extractCredentials(headers: Headers): Credentials {
  const user = getHeader(headers, "x-mail-user");
  const password = getHeader(headers, "x-mail-password");
  const imapHost = getHeader(headers, "x-imap-host");

  if (!user || !password || !imapHost) {
    const missing = [
      !user && "X-Mail-User",
      !password && "X-Mail-Password",
      !imapHost && "X-IMAP-Host",
    ]
      .filter(Boolean)
      .join(", ");
    throw new CredentialError(`Missing required headers: ${missing}`);
  }

  const portStr = getHeader(headers, "x-imap-port") ?? "993";
  const tlsStr = getHeader(headers, "x-imap-tls") ?? "true";
  const port = parseInt(portStr, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new CredentialError("X-IMAP-Port must be a valid port number (1-65535)");
  }

  return {
    user,
    password,
    imap: {
      host: imapHost,
      port,
      tls: tlsStr.toLowerCase() !== "false",
    },
  };
}

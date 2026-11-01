import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  clientOrigin: string;
  dbPassword?: string;
  rawDatabaseUrl?: string;
  resolvedDatabaseUrl?: string;
  rawDirectUrl?: string;
  resolvedDirectUrl?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;

  // GitHub App Configuration
  githubAppId?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  githubPrivateKey?: string;
  githubCallbackUrl: string;
  githubAppSlug: string;

  // Security Secrets
  sessionSecret: string;
  encryptionSecret: string;

  // Local AI Configuration (Ollama)
  aiProvider: "ollama";
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaContextLength: number;
  ollamaTimeoutMs: number;
}

/**
 * Normalizes multiline PEM private keys whether stored with raw newlines,
 * escaped \n characters, or surrounding quotes.
 */
export function formatPrivateKey(key?: string): string | undefined {
  if (!key) return undefined;
  let formatted = key.trim();
  if (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1);
  }
  // Replace literal \n with actual newlines
  formatted = formatted.replace(/\\n/g, "\n");
  return formatted.trim().length > 0 ? formatted : undefined;
}

/**
 * Resolves password placeholder in database URLs if present
 */
export function resolveConnectionUrl(
  url?: string,
  password?: string
): string | undefined {
  if (!url) return undefined;
  if (!password) {
    return url.replace("${DB_PASSWORD}", "").replace("[YOUR-PASSWORD]", "");
  }
  return url
    .replace("${DB_PASSWORD}", encodeURIComponent(password))
    .replace("[YOUR-PASSWORD]", encodeURIComponent(password));
}

/**
 * The GitHub App private key: the inline GITHUB_PRIVATE_KEY if set, otherwise the
 * file named by GITHUB_PRIVATE_KEY_PATH (relative paths resolve from the server
 * directory). The key itself is never logged.
 */
export function loadGithubPrivateKey(): string | undefined {
  const inline = formatPrivateKey(process.env.GITHUB_PRIVATE_KEY);
  if (inline) return inline;

  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH?.trim();
  if (!keyPath) return undefined;

  const resolved = isAbsolute(keyPath)
    ? keyPath
    : resolve(process.cwd(), keyPath);
  try {
    return formatPrivateKey(readFileSync(resolved, "utf8"));
  } catch {
    console.warn(
      `[Config] GITHUB_PRIVATE_KEY_PATH is set but the file could not be read: ${resolved}`
    );
    return undefined;
  }
}

/**
 * Caps Prisma's connection pool for this process. Prisma's default is
 * (CPU cores * 2 + 1), which exceeds the 15-client limit of Supabase's session
 * pooler on many machines and fails with EMAXCONNSESSION when queries run in
 * parallel. An explicit `connection_limit` in DATABASE_URL always wins.
 */
export const DEFAULT_DB_POOL_SIZE = 5;

export function withPoolLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      const configured = parseInt(process.env.DATABASE_POOL_SIZE ?? "", 10);
      const size =
        Number.isInteger(configured) && configured > 0
          ? configured
          : DEFAULT_DB_POOL_SIZE;
      parsed.searchParams.set("connection_limit", String(size));
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Safely masks password in connection URLs for secure logging
 */
export function maskConnectionUrl(url?: string): string {
  if (!url) return "not configured";
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "******";
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@/]+@/, ":******@");
  }
}

/**
 * Validates and parses application environment variables
 */
export function loadConfig(): AppConfig {
  const port = parseInt(process.env.PORT || "5001", 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Invalid PORT configuration: "${process.env.PORT}". Must be a valid port number.`
    );
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  const dbPassword = process.env.DB_PASSWORD || undefined;
  const rawDatabaseUrl = process.env.DATABASE_URL || undefined;
  const rawDirectUrl = process.env.DIRECT_URL || undefined;

  const resolvedDatabaseUrl = resolveConnectionUrl(rawDatabaseUrl, dbPassword);
  const resolvedDirectUrl = resolveConnectionUrl(rawDirectUrl, dbPassword);

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    undefined;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    undefined;

  // GitHub App
  const githubAppId = process.env.GITHUB_APP_ID || undefined;
  const githubClientId = process.env.GITHUB_CLIENT_ID || undefined;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || undefined;
  const githubPrivateKey = loadGithubPrivateKey();
  const githubCallbackUrl =
    process.env.GITHUB_CALLBACK_URL ||
    "http://localhost:5001/api/github/callback";
  const githubAppSlug = process.env.GITHUB_APP_SLUG || "dev-trace2607";

  // Secrets
  const sessionSecret =
    process.env.SESSION_SECRET ||
    "devtrace-default-session-secret-change-in-production-only";
  const encryptionSecret =
    process.env.ENCRYPTION_SECRET ||
    "devtrace-aes-token-encryption-secret-32-chars-min";

  // Local AI (Ollama) Configuration
  const aiProvider = "ollama" as const;
  const ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "qwen2.5-coder:7b";
  const ollamaContextLength =
    parseInt(process.env.OLLAMA_CONTEXT_LENGTH || "4096", 10) || 4096;
  const ollamaTimeoutMs =
    parseInt(process.env.OLLAMA_TIMEOUT_MS || "120000", 10) || 120000;

  return {
    port,
    nodeEnv,
    clientOrigin,
    dbPassword,
    rawDatabaseUrl,
    resolvedDatabaseUrl,
    rawDirectUrl,
    resolvedDirectUrl,
    supabaseUrl,
    supabasePublishableKey,
    githubAppId,
    githubClientId,
    githubClientSecret,
    githubPrivateKey,
    githubCallbackUrl,
    githubAppSlug,
    sessionSecret,
    encryptionSecret,
    aiProvider,
    ollamaBaseUrl,
    ollamaModel,
    ollamaContextLength,
    ollamaTimeoutMs,
  };
}

export const config = loadConfig();

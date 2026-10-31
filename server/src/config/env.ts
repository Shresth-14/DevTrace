import dotenv from "dotenv";

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

  // OpenRouter AI Inference Configuration
  openrouterApiKey?: string;
  openrouterModel: string;
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
  const githubPrivateKey = formatPrivateKey(process.env.GITHUB_PRIVATE_KEY);
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

  // OpenRouter AI Inference
  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || undefined;
  const openrouterModel =
    process.env.OPENROUTER_MODEL?.trim() ||
    "nvidia/nemotron-3-ultra-550b-a55b:free";

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
    openrouterApiKey,
    openrouterModel,
  };
}

export const config = loadConfig();

// Import this FIRST in every test file. ES modules evaluate imports in order, so these
// values are set before config/env.ts is loaded. dotenv never overrides variables that are
// already set, so tests behave the same on CI (no .env) and locally (with a real .env).
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_APP_SLUG = "dev-trace2607";
process.env.GITHUB_CALLBACK_URL = "http://localhost:5001/api/github/callback";
process.env.SESSION_SECRET = "test-session-secret-for-unit-tests-only";
process.env.ENCRYPTION_SECRET = "test-aes-token-encryption-secret-32-chars-min";
process.env.OPENROUTER_API_KEY = "";
process.env.OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

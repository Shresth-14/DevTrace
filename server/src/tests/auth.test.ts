import "./setup-env";
import assert from "assert";
import {
  encrypt,
  decrypt,
  generateOAuthState,
  verifyOAuthState,
} from "../utils/crypto";
import { signSessionToken, verifySessionToken } from "../utils/jwt";
import { githubAuthService } from "../modules/github/github.auth.service";

async function runTests() {
  console.log("=========================================");
  console.log("Dev Trace - GitHub Auth & Security Tests");
  console.log("=========================================");

  // 1. AES-256-GCM Encryption / Decryption
  console.log("\n[Test 1] Token AES-256-GCM Encryption & Decryption");
  const sampleToken = "ghu_16CharSampleGitHubUserAccessTokenForTesting123";
  const encrypted = encrypt(sampleToken);
  assert.notStrictEqual(
    encrypted,
    sampleToken,
    "Ciphertext must not match plaintext"
  );
  assert.strictEqual(
    encrypted.split(":").length,
    3,
    "Encrypted format must be iv:tag:ciphertext"
  );

  const decrypted = decrypt(encrypted);
  assert.strictEqual(
    decrypted,
    sampleToken,
    "Decrypted token must exactly match original"
  );
  console.log("✓ Encryption and decryption roundtrip verified.");

  // Tamper resistance test
  let tamperedCaught = false;
  try {
    const parts = encrypted.split(":");
    // Flip one character in ciphertext
    const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;
    decrypt(tampered);
  } catch {
    tamperedCaught = true;
  }
  assert.strictEqual(
    tamperedCaught,
    true,
    "Tampered ciphertext must fail authentication tag check"
  );
  console.log("✓ AES-GCM authentication tag tamper detection verified.");

  // 2. OAuth State Generation & CSRF Validation
  console.log("\n[Test 2] OAuth CSRF State Token Generation & Verification");
  const directState = generateOAuthState({ custom: "data" });
  const verifiedDirect = verifyOAuthState(directState);
  assert.strictEqual(verifiedDirect.valid, true);

  const stateResult = githubAuthService.getAuthorizationUrl("/import");
  assert.ok(
    stateResult.url.includes("https://github.com/login/oauth/authorize")
  );
  assert.ok(stateResult.url.includes("client_id=test-client-id"));
  assert.ok(stateResult.url.includes("redirect_uri="));
  assert.ok(stateResult.state.length > 20);

  const verifiedState = verifyOAuthState(stateResult.state);
  assert.strictEqual(verifiedState.valid, true, "State must be valid");
  assert.strictEqual(
    (verifiedState.data as { redirectPath: string })?.redirectPath,
    "/import"
  );
  console.log("✓ State generation and cryptographic signature verified.");

  // Invalid state test
  const invalidState = verifyOAuthState("invalid-tampered-state-token");
  assert.strictEqual(
    invalidState.valid,
    false,
    "Invalid state token must be rejected"
  );
  console.log("✓ Tampered/invalid state token correctly rejected.");

  // Expired state test (simulate 0 max age)
  const expiredState = verifyOAuthState(stateResult.state, -1000);
  assert.strictEqual(
    expiredState.valid,
    false,
    "Expired state token must be rejected"
  );
  console.log("✓ Expired state token correctly rejected.");

  // 3. JWT Session Tokens
  console.log("\n[Test 3] Session JWT Generation & Verification");
  const sessionToken = signSessionToken({
    userId: "user_test_cuid123",
    githubId: "12345678",
    githubUsername: "octocat",
    githubAvatarUrl: "https://github.com/images/error/octocat_happy.gif",
  });
  const decoded = verifySessionToken(sessionToken);
  assert.ok(decoded, "Decoded session must not be null");
  assert.strictEqual(decoded.userId, "user_test_cuid123");
  assert.strictEqual(decoded.githubUsername, "octocat");
  console.log("✓ Session token signed and verified.");

  // 4. Installation URL
  console.log("\n[Test 4] App Installation URL Generation");
  const installUrl = githubAuthService.getInstallationUrl(stateResult.state);
  assert.strictEqual(
    installUrl,
    `https://github.com/apps/dev-trace2607/installations/new?state=${encodeURIComponent(
      stateResult.state
    )}`
  );
  console.log("✓ Installation URL properly formatted for GitHub App slug.");

  console.log("\nAll security and auth tests PASSED successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

import { testDatabaseConnection, disconnectDatabase } from "./index";

async function main() {
  console.log("=========================================");
  console.log("Dev Trace - Supabase Database Test");
  console.log("=========================================");

  const result = await testDatabaseConnection();

  console.log(`Endpoint: ${result.maskedUrl}`);
  console.log(`Status:   ${result.success ? "SUCCESS" : "FAILED"}`);
  console.log(`Message:  ${result.message}`);

  if (result.error) {
    console.log(`Details:  ${result.error}`);
  }

  await disconnectDatabase();

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error during connection test:", err.message);
  process.exit(1);
});

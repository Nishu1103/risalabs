// Load .env.local / .env for CLI scripts (Next.js does this automatically for the app).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file not present */
  }
}

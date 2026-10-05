// Used by `npm run dev`: holds the website back until the API answers, so the first
// page you open doesn't fail with "fetch failed" while the API is still starting.

const url = process.env.API_HEALTH_URL ?? "http://localhost:4000/api/health";
const deadline = Date.now() + 120_000;

for (;;) {
  try {
    const res = await fetch(url);
    if (res.ok) break;
  } catch {
    // Not up yet.
  }
  if (Date.now() > deadline) {
    console.error(`The API didn't start at ${url}. Check the [api] lines above. Is the database running (npm run db)?`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.log("API is up, starting the website.");

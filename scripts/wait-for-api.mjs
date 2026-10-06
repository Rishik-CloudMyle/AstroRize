// Used by `npm run dev`: holds the website back until the API and its database answer,
// so the first page you open doesn't fail with "fetch failed" while things are starting.

const url = process.env.API_HEALTH_URL ?? "http://localhost:4000/api/health";
const started = Date.now();
const API_DEADLINE_MS = 120_000;
const DATABASE_DEADLINE_MS = 20_000;
let apiUpSince = 0;

for (;;) {
  let databaseDown = false;
  try {
    const res = await fetch(url);
    if (res.ok) break;
    databaseDown = res.status === 503;
  } catch {
    // API not up yet.
  }

  if (databaseDown) {
    apiUpSince ||= Date.now();
    if (Date.now() - apiUpSince > DATABASE_DEADLINE_MS) {
      console.error('The database isn\'t running. Run "npm run db", then "npm run dev" again.');
      process.exit(1);
    }
  } else if (Date.now() - started > API_DEADLINE_MS) {
    console.error(`The API didn't start at ${url}. Check the [api] lines above for the error.`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("API is up, starting the website.");

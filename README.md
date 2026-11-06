# AstroRize

Astrology consultation platform for AstroRize Private Limited, built by Cloudmyle.

| Folder | What it is | Runs on |
| --- | --- | --- |
| `frontend/` | Next.js website: public site, astrologer portal (`/portal`), admin console (`/admin`) | http://localhost:3000 |
| `backend/` | Node API (Express + Prisma + PostgreSQL), shared later with the mobile app | http://localhost:4000 |

The website forwards every `/api/*` request to the API, so the browser only talks to one address.
Sign-in is role-based: one login window, and the account decides where you land
(customers stay on the site, astrologers go to `/portal`, admins go to `/admin`).

## First-time setup

Needs Node.js 26.

```bash
npm run setup                          # installs root, backend and frontend packages
cp backend/.env.example backend/.env   # then set SESSION_SECRET to a long random string
cp frontend/.env.example frontend/.env.local   # SESSION_SECRET must match the backend's
npm run db                             # starts a local PostgreSQL (Prisma dev server)
npm run db:migrate                     # creates the tables
npm run db:seed                        # loads the demo data
```

`npm run db` prints the database URLs. If they differ from `backend/.env`, copy them in.

## Every day

```bash
npm run db     # if the local database isn't already running
npm run dev    # starts the API, the website and the media worker together
```

Locally, message videos are compressed **inside the API** (`MEDIA_WORKER=inline`, the default when
`NODE_ENV` isn't production), because the local `prisma dev` database accepts only one connection
and the API already holds it. FFmpeg still runs as its own process, so the API stays responsive.
The `media` process that `npm run dev` starts just says it is idle.

`npm run db:reset` wipes the local database and reloads the demo data.

## Checking the API

```bash
npm run db:seed          # the checks expect freshly seeded demo data
npm run dev              # in one terminal
npm test --prefix backend   # in another: ~260 end-to-end API checks
```

## Demo accounts (local only)

Password for every email account: `123456` (demo data only; the seed refuses to run in production)

| Who | Sign in with |
| --- | --- |
| Customer | `customer@astrorize.com`, or mobile `9876543210` + one-time code |
| Astrologer (Pt. Raghav Joshi) | `raghav.joshi@email.com` |
| Astrologer (Acharya Meera Iyer) | `meera.iyer@email.com` |
| Astrologer (Pandit Arjun Deshmukh) | `arjun.deshmukh@email.com` |
| Astrologer (Sneha Ramanathan) | `sneha.ramanathan@email.com` |
| Astrologer (Vikram Sethi) | `vikram.sethi@email.com` |
| Astrologer (Dr. Lalita Bose) | `lalita.bose@email.com` |
| Super Admin | `admin@astrorize.com` |
| Finance | `finance@astrorize.com` |
| Support | `support@astrorize.com` |
| Compliance | `compliance@astrorize.com` |
| Marketing | `marketing@astrorize.com` |
| More staff (same departments) | `neha.gupta@` (Finance), `priya.nair@` / `arun.das@` (Support), `vivek.rao@` (Compliance), `isha.malhotra@` (Marketing) — all `@astrorize.com`; `fatima.shaikh@` is deactivated |

In development there is no SMS provider yet, so the one-time code appears in the login window
("Development build — your code is …") and in the API's terminal (`[sms] sign-in code for +91 …`).
Any new mobile number creates a fresh customer account with an empty wallet.

Mobile sign-in codes, when testing:

- Use the code shown in the window (or the **latest** `[sms]` line for that number). A code works for
  5 minutes and only once; the last 3 codes sent to a number all work, so pressing "Resend" doesn't
  break the one you already have. There is no fixed demo code such as 123456.
- After 5 wrong tries, request a new code. The window says exactly what went wrong (wrong code with
  tries left, expired, already used, or no code sent yet).
- The very first visit to each page in `npm run dev` compiles it, which can take 10–30 seconds on a
  fresh clone. After a successful sign-in the page says "You're signed in" while the next page loads —
  wait for it rather than entering the code again (a used code is refused).
- Testing from a phone on the same Wi-Fi (e.g. `http://192.168.1.10:3000`): Next.js blocks its
  development scripts for any address other than `localhost`, so buttons don't respond. Add the
  computer's address to `allowedDevOrigins` in `frontend/next.config.ts`
  (e.g. `allowedDevOrigins: ["192.168.1.10"]`) and restart `npm run dev`.

## Production

- **Database:** a managed PostgreSQL. Set `DATABASE_URL` (and `DATABASE_POOL_MAX`, e.g. 10) on the API.
  On each release, apply the migrations and then the reference data:

  ```bash
  npm run db:deploy --prefix backend      # applies migrations
  npm run db:bootstrap --prefix backend   # adds missing reference data (safe to run every time)
  ```

  `db:bootstrap` adds whatever is missing of the Config console keys, recharge amounts, gift
  catalogue and app settings — it never changes values an admin has edited and never adds demo
  data. On the **first deploy** it also creates the first Super Admin from
  `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (10+ characters with a letter and a number)
  and `BOOTSTRAP_ADMIN_NAME`; once a Super Admin exists these are ignored. Sign in, change that
  password, create the rest of the team on the Team page, and remove the variables.
  Never run the seed in production (it refuses to).
- **API:** `npm start --prefix backend` (Node runs the TypeScript directly; there's no build step).
  Set `NODE_ENV=production`, `SESSION_SECRET` and `FRONTEND_ORIGIN`.
- **Website:** `npm run build --prefix frontend` then `npm start --prefix frontend`.
  Set `BACKEND_URL` to the API's address and the same `SESSION_SECRET`.
- **Media worker** (compresses videos sent in messages): `npm run worker --prefix backend`, as its
  own process next to the API (several can run, on one or more machines). Set `MEDIA_WORKER=external`
  on the API and the worker (the production default), the same `DATABASE_URL` (+ `DATABASE_POOL_MAX`,
  e.g. 2) and `SESSION_SECRET`. Optional: `MEDIA_WORKER_CONCURRENCY` (videos at a time per worker,
  default 1), `MEDIA_TRANSCODE_TIMEOUT_SECONDS` (default 300), `FFMPEG_PATH` (default: the bundled
  ffmpeg-static binary). Without a running worker, videos stay "Processing video…".
  How it works: the API stores the upload and queues a `MediaJob`; a worker claims it, runs FFmpeg
  (H.264 CRF 28, max 720p / 30 fps, AAC 96 kbps, faststart, plus a poster frame), swaps the message
  to the compressed file and deletes the original. Up to 3 tries with back-off; a job whose worker
  died is picked up again after 10 minutes. The queue (`MediaQueue`, lib/media-jobs.ts) and file
  storage (`Storage`, lib/storage.ts) are interfaces so they can move to BullMQ/Redis and S3.
  Photos are compressed in the browser before upload (WebP, ≤1600 px) and checked again on the
  server with sharp.

Not connected yet: SMS provider for one-time codes, Razorpay checkout for recharges, RazorpayX
for payouts, and live audio/video. Until they are, a production API (`NODE_ENV=production`)
refuses mobile sign-in and wallet recharges with a "not available yet" message, so no
sign-in codes are logged and no wallet can be credited without a real payment.
Email sign-in works for existing accounts.

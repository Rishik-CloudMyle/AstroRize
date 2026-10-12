# Astrorize

Astrology consultation platform for Astrorize Private Limited, built by Cloudmyle.

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
npm run dev    # starts the API and the website together
```

`npm run db:reset` wipes the local database and reloads the demo data.

## Checking the API

```bash
npm run db:seed          # the checks expect freshly seeded demo data
npm run dev              # in one terminal
npm test --prefix backend   # in another: ~70 end-to-end API checks
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

In development there is no SMS provider yet, so the one-time code appears in the login window
and in the API's terminal. Any new mobile number creates a fresh customer account with an empty wallet.

## Production

- **Database:** a managed PostgreSQL. Set `DATABASE_URL` (and `DATABASE_POOL_MAX`, e.g. 10) on the API.
  Run `npm run db:deploy --prefix backend` on each release to apply migrations. Never run the seed in production.
- **API:** `npm start --prefix backend` (Node runs the TypeScript directly; there's no build step).
  Set `NODE_ENV=production`, `SESSION_SECRET` and `FRONTEND_ORIGIN`.
- **Website:** `npm run build --prefix frontend` then `npm start --prefix frontend`.
  Set `BACKEND_URL` to the API's address and the same `SESSION_SECRET`.

Not connected yet: SMS provider for one-time codes, Razorpay checkout for recharges, RazorpayX
for payouts, and live audio/video. Until they are, a production API (`NODE_ENV=production`)
refuses mobile sign-in and wallet recharges with a "not available yet" message, so no
sign-in codes are logged and no wallet can be credited without a real payment.
Email sign-in works for existing accounts.

// Production bootstrap: puts in the reference data the app needs to run, on an empty database or an
// existing one. Safe to run on every deploy — it only ADDS what is missing and never touches demo
// data, people's accounts or anything an admin has changed. Run it after the migrations:
//
//   npm run db:deploy --prefix backend
//   npm run db:bootstrap --prefix backend
//
// The first Super Admin comes from environment variables, and only while there is no active
// Super Admin yet (it never changes an existing account or password):
//   BOOTSTRAP_ADMIN_EMAIL     sign-in email
//   BOOTSTRAP_ADMIN_PASSWORD  at least 10 characters with a letter and a number
//   BOOTSTRAP_ADMIN_NAME      full name, e.g. "Kunal Prasad" (optional, default "Super Admin")
// Sign in once and change that password; remove the variables from the environment afterwards.

import { db } from "../src/db.ts";
import { shortId } from "../src/lib/format.ts";
import { hashPassword } from "../src/lib/password.ts";
import type { Prisma } from "../src/generated/prisma/client.ts";
import { CONFIG_KEYS, DENOMINATIONS, GIFTS, REFERENCE_SETTINGS } from "./reference-data.ts";

const log = (line: string) => console.log(`  ${line}`);

/** The first Super Admin, from BOOTSTRAP_ADMIN_* — only when there is no active Super Admin. */
async function firstSuperAdmin() {
  const existing = await db.user.count({ where: { role: "ADMIN", adminRole: "SUPER", active: true, deletedAt: null } });
  if (existing) {
    log(`Super Admin: ${existing} already set up — left as is.`);
    return;
  }
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "").trim().replace(/\s+/g, " ") || "Super Admin";
  if (!email || !password) {
    throw new Error("There is no Super Admin yet. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (and BOOTSTRAP_ADMIN_NAME), then run this again.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is not a valid email address.");
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD needs 10–128 characters with at least one letter and one number.");
  }
  if (name.length > 60) throw new Error("BOOTSTRAP_ADMIN_NAME must be under 60 characters.");
  if (await db.user.findUnique({ where: { email } })) {
    throw new Error(`${email} is already used by another account. Choose a different BOOTSTRAP_ADMIN_EMAIL.`);
  }
  // Same derivations as accounts created on the Team page.
  const words = name.split(" ");
  const initials = (words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : name.slice(0, 2)).toUpperCase();
  const actorName = words.length > 1 ? `${words[0]![0]!.toUpperCase()}. ${words.at(-1)}` : name;
  const user = await db.user.create({
    data: { role: "ADMIN", adminRole: "SUPER", name, initials, actorName, email, passwordHash: await hashPassword(password) },
  });
  await db.auditLog.create({
    data: { actorName: "System", action: "staff.create", object: `staff:${email}`, diff: "— → Super Admin · Active (bootstrap)", correlation: shortId() },
  });
  log(`Super Admin: created ${name} <${email}> (id ${user.id}). Sign in and change the password.`);
}

/**
 * Config console keys: missing keys are added with their default value. Existing keys keep their
 * value and version (admins change those through the console); only the code-owned description,
 * bounds, impact text, domain, scope, flag and order are refreshed.
 */
async function configKeys() {
  const existing = new Set((await db.configKey.findMany({ select: { key: true } })).map((k) => k.key));
  let added = 0;
  for (const [rank, [key, flagged, description, value, scope, bounds, dryRun, domain]] of CONFIG_KEYS.entries()) {
    if (existing.has(key)) {
      await db.configKey.update({ where: { key }, data: { flagged, description, scope, bounds, dryRun, domain, rank } });
    } else {
      await db.configKey.create({ data: { key, flagged, description, value, scope, bounds, dryRun, domain, rank } });
      added++;
    }
  }
  log(`Config keys: ${added} added, ${CONFIG_KEYS.length - added} already there (values kept).`);
}

/** Recharge amounts: missing amounts are added; existing ones keep their bonus and on/off state. */
async function denominations() {
  const { count } = await db.denomination.createMany({ data: DENOMINATIONS, skipDuplicates: true });
  log(`Recharge amounts: ${count} added, ${DENOMINATIONS.length - count} already there (left as is).`);
}

/** Gift catalogue: only filled in when it is empty (Marketing manages it from then on). */
async function gifts() {
  if (await db.gift.count()) {
    log("Gift catalogue: already set up — left as is.");
    return;
  }
  await db.gift.createMany({ data: GIFTS.map((g, rank) => ({ ...g, rank })) });
  log(`Gift catalogue: ${GIFTS.length} gifts added.`);
}

/** Settings: missing ones get their starting value; existing ones are never changed. */
async function settings() {
  const entries = Object.entries(REFERENCE_SETTINGS);
  const { count } = await db.setting.createMany({
    data: entries.map(([key, value]) => ({ key, value: value as Prisma.InputJsonValue })),
    skipDuplicates: true,
  });
  log(`Settings: ${count} added, ${entries.length - count} already there (left as is).`);
}

async function main() {
  console.log("Bootstrapping AstroRize reference data…");
  await configKeys();
  await denominations();
  await gifts();
  await settings();
  await firstSuperAdmin();
  console.log("Done.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e: unknown) => {
    console.error(`Bootstrap failed: ${e instanceof Error ? e.message : String(e)}`);
    await db.$disconnect();
    process.exit(1);
  });

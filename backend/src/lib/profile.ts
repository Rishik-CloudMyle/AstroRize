import type { User } from "../generated/prisma/client.ts";
import { istDate, istDateKey } from "./format.ts";

// A customer's own profile ("A little about you" + "Birth details" in the app).
// Only the customer and an astrologer whose live queue they joined ever see it.

export const GENDERS = ["Woman", "Man", "Other", "Prefer not to say"] as const;

/** "YYYY-MM-DD" of a @db.Date column (stored at UTC midnight). */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole years from a date of birth to today (India time). */
export function ageOn(birthDate: Date, todayKey = istDateKey(new Date())): number {
  const [by, bm, bd] = dateKey(birthDate).split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = todayKey.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function initialsOf(...names: (string | null | undefined)[]): string {
  return (
    names
      .flatMap((n) => (n ?? "").split(/\s+/))
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "A"
  );
}

/** What the customer sees and edits on Wallet & account. */
export function ownProfileView(u: User) {
  return {
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.email ?? "",
    gender: u.gender,
    birthDate: u.birthDate ? dateKey(u.birthDate) : null,
    birthTime: u.birthTime,
    birthPlace: u.birthPlace ?? "",
    city: u.city ?? "",
    state: u.state ?? "",
    photoUrl: u.photoUrl,
    initials: u.initials,
    // Signing in with email + password needs the email, unless a mobile number is also on the account.
    emailRequired: !!u.passwordHash && !u.phone,
  };
}

type ProfileFields = Pick<
  User,
  "name" | "initials" | "firstName" | "lastName" | "gender" | "birthDate" | "birthTime" | "birthPlace" | "city" | "state" | "photoUrl"
>;

function displayName(u: ProfileFields): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name;
}

/** One row of the astrologer's "People in your queue" list. */
export function queueSummary(u: ProfileFields) {
  return {
    name: displayName(u),
    initials: u.initials,
    photoUrl: u.photoUrl,
    age: u.birthDate ? ageOn(u.birthDate) : null,
  };
}

/** One row of the astrologer's "Incoming" consultation requests. */
export function consultSummary(u: ProfileFields) {
  return { ...queueSummary(u), gender: u.gender, city: u.city };
}

/** Everything the astrologer sees in "See more". Empty values are null ("Not shared"). */
export function queueProfile(u: ProfileFields) {
  return {
    ...queueSummary(u),
    firstName: u.firstName,
    lastName: u.lastName,
    gender: u.gender,
    birthDate: u.birthDate ? istDate(u.birthDate) : null,
    birthTime: u.birthTime,
    birthPlace: u.birthPlace,
    city: u.city,
    state: u.state,
  };
}

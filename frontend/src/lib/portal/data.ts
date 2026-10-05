import { apiGet } from "@/lib/api/server";
import type {
  Account,
  ApplicationDraft,
  Availability,
  Compliance,
  Consultations,
  Dashboard,
  Earnings,
  LiveRoom,
  ProfileData,
  Thread,
} from "./types";

// Portal data for server components, from the Node API (GET /api/portal/*).
// Each call forwards the astrologer's session cookie and is never cached.

export async function getAccount(): Promise<Account> {
  return (await apiGet<{ account: Account }>("/portal/account")).account;
}

export async function getDashboard(): Promise<Dashboard> {
  return (await apiGet<{ dashboard: Dashboard }>("/portal/dashboard")).dashboard;
}

export async function getApplication(): Promise<ApplicationDraft> {
  return (await apiGet<{ application: ApplicationDraft }>("/portal/application")).application;
}

export async function getAvailability(): Promise<Availability> {
  return (await apiGet<{ availability: Availability }>("/portal/availability")).availability;
}

export async function getConsultations(): Promise<Consultations> {
  return (await apiGet<{ consultations: Consultations }>("/portal/consultations")).consultations;
}

export async function getLiveRoom(): Promise<LiveRoom | null> {
  return (await apiGet<{ room: LiveRoom | null }>("/portal/live")).room;
}

export async function getThreads(): Promise<Thread[]> {
  return (await apiGet<{ threads: Thread[] }>("/portal/messages")).threads;
}

/** `period` 0 = current half-month, 1 and 2 = the two before it. */
export async function getEarnings(period = 0): Promise<Earnings> {
  return (await apiGet<{ earnings: Earnings }>(`/portal/earnings?period=${period}`)).earnings;
}

export async function getProfileData(): Promise<ProfileData> {
  return (await apiGet<{ profile: ProfileData }>("/portal/profile")).profile;
}

export async function getCompliance(): Promise<Compliance> {
  return (await apiGet<{ compliance: Compliance }>("/portal/compliance")).compliance;
}

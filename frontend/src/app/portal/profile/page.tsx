import type { Metadata } from "next";
import ProfileView from "@/components/portal/views/profile-view";
import { getProfileData } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const data = await getProfileData();
  return <ProfileView data={data} />;
}

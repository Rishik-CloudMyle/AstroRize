import type { Metadata } from "next";
import LiveView from "@/components/portal/views/live-view";
import { getLiveRoom } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage() {
  const data = await getLiveRoom();
  return <LiveView data={data} />;
}

import type { Metadata } from "next";
import AvailabilityView from "@/components/portal/views/availability-view";
import { getAvailability } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const data = await getAvailability();
  return <AvailabilityView data={data} />;
}

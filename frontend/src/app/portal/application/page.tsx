import type { Metadata } from "next";
import ApplicationView from "@/components/portal/views/application-view";
import { getApplication } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage() {
  const data = await getApplication();
  return <ApplicationView data={data} />;
}

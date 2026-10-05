import type { Metadata } from "next";
import MessagesView from "@/components/portal/views/messages-view";
import { getThreads } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const threads = await getThreads();
  return <MessagesView threads={threads} />;
}

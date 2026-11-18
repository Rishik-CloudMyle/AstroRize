import AccessDenied from "@/components/admin/access-denied";
import RetentionForm from "@/components/admin/recording/retention-form";
import { allowed } from "@/lib/admin/guard";
import { getRecording } from "@/lib/admin/api";

export const metadata = { title: "Recording · Retention" };

export default async function RetentionPage() {
  if (!(await allowed("recording"))) return <AccessDenied />;
  const data = await getRecording();
  return <RetentionForm retention={data.retention} lastPurge={data.lastPurge} />;
}

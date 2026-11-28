import AccessDenied from "@/components/admin/access-denied";
import CallRecordings from "@/components/admin/recording/call-recordings";
import { allowed } from "@/lib/admin/guard";
import { getRecording } from "@/lib/admin/api";

export const metadata = { title: "Recording · Calls" };

export default async function CallRecordingsPage() {
  if (!(await allowed("recording"))) return <AccessDenied />;
  const data = await getRecording();
  return data.calls?.canListen ? (
    <CallRecordings />
  ) : (
    <p className="mt-4 text-[13px] text-[#78716c]">You don&apos;t have access to call recordings. A Super Admin can give it to Support or Compliance under Recording → What is recorded.</p>
  );
}

import AccessDenied from "@/components/admin/access-denied";
import LifecycleView from "@/components/admin/lifecycle/lifecycle-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getLifecycle } from "@/lib/admin/api";

export const metadata = { title: "Astrologer lifecycle" };

export default async function LifecyclePage({ searchParams }: PageProps<"/admin/lifecycle">) {
  if (!(await allowed("hr"))) return <AccessDenied />;
  const [data, sp] = await Promise.all([getLifecycle(), searchParams]);
  const app = typeof sp.app === "string" ? sp.app : undefined;

  return (
    <div>
      <PageTitle
        title="Astrologer lifecycle"
        sub="Application → interview → negotiation → pricing → training. Every action is checked against the latest version of the record."
      />
      <LifecycleView key={app ?? "all"} data={data} initialApp={app} />
    </div>
  );
}

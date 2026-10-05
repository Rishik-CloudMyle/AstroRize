import AccessDenied from "@/components/admin/access-denied";
import ConfigView from "@/components/admin/config/config-view";
import { PageTitle } from "@/components/admin/ui";
import { getConfig, getConfigDetail } from "@/lib/admin/api";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Config console" };

export default async function ConfigPage({ searchParams }: PageProps<"/admin/config">) {
  if (!(await allowed("config"))) return <AccessDenied />;
  const [data, sp] = await Promise.all([getConfig(), searchParams]);
  const asked = typeof sp.key === "string" ? sp.key : undefined;
  const key = data.keys.some((k) => k.key === asked) ? (asked as string) : data.keys[0]?.key;
  const detail = key ? await getConfigDetail(key) : null;

  return (
    <div>
      <PageTitle
        title="Config console"
        sub="Every operational setting lives here. Changes are drafted, approved by a second person and versioned. Scope: global → country → segment → object → user."
      />
      {/* Remount when the drill-down key changes so the selection follows the link. */}
      {key && <ConfigView key={asked ?? "all"} data={data} initialKey={key} initialDetail={detail} />}
    </div>
  );
}

import AccessDenied from "@/components/admin/access-denied";
import ConfigView from "@/components/admin/config/config-view";
import { PageTitle } from "@/components/admin/ui";
import { getConfig, getConfigDetail } from "@/lib/admin/api";
import { allowed } from "@/lib/admin/guard";
import { CONFIG_SORTS, pickSort, sortRows } from "@/lib/admin/sort";

export const metadata = { title: "Config console" };

export default async function ConfigPage({ searchParams }: PageProps<"/admin/config">) {
  if (!(await allowed("config"))) return <AccessDenied />;
  const [data, sp] = await Promise.all([getConfig(), searchParams]);
  const asked = typeof sp.key === "string" ? sp.key : undefined;
  const sort = pickSort(CONFIG_SORTS, sp.sort);
  const dept = typeof sp.dept === "string" ? sp.dept : undefined;
  // With no ?key=, open the first key in the chosen order (the top of the key browser),
  // within the ?dept= department when one is chosen.
  const sorted = sortRows(data.keys, CONFIG_SORTS, sort);
  const key = data.keys.some((k) => k.key === asked)
    ? (asked as string)
    : (sorted.find((k) => k.domain === dept) ?? sorted[0])?.key;
  const detail = key ? await getConfigDetail(key) : null;

  return (
    <div>
      <PageTitle
        title="Config console"
        sub="Every operational setting lives here. Changes are drafted, approved by a second person and versioned. Each setting has one platform-wide value."
      />
      {/* Remount when the drill-down key changes so the selection follows the link. */}
      {key && <ConfigView key={asked ?? "all"} data={data} initialKey={key} initialDetail={detail} />}
    </div>
  );
}

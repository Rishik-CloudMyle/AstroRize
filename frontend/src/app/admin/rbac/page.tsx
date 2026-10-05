import AccessDenied from "@/components/admin/access-denied";
import SodConflict from "@/components/admin/rbac/sod-conflict";
import { PageTitle, PANEL, TD, TH } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getRbac } from "@/lib/admin/api";

export const metadata = { title: "RBAC" };

export default async function RbacPage() {
  if (!(await allowed("rbac"))) return <AccessDenied />;
  const data = await getRbac();

  return (
    <div>
      <PageTitle
        title="RBAC administration"
        sub="Grant capabilities, not departments. A department has never implied a permission on this platform."
      />

      <div className={`${PANEL} mt-[18px] p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Capability grid</h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>Capability</th>
              {data.roles.map((r) => (
                <th key={r} className={`${TH} text-center`}>
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((c) => (
              <tr key={c.key}>
                <td className={`${TD} p-2.5 font-mono text-[11.5px] text-ink`}>{c.key}</td>
                {c.grants.map((g, i) => (
                  <td
                    key={i}
                    className={`${TD} p-2.5 text-center text-[14px] font-extrabold`}
                    style={{ color: g ? "#047857" : "#d6d3d1" }}
                    aria-label={g ? "Granted" : "Not granted"}
                  >
                    {g ? "✓" : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.conflict && <SodConflict conflict={data.conflict} />}
    </div>
  );
}

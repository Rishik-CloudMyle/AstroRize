import AdminProfileView from "@/components/admin/profile/profile-view";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "My profile" };

export default function AdminProfilePage() {
  return (
    <div>
      <PageTitle title="My profile" sub="Your details, your verified mobile number for confirmation codes, and your password." />
      <AdminProfileView />
    </div>
  );
}

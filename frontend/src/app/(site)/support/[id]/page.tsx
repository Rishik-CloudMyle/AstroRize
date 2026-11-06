import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import { IssueThread } from "@/components/support/support-views";

export const metadata: Metadata = {
  title: "Your issue",
  robots: { index: false },
};

export default async function IssuePage(props: PageProps<"/support/[id]">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <div className="lg:hidden">
        <AppTopbar title={`Issue ${id}`} backHref="/support" />
      </div>
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Help & support", href: "/support" }, { label: id }]} />
      </div>
      <div className="mx-auto max-w-[820px] max-lg:px-4 max-lg:pt-3">
        <IssueThread id={id} />
      </div>
    </div>
  );
}

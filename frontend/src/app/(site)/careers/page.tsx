import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import CareerForm from "@/components/careers/career-form";

export const metadata: Metadata = {
  title: "Careers",
  description: "Work with Astrorize. Astrologers, engineers and team members: send us your resume.",
};

export default function CareersPage() {
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-16 pt-8 lg:px-6 max-lg:pt-4">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Careers" }]} className="mb-2.5 max-lg:hidden" />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:text-[30px]">Careers</h1>
      <p className="mt-1.5 mb-5 text-sm text-stone-600">
        Astrologer, technical or any other role: tell us about yourself and attach your resume. Our HR team reads every application.
      </p>
      <CareerForm />
    </div>
  );
}

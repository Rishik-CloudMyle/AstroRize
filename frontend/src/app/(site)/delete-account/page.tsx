import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to request deletion of your AstroRize account and personal data, in the app or by email.",
};

const mailto = `mailto:support@astrorize.com?subject=${encodeURIComponent("Account deletion request")}&body=${encodeURIComponent(
  "Please delete my AstroRize account and associated personal data.\n\nRegistered mobile number: \nName: ",
)}`;

const card =
  "rounded-[18px] border border-line bg-paper p-5 sm:p-[22px] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:p-4! max-lg:shadow-app-card";
const body = "text-pretty text-sm leading-[1.65] text-stone-600 max-lg:text-[13.5px] max-lg:text-app-ink-2";

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto max-w-[820px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <AppTopbar title="Delete your account" className="lg:hidden" />
      <div className="max-lg:px-4 max-lg:pt-3">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Delete your account" }]} className="mb-3.5 max-lg:hidden" />
        <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:hidden">Delete your account</h1>
        <p className={`mt-3 ${body}`}>
          You can ask AstroRize to delete your account and associated personal data at any time, in the app or by email. What happens to your data
          afterwards, and what we may have to keep by law, is explained in our{" "}
          <Link href="/data-deletion-policy" className="font-semibold text-amber-800">
            Data Deletion Policy
          </Link>
          .
        </p>

        <div className="mt-5 grid gap-3.5 max-lg:mt-3.5 max-lg:gap-2">
          <section className={card} aria-labelledby="in-app">
            <h2 id="in-app" className="text-lg font-bold text-ink max-lg:text-[16px]">
              Option 1 — in the AstroRize app or website
            </h2>
            <ol className={`mt-2.5 list-decimal space-y-1.5 pl-5 ${body}`}>
              <li>Sign in with your registered mobile number.</li>
              <li>Open Wallet &amp; account.</li>
              <li>Scroll to the end of the page and choose “Delete my account”.</li>
              <li>Check what will happen to your account, then confirm with the six-digit code sent to your mobile number, or with your password.</li>
            </ol>
            <p className={`mt-2.5 ${body}`}>
              Deletion isn&apos;t available while a dispute is open or a legal hold applies, and you need to end any consultation in progress first.
              You can also choose “Deactivate account” instead, which only pauses your account.
            </p>
          </section>

          <section className={card} aria-labelledby="by-email">
            <h2 id="by-email" className="text-lg font-bold text-ink max-lg:text-[16px]">
              Option 2 — by email (if you can&apos;t sign in)
            </h2>
            <p className={`mt-2.5 ${body}`}>
              Write to{" "}
              <a href={mailto} className="font-semibold text-amber-800">
                support@astrorize.com
              </a>{" "}
              with the subject “Account deletion request”, and include the mobile number your account is registered with. We may verify your identity
              before acting on a request. We will respond within the time required by applicable law.
            </p>
            <a
              href={mailto}
              className="mt-3 inline-flex h-11 items-center rounded-full bg-amber-500 px-5 text-sm font-bold text-ink hover:bg-amber-400 hover:text-ink hover:no-underline"
            >
              Email a deletion request
            </a>
          </section>

          <section className={card} aria-labelledby="after">
            <h2 id="after" className="text-lg font-bold text-ink max-lg:text-[16px]">
              Before you delete
            </h2>
            <ul className={`mt-2.5 list-disc space-y-1.5 pl-5 ${body}`}>
              <li>Unused Bonus Credits lapse immediately; unused Recharge Credits are dealt with under the Wallet clause of our Terms and applicable law.</li>
              <li>Some records may be kept for as long as tax, accounting, audit, dispute or other legal obligations require.</li>
              <li>You may also withdraw consent, correct your data or nominate someone to exercise your rights — see the Privacy Policy.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/data-deletion-policy" className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:no-underline">
                Data Deletion Policy
              </Link>
              <Link href="/privacy" className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:no-underline">
                Privacy Policy
              </Link>
              <Link href="/terms#astrorize-wallet-and-service-credits" className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:no-underline">
                Wallet &amp; Service Credits
              </Link>
            </div>
          </section>

          <section className={card} aria-labelledby="contact">
            <h2 id="contact" className="text-lg font-bold text-ink max-lg:text-[16px]">
              Questions or a complaint?
            </h2>
            <p className={`mt-2.5 ${body}`}>
              Grievance Officer / DPO: Kunal Prasad, AstroRize Private Limited · support@astrorize.com · D-E-407, MPR Urban City, Patiganpur, Patencheru,
              Hyderabad, 502319. Acknowledgement within 48 hours of receipt. Unresolved data-protection complaints may be escalated to the Data
              Protection Board of India.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

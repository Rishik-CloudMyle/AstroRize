import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/breadcrumbs";
import PaymentResult, { type PaymentPageData } from "@/components/wallet/payment-result";
import { apiGet } from "@/lib/api/server";
import { ApiError } from "@/lib/api/errors";

export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false },
};

// One of the signed-in customer's wallet recharges, by its Razorpay order id. Read from our API on
// every request, so a reload (or a link from the wallet's transactions) shows its current state.
// Signed out: log in first, then back here. Anyone else's payment (or another role): not found.
export default async function PaymentPage(props: PageProps<"/wallet/payment/[orderId]">) {
  const { orderId } = await props.params;
  let data: PaymentPageData | null = null;
  let signIn = false;
  try {
    data = await apiGet<PaymentPageData>(`/wallet/payments/${encodeURIComponent(orderId)}`);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401) signIn = true;
    else if (e.status === 403 || e.status === 404 || e.status === 400) notFound();
    else throw e;
  }
  if (signIn || !data) redirect(`/login?next=${encodeURIComponent(`/wallet/payment/${orderId}`)}`);
  return (
    // Phones and tablets: the result draws its own app-look screen (title bar included), edge to edge.
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0!">
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wallet & account", href: "/wallet" }, { label: "Payment" }]} />
      </div>
      <PaymentResult data={data} />
    </div>
  );
}

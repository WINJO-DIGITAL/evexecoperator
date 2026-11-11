import { CheckCircle2 } from "lucide-react";
import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";

export const metadata = {
  title: `Payment complete | ${DEPLOYMENT_BRAND.name}`,
};

export default async function PaymentCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const ref = (await searchParams)?.ref;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10">
        <CheckCircle2 className="h-9 w-9 text-emerald-400" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-white">Payment received</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Thank you — your payment for your {DEPLOYMENT_BRAND.name} airport transfer has been confirmed.
        {ref ? <> Your booking reference is <span className="font-medium text-slate-200">{ref}</span>.</> : null}
      </p>
      <p className="mt-8 text-xs text-slate-600">You can close this page.</p>
    </main>
  );
}

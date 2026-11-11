import { XCircle } from "lucide-react";
import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";

export const metadata = {
  title: `Payment cancelled | ${DEPLOYMENT_BRAND.name}`,
};

export default async function PaymentCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const ref = (await searchParams)?.ref;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-400/10">
        <XCircle className="h-9 w-9 text-slate-400" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-white">Payment cancelled</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        No payment was taken for your {DEPLOYMENT_BRAND.name} airport transfer
        {ref ? <> (ref <span className="font-medium text-slate-200">{ref}</span>)</> : null}.
        If you'd like to try again, please use the link we sent you or contact us.
      </p>
      <p className="mt-8 text-xs text-slate-600">You can close this page.</p>
    </main>
  );
}

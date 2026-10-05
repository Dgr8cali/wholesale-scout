"use client";

import Link from "next/link";
import { SuppliersPanel } from "@/components/pl/Suppliers";

/** Private label → Suppliers: every candidate's Alibaba supplier leads, scored, with a candidate filter. */
export default function SuppliersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Suppliers</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Supplier Scout: Alibaba listings you sent from the extension, each scored against its candidate&apos;s targets (Gate 6) so you only message the top few. Open a candidate for its RFQ. See <Link className="text-brand underline" href="/help/howto/pl-finding-suppliers">finding suppliers</Link>.
        </p>
      </div>
      <section className="panel p-4"><SuppliersPanel showCandidate /></section>
    </div>
  );
}

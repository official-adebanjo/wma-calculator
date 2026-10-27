import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProductCatalogue } from "@/components/product-catalogue";

export const metadata: Metadata = { title: "Investment calculators" };

export default function InvestmentsPage() {
  return (
    <>
      <PageHeader eyebrow="Calculators" title="Investment calculators" description="Gross return, withholding tax, net return and payout." />
      <ProductCatalogue category="INVESTMENT" />
    </>
  );
}

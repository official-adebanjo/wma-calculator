import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProductCatalogue } from "@/components/product-catalogue";

export const metadata: Metadata = { title: "Loan calculators" };

export default function LoansPage() {
  return (
    <>
      <PageHeader eyebrow="Calculators" title="Loan calculators" description="Interest, total repayable and installment schedules." />
      <ProductCatalogue category="LOAN" />
    </>
  );
}

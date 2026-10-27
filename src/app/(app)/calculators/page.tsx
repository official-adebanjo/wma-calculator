import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProductCatalogue } from "@/components/product-catalogue";

export const metadata: Metadata = { title: "Calculators" };

export default function CalculatorsPage() {
  return (
    <>
      <PageHeader
        title="Calculators"
        description="Products with approved rules calculate. Products without approved rates show Validation only or Blocked and never return a projection."
      />
      <ProductCatalogue />
    </>
  );
}

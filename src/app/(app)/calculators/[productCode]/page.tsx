import { Suspense } from "react";
import { CalculatorScreen } from "./calculator-screen";

export default async function ProductCalculatorPage({ params }: { params: Promise<{ productCode: string }> }) {
  const { productCode } = await params;
  return (
    <Suspense>
      <CalculatorScreen productCode={productCode.toUpperCase()} />
    </Suspense>
  );
}

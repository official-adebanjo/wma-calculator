import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareScreen } from "./compare-screen";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <Suspense>
      <CompareScreen />
    </Suspense>
  );
}

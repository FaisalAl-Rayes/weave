import { Suspense } from "react";
import { PulsePage } from "@/components/pulse/pulse-page";

export default function PulseRoute() {
  return (
    <Suspense>
      <PulsePage />
    </Suspense>
  );
}

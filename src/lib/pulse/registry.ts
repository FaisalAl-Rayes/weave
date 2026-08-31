import type { Flow } from "./types";
import {
  buildHealthFlow,
  testHealthFlow,
  releaseHealthFlow,
  releasesFlow,
  buildPerformanceFlow,
  testPerformanceFlow,
  releasePerformanceFlow,
  failureAnalysisFlow,
} from "./flows";

// Order determines display order in the UI.
// Adding a new flow: create the flow module, export from flows/index.ts, add here.
export const FLOWS: Flow[] = [
  buildHealthFlow,
  testHealthFlow,
  releaseHealthFlow,
  releasesFlow,
  buildPerformanceFlow,
  testPerformanceFlow,
  releasePerformanceFlow,
  failureAnalysisFlow,
];

import type { Metadata } from "next";
import { RequestWorkspace } from "./RequestWorkspace";

export const metadata: Metadata = {
  title: "Start a request | Claw Services",
  description: "Turn a rough ask into a clear, reviewable Claw Services operator brief.",
};

export default function RequestPage() {
  return <RequestWorkspace />;
}

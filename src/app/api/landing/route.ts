import { NextResponse } from "next/server";
import {
  LANDING_REVALIDATE_SECONDS,
  LANDING_STALE_WHILE_REVALIDATE_SECONDS,
  landingContent,
} from "@/lib/landing-content";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(landingContent, {
    headers: {
      // This endpoint only serves public landing-page catalog data. Edge and
      // browser caches may reuse it for instant repeat navigations while Next
      // safely revalidates on the configured interval.
      "Cache-Control": `public, max-age=300, s-maxage=${LANDING_REVALIDATE_SECONDS}, stale-while-revalidate=${LANDING_STALE_WHILE_REVALIDATE_SECONDS}`,
    },
  });
}

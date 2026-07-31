import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Claw Services CRM Control Room";
const description =
  "A private, utility-first CRM prototype for pipeline, KPI, delivery, and evidence tracking with a safe Demo Copilot.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = (forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000")
    .split(",")[0]
    .trim();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0].trim() ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title,
    description,
    applicationName: title,
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Claw Services",
      title,
      description,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Claw Services CRM Control Room — Pipeline, KPIs, and Demo Copilot",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f3f0ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

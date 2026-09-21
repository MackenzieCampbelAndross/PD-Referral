import type { Metadata } from "next";
import "@/styles.css";
import { Providers } from "./Providers";

export const metadata: Metadata = {
  title: "Purple Drive Referral — Turn introductions into hires",
  description:
    "A private referral workspace for sharing roles, collecting resumes, and moving great candidates forward.",
  authors: [{ name: "Purple Drive" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Purple Drive Referral — Turn introductions into hires",
    description:
      "A private referral workspace for sharing roles, collecting resumes, and moving great candidates forward.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@Lovable",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

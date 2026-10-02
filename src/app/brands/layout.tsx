import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

/** The browser tab: "/brands" titled page · workspace · Wholesale Scout (the page itself is a client component). */
export const metadata: Metadata = { title: pageTitle("/brands", null) };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

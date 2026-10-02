import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

export const metadata: Metadata = { title: pageTitle("/ads/proposals/exports", "Bulk exports") };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

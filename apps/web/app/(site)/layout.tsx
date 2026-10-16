import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/brand";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

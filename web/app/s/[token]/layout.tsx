import type { ReactNode } from "react";

import { AppFrame } from "@/components/app/frame";
import { PublicHeader } from "@/components/app/public-header";

export default function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <PublicHeader />
      {children}
    </AppFrame>
  );
}

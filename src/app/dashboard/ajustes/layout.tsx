import type { ReactNode } from "react";

import { SettingsTabs } from "@/components/baul/settings/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}

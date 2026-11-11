"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Switch } from "@/components/ui/switch";
import { PageHeader } from "../page-header";
import { setPrivateAmounts, usePrivateAmounts } from "../privacy";
import { SettingsSection } from "./settings-section";

const THEMES = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hidden = usePrivateAmounts();

  return (
    <>
      <PageHeader title="Apariencia" />
      <div className="mt-9">
        <SettingsSection
          title="Tema"
          description="Se guarda en este dispositivo."
        >
          <div
            role="radiogroup"
            aria-label="Tema"
            className="grid grid-cols-3 gap-2"
          >
            {THEMES.map(({ value, label, icon: Icon }) => {
              const selected = mounted && (theme ?? "system") === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(value)}
                  className={`flex h-20 flex-col items-center justify-center gap-2 rounded-lg text-sm transition-colors ${selected ? "bg-foreground text-background" : "bg-background hover:bg-background/70"}`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </SettingsSection>
        <SettingsSection
          title="Privacidad"
          description="Igual que el asterisco de arriba: oculta los totales de las tarjetas."
        >
          <label className="flex items-center justify-between gap-4 text-sm">
            Ocultar importes
            <Switch checked={hidden} onCheckedChange={setPrivateAmounts} />
          </label>
        </SettingsSection>
      </div>
    </>
  );
}

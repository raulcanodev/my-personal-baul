"use client";

import { Asterisk, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { setPrivateAmounts, usePrivateAmounts } from "./privacy";

const buttonClass =
  "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted";

export function HeaderControls() {
  const hidden = usePrivateAmounts();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={hidden ? "Mostrar importes" : "Ocultar importes"}
        aria-pressed={hidden}
        title={hidden ? "Mostrar importes" : "Ocultar importes"}
        onClick={() => setPrivateAmounts(!hidden)}
        className={`${buttonClass} ${hidden ? "bg-foreground text-background hover:bg-foreground/90" : "text-muted-foreground"}`}
      >
        <Asterisk className="size-4" />
      </button>
      <button
        type="button"
        aria-label={dark ? "Modo claro" : "Modo oscuro"}
        title={dark ? "Modo claro" : "Modo oscuro"}
        onClick={() => setTheme(dark ? "light" : "dark")}
        className={`${buttonClass} text-muted-foreground`}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </div>
  );
}

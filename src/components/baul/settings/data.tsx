import { Download, FileJson, Sheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "../page-header";
import { SettingsSection } from "./settings-section";

export function DataSettings() {
  return (
    <>
      <PageHeader title="Exportar datos" />
      <div className="mt-9">
        <SettingsSection
          title="Tus datos son tuyos"
          description="Descárgalos cuando quieras. No incluye las API keys de los bancos ni datos de inicio de sesión."
          bare
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ExportCard
              icon={<Sheet className="size-5" />}
              title="Movimientos (CSV)"
              description="Una fila por movimiento, para abrir en Excel o Numbers."
              href="/api/export?format=csv"
            />
            <ExportCard
              icon={<FileJson className="size-5" />}
              title="Todo (JSON)"
              description="Cuentas, movimientos, categorías, suscripciones, deudas, objetivos, presupuestos y reglas."
              href="/api/export?format=json"
            />
          </div>
        </SettingsSection>
      </div>
    </>
  );
}

function ExportCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="bg-muted flex flex-col rounded-xl p-5">
      <span className="bg-background flex size-10 items-center justify-center rounded-lg">
        {icon}
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 flex-1 text-sm">{description}</p>
      <Button asChild variant="secondary" className="mt-5 self-start">
        <a href={href} download>
          <Download className="size-4" />
          Descargar
        </a>
      </Button>
    </div>
  );
}

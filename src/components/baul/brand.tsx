import { Box } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 text-lg font-medium tracking-tight">
      <Box className="size-5" strokeWidth={1.5} />
      baúl<span className="text-muted-foreground">/ personal</span>
    </span>
  );
}

import { financeTools } from "./finance";
import { planningTools } from "./planning";
import type { ToolDefinition } from "./types";

/**
 * Every tool exposed to agents. Add one here (or in a new domain file), deploy, and the next MCP
 * session has it: the endpoint is stateless and builds its tool list on every request.
 */
export const toolCatalog: ToolDefinition[] = [
  ...financeTools,
  ...planningTools,
];

export type { ToolContext, ToolDefinition, ToolRisk } from "./types";

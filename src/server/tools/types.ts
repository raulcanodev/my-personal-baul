import type { z } from "zod";

import type { FinanceContext } from "@/server/finance/context";

// read: nothing changes. write: creates or edits data. destructive: removes data.
// The MCP server turns it into annotations so the client can ask before acting.
export type ToolRisk = "read" | "write" | "destructive";

export type ToolContext = FinanceContext & {
  /** Encrypts/decrypts bank API keys (only bank sync needs it) */
  secret: () => string;
};

export type ToolDefinition<Input extends z.ZodObject = z.ZodObject> = {
  /** snake_case and stable: prompts and clients refer to it */
  name: string;
  title: string;
  /** Written for a language model: when to use it, what it needs, what it returns */
  description: string;
  risk: ToolRisk;
  input: Input;
  run: (input: z.infer<Input>, ctx: ToolContext) => Promise<unknown>;
};

export function defineTool<Input extends z.ZodObject>(
  tool: ToolDefinition<Input>,
) {
  return tool as unknown as ToolDefinition;
}

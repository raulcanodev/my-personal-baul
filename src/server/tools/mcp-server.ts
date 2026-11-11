import "server-only";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { createInsufficientScopeError } from "better-auth/oauth2";

import { toolCatalog, type ToolContext, type ToolRisk } from ".";

const ANNOTATIONS: Record<
  ToolRisk,
  { readOnlyHint: boolean; destructiveHint: boolean }
> = {
  read: { readOnlyHint: true, destructiveHint: false },
  write: { readOnlyHint: false, destructiveHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true },
};

/**
 * A fresh MCP server for one request, with every tool of the catalog. Stateless on purpose:
 * nothing to reconnect after a deploy, and it runs on the free Workers plan.
 */
export function createBaulMcpHandler(ctx: ToolContext, scopes: Set<string>) {
  return createMcpHandler(() => {
    // ajv compiles with `new Function`, which Workers forbid
    const server = new McpServer(
      { name: "baul", version: "1.0.0" },
      {
        jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
        instructions:
          "Baúl: finanzas personales de un usuario (cuentas de Wise/Mercury y manuales, movimientos, categorías y suscripciones separadas en personal y trabajo). Importes en unidades (12.5 = 12,50) con su moneda; los totales van en EUR y nunca cuentan transferencias entre cuentas propias.",
      },
    );
    for (const tool of toolCatalog) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          annotations: {
            title: tool.title,
            ...ANNOTATIONS[tool.risk],
            openWorldHint: false,
          },
        },
        async (input: unknown) => {
          if (tool.risk !== "read" && !scopes.has("baul:write")) {
            // The client asks the user to grant write access and retries
            throw createInsufficientScopeError(["baul:write"]);
          }
          try {
            const result = await tool.run(input as never, ctx);
            return {
              content: [
                { type: "text", text: JSON.stringify(result ?? { ok: true }) },
              ],
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
            };
          }
        },
      );
    }
    return server;
  });
}

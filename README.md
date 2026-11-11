# Baúl

Interfaz de una app personal en Next.js, React, Tailwind CSS y shadcn/ui. Sin landing: `/` redirige a `/login`.

## Desarrollo

```sh
pnpm install
cp .env.example .env            # BETTER_AUTH_SECRET (y el mismo en .dev.vars para `wrangler dev`)
pnpm db:migrate:local           # crea las tablas en la D1 local (.wrangler/)
pnpm user:create <usuario> <email>
pnpm dev
```

Puerto local de esta app: [localhost:43871](http://localhost:43871).

- `/login`: usuario y contraseña, visibilidad de contraseña, carga y errores. Usa el cliente de Better Auth con el plugin `username`.
- `/dashboard`: protegido por sesión (el nombre viene del usuario). El contenido sigue siendo de ejemplo. Resumen, movimientos, cuentas, objetivos, notas y ajustes. Permite crear movimientos, buscar, filtrar, exportar CSV y crear/eliminar notas. El estado se reinicia al recargar.

## Diseño

Adaptado del sistema local `brightlight-emdash`: Geist, los seis colores cálidos originales, paneles planos, títulos a dos tonos y radios suaves. Tokens en `src/styles/globals.css`. Catálogo completo instalado con `shadcn add --all` (63 componentes UI y sus utilidades).

## Autenticación pendiente de activar

Esta entrega prepara la UI. Better Auth tiene el plugin de usuario configurado tanto en servidor como cliente y los campos `username` y `displayUsername` en el esquema Drizzle. No se han ejecutado migraciones ni creado usuarios. Para usar acceso real hay que configurar PostgreSQL y el secreto de Better Auth, generar/revisar/aplicar las migraciones y aprovisionar el usuario. Antes de guardar datos reales, proteger las páginas y las API con comprobación de sesión y sustituir los datos de ejemplo por datos del usuario. El dashboard actual es una demo pública, no una zona privada.

## Comprobaciones

```sh
pnpm typecheck
pnpm build
```

Los componentes de registro shadcn conservan las reglas normales de ESLint; las reglas adicionales de tipos del starter T3 se aplican al código de la app, no al código generado del registro.

## Cloudflare (Workers + D1)

- Next corre en un Worker con `@opennextjs/cloudflare`; la base de datos es la D1 `baul` (binding `DB`, ver `wrangler.jsonc`).
- No hay registro desde la web (`disableSignUp`): los usuarios se crean con `pnpm user:create <usuario> <email> [--remote]`.
- Esquema en `src/server/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate:local` / `pnpm db:migrate:remote`.
- `pnpm preview` prueba el Worker en local; `pnpm run deploy` lo publica. Ojo: ambos hacen `next build` sobre `.next`, así que para el `pnpm dev` antes o reinícialo después.
- `worker.ts` envuelve el worker de OpenNext y añade el cron diario (05:00 UTC) que sincroniza Wise/Mercury (`src/server/finance/connections.ts`).
- Lógica de finanzas en `src/server/finance/` (servicios puros que usan tRPC y, más adelante, el MCP). Los adaptadores de Wise y Mercury están copiados tal cual de papra. Antes del primer deploy: `pnpm wrangler secret put BETTER_AUTH_SECRET`.

### Dominio

Producción: `https://baul.raulcano.dev` (custom domain del Worker; el DNS de raulcano.dev está en Cloudflare desde el 10/11/2026, con el portfolio y `games` en Vercel como CNAME en DNS only). `https://baul.rawraul.workers.dev` sigue activo como respaldo.

Registro: el primer usuario se registra libremente; después solo con `SIGNUP_CODE` (`pnpm wrangler secret put SIGNUP_CODE`), y sin código queda cerrado.

## MCP (agentes)

`https://baul.raulcano.dev/api/mcp`: MCP remoto y sin estado, con OAuth (Better Auth `@better-auth/mcp` + `jwt` + `cimd`).

- Las tools salen del catálogo `src/server/tools/` (finanzas en `finance.ts`), que llama a los mismos servicios que la app. Cada tool declara su riesgo: `read`, `write` (pide el scope `baul:write`) o `destructive`.
- Para añadir una tool: se escribe en el catálogo, se despliega, y la siguiente sesión del cliente ya la tiene. No hay que reconectar ni volver a iniciar sesión, porque los tokens se renuevan solos.
- Claude Code: `claude mcp add --transport http baul https://baul.raulcano.dev/api/mcp`, después `/mcp` → Authenticate. Abre `/login` y `/oauth/consent`.
- claude.ai: Ajustes → Conectores → Añadir conector personalizado → la misma URL.

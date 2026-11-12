// Creates a user directly in D1, since sign-up is disabled on the web.
//   pnpm user:create <username> <email> [--remote]
// The password is asked for (hidden), or read from BAUL_PASSWORD.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { hashPassword } from "better-auth/crypto";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const [username, email] = args.filter((a) => !a.startsWith("--"));

if (!username || !email) {
  console.error("Uso: pnpm user:create <usuario> <email> [--remote]");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.env.BAUL_PASSWORD ?? (await askHidden("Contraseña: "));
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const now = Date.now();
const userId = randomUUID();
const hash = await hashPassword(password);
const handle = username.toLowerCase();

const sql = [
  // The first user owns the baúl and is its admin
  `INSERT INTO user (id, name, email, email_verified, username, display_username, role, created_at, updated_at) VALUES (${q(userId)}, ${q(username)}, ${q(email.toLowerCase())}, 1, ${q(handle)}, ${q(username)}, CASE WHEN (SELECT count(*) FROM user) = 0 THEN 'admin' ELSE 'user' END, ${now}, ${now});`,
  `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${q(randomUUID())}, ${q(userId)}, 'credential', ${q(userId)}, ${q(hash)}, ${now}, ${now});`,
].join("\n");

execFileSync(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "baul", remote ? "--remote" : "--local", "--command", sql],
  { stdio: ["ignore", "ignore", "inherit"] },
);

console.log(`Usuario "${handle}" creado en D1 ${remote ? "remota" : "local"}.`);

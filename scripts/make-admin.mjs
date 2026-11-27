// Da (o quita) el rol superadmin a una cuenta ya registrada en el sitio.
//
//   npm run db:admin -- correo@ejemplo.com           -> la convierte en superadmin
//   npm run db:admin -- correo@ejemplo.com --pareja  -> la vuelve a pareja
//
// Lee SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF del entorno o de .env.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const email = (process.argv[2] || "").trim().toLowerCase();
const role = process.argv.includes("--pareja") ? "pareja" : "superadmin";
if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) {
  console.error("Uso: npm run db:admin -- correo@ejemplo.com [--pareja]");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF (en .env o en el entorno).");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `update public.profiles set role = '${role}' where email = '${email}' returning email, role;`,
  }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Supabase ${res.status}: ${text}`);
  process.exit(1);
}
const rows = JSON.parse(text);
if (!rows.length) {
  console.error(`No hay ninguna cuenta con el correo ${email}. Regístrala primero en el sitio.`);
  process.exit(1);
}
console.log(`${rows[0].email} ahora es ${rows[0].role}.`);

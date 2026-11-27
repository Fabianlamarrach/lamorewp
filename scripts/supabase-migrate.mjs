// Aplica en Supabase las migraciones de supabase/migrations/*.sql que aún no se han aplicado.
// Usa la Management API (no necesita la contraseña de la base de datos).
//
//   node scripts/supabase-migrate.mjs          -> aplica las pendientes
//   node scripts/supabase-migrate.mjs --new x  -> crea supabase/migrations/<fecha>_x.sql
//
// Lee SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF del entorno o de .env.
// Registra lo aplicado en supabase_migrations.schema_migrations (la misma tabla que usa la CLI de Supabase).

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");

// Cargar .env si existe (sin sobrescribir variables ya definidas).
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
if (args[0] === "--new") {
  const name = (args[1] || "cambio").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  const ts = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const file = join(dir, `${ts}_${name}.sql`);
  writeFileSync(file, `-- ${name}\n`);
  console.log("Creada", file);
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF (en .env o en el entorno).");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );`);

const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort() : [];
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

if (!pending.length) {
  console.log("Supabase: sin migraciones pendientes.");
  process.exit(0);
}

for (const f of pending) {
  const version = f.split("_")[0];
  const name = f.slice(version.length + 1, -4);
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`Aplicando ${f}... `);
  // Migración y registro en una sola transacción: o se aplica todo o nada.
  await query(`begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${lit(version)}, ${lit(name)}, array[${lit(sql)}]);\ncommit;`);
  console.log("OK");
}
console.log(`Supabase: ${pending.length} migración(es) aplicada(s).`);

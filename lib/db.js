import { neon } from "@neondatabase/serverless";
export const sql = neon(process.env.DATABASE_URL);
export async function kvGet(key) {
  const rows = await sql`select value from kv where key = ${key}`;
  return rows.length ? rows[0].value : null;
}
export async function kvSet(key, value) {
  await sql`insert into kv (key, value, updated_at) values (${key}, ${JSON.stringify(value)}::jsonb, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

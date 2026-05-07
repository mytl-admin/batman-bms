/**
 * Apply Phase 1 SQL to Supabase Postgres using a direct/session connection string.
 *
 * Usage: npm run db:apply
 * Requires DATABASE_URL in .env.dev (Supabase → Project Settings → Database → URI).
 * Use direct (port 5432) or session pooler — transaction pooler (6543) may reject DDL.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_FILE = path.join(__dirname, '../supabase/migrations/_RUN_ALL_IN_ORDER.sql');

/** Strip full-line SQL comments, then split on semicolon + newline/end. */
function splitStatements(sql) {
  const stripped = sql.replace(/^\s*--.*$/gm, '');
  return stripped
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'Missing DATABASE_URL. Add it to .env.dev (Database → Connection string → URI, with your DB password).',
    );
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('Migration file not found:', MIGRATION_FILE);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const stmts = splitStatements(sql);

  const client = new Client({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    for (let i = 0; i < stmts.length; i += 1) {
      const statement = `${stmts[i]};`;
      /* eslint-disable no-await-in-loop */
      await client.query(statement);
    }
    console.log(`Applied ${stmts.length} SQL statements from _RUN_ALL_IN_ORDER.sql`);
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

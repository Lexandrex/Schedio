require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  // Um client só: BEGIN, SQL, registro e COMMIT precisam ir na mesma sessão.
  const client = await pool.connect();

  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (applied.rowCount) continue;
      // A migration e o registro dela entram juntos ou não entram: se o processo
      // cair no meio, nada fica aplicado sem registro. Por isso uma migration não
      // pode ter BEGIN/COMMIT próprio nem CREATE INDEX CONCURRENTLY.
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha em ${file}: ${error.message}`);
      }
      console.log(`Aplicada: ${file}`);
    }
  } finally {
    client.release();
  }
}

migrate()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

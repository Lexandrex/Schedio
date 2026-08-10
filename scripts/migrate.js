require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (applied.rowCount) continue;
    await pool.query(fs.readFileSync(path.join(directory, file), 'utf8'));
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Aplicada: ${file}`);
  }
  await pool.end();
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

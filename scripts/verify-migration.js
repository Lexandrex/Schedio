require('dotenv').config();

const { pool } = require('../db');

async function verify() {
  const [tables, userColumns] = await Promise.all([
    pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' ORDER BY table_name"),
    pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position"),
  ]);
  console.log(JSON.stringify({ tables: tables.rows.map((row) => row.table_name), userColumns: userColumns.rows.map((row) => row.column_name) }));
  await pool.end();
}

verify().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
});

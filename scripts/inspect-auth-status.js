require('dotenv').config();

const { pool } = require('../db');

async function inspect() {
  const [userColumns, pendingColumns, users, pending, activeTokens] = await Promise.all([
    pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position"),
    pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pending_registrations' ORDER BY ordinal_position"),
    pool.query('SELECT COUNT(*)::int AS total FROM users'),
    pool.query('SELECT COUNT(*)::int AS total FROM pending_registrations'),
    pool.query('SELECT COUNT(*)::int AS active FROM pending_registrations WHERE verification_token_expires_at > NOW()'),
  ]);
  console.log(JSON.stringify({
    userColumns: userColumns.rows.map((row) => row.column_name),
    pendingColumns: pendingColumns.rows.map((row) => row.column_name),
    users: users.rows[0],
    pendingRegistrations: pending.rows[0],
    activeVerificationTokens: activeTokens.rows[0].active,
  }));
  await pool.end();
}

inspect().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
});

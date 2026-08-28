require('dotenv').config();

const { pool } = require('../db');

async function inspect() {
  const [columns, users, tokens] = await Promise.all([
    pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position"),
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE email_verified_at IS NULL)::int AS pending_verification FROM users'),
    pool.query('SELECT COUNT(*)::int AS active FROM users WHERE email_verification_token_expires_at > NOW() AND email_verified_at IS NULL'),
  ]);
  console.log(JSON.stringify({ columns: columns.rows.map((row) => row.column_name), users: users.rows[0], activeVerificationTokens: tokens.rows[0].active }));
  await pool.end();
}

inspect().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
});

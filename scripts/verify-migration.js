require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

// Compara os arquivos de db/migrations com o que está registrado em
// schema_migrations, então não precisa ser editado a cada migration nova.
// Sai com código 1 se houver migration pendente.
async function verify() {
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const expected = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();

  let applied = [];
  try {
    const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    applied = result.rows.map((row) => row.filename);
  } catch (error) {
    // 42P01 = a tabela não existe: nenhuma migration foi aplicada ainda.
    if (error.code !== '42P01') throw error;
  }

  const userColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position");

  const pendentes = expected.filter((file) => !applied.includes(file));
  const semArquivo = applied.filter((file) => !expected.includes(file));

  console.log(JSON.stringify({
    aplicadas: applied,
    pendentes,
    semArquivo,
    userColumns: userColumns.rows.map((row) => row.column_name),
  }, null, 2));

  if (pendentes.length) process.exitCode = 1;
}

verify()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

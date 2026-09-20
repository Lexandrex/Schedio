require('dotenv').config();

// Importação das bibliotecas de sistema de arquivos
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function verify() {
  // Leitura dinâmica da pasta de migrations em vez de tabelas hardcoded
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const expected = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();

  let applied = [];
  try {
    const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    applied = result.rows.map((row) => row.filename);
  } catch (error) {
    // Código 42P01 no Postgres significa "undefined_table" (a tabela não existe ainda)
    if (error.code !== '42P01') throw error;
  }

  // Comparação entre o que existe nos arquivos e o que está no banco
  const pendentes = expected.filter((file) => !applied.includes(file));
  const semArquivo = applied.filter((file) => !expected.includes(file));
  
  console.log(JSON.stringify({ aplicadas: applied, pendentes, semArquivo }, null, 2));
  
  // Falha a execução do processo se houver migrations faltando, útil para CI/CD
  if (pendentes.length) process.exitCode = 1;
}

verify()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  // Encerramento centralizado e garantido da conexão com o banco
  .finally(() => pool.end());

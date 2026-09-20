require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const directory = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  
  // Conectar um client específico para garantir que as transações ocorram na mesma sessão
  const client = await pool.connect();
  
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    
    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (applied.rowCount) continue;
      
      // Envolver a execução do SQL e o registro na tabela de controle dentro de uma transação
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha em ${file}: ${error.message}`);
      }
    }
  } finally {
    // Bloco finally garante o encerramento seguro do pool mesmo com falhas
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
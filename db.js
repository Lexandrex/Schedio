const { Pool } = require('pg');

const connectionConfig = process.env.DB_PASSWORD
  ? {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'Schedio',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    }
  : { connectionString: process.env.DATABASE_URL };

const pool = new Pool(connectionConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

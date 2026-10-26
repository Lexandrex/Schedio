/*
 * Expurgo manual das contas excluídas vencidas (ver contasExcluidas.js).
 * O servidor já faz isso na subida e uma vez por dia; este script serve para
 * rodar fora dele, como numa tarefa agendada do sistema.
 */
require('dotenv').config();
const { query, pool } = require('../db');
const storage = require('../storage');
const { expurgarContasVencidas } = require('../contasExcluidas');

(async () => {
  try {
    const { contas, arquivos } = await expurgarContasVencidas({ query, storage });
    console.log(`Contas vencidas apagadas: ${contas}. Arquivos apagados no Cloudinary: ${arquivos}.`);
  } catch (error) {
    console.error('Falha no expurgo:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

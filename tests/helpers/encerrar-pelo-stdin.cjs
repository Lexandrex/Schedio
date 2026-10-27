/*
 * Encerra o servidor de teste quando o processo pai fecha o stdin dele.
 *
 * `processo.kill()` não serve para isso: no Windows mata sem dar chance de
 * reação, e no Linux o SIGTERM padrão também derruba na hora. Nos dois casos o
 * V8 não grava a cobertura (`NODE_V8_COVERAGE`) e o `server.js` some do
 * relatório.
 *
 * `process.exit()` grava a cobertura antes de sair.
 */
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()

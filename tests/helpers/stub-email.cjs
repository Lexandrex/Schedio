/*
 * Substitui o nodemailer no processo do servidor de teste.
 *
 * Sem isso, o cadastro responde 503 ("serviço de e-mail não configurado") e
 * nenhum teste do fluxo de autenticação sai do lugar. Apontar o SMTP de
 * verdade não serve: mandaria e-mail real a cada execução.
 *
 * O código de verificação não vem daqui — os testes o definem direto no banco,
 * gravando um hash conhecido em `pending_registrations`.
 */
const Module = require('module')

const resolvido = require.resolve('nodemailer', { paths: [__dirname + '/../..'] })

const falso = {
  createTransport: () => ({
    verify: async () => true,
    sendMail: async () => ({ messageId: 'teste' }),
  }),
  getTestMessageUrl: () => null,
}

const modulo = new Module(resolvido)
modulo.exports = falso
modulo.loaded = true
require.cache[resolvido] = modulo

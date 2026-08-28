require('dotenv').config();

const user = process.env.SMTP_USER || '';
const password = process.env.SMTP_PASS || '';
const from = process.env.SMTP_FROM || '';

console.log(JSON.stringify({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  userDomain: user.includes('@') ? user.split('@').slice(1).join('@') : 'invalid',
  userHasWhitespace: /\s/.test(user),
  userHasBackslash: user.includes('\\'),
  passwordLength: password.length,
  passwordHasWhitespace: /\s/.test(password),
  passwordHasQuote: password.includes('"'),
  fromHasBackslash: from.includes('\\'),
  fromMatchesUser: from.includes(user),
}));

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };

http.createServer((request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url;
  const file = path.join(root, path.normalize(requested));
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
}).listen(4173, '127.0.0.1', () => console.log('Schedio Drasis em http://127.0.0.1:4173'));

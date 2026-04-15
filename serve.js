const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE = __dirname;

const mime = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.ico':'image/x-icon' };

http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Server running on port ${PORT}`));

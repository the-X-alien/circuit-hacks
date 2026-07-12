import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
const root = 'C:/Users/dave/AppData/Local/Temp/opencode/hackathon-site/dist';
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2', '.png':'image/png', '.ico':'image/x-icon' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = join(root, normalize(p));
    const buf = await readFile(fp);
    res.writeHead(200, { 'Content-Type': types[extname(fp)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(4321, '127.0.0.1', () => console.log('serving on 4321'));

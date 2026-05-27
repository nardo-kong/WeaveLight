import { createServer } from 'node:http';
import { handleRpcRequest, isJsonRpcRequest } from './rpc';

const port = Number(process.env.WEAVELIGHT_ENGINE_PORT ?? 3322);

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/rpc') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  if (!isJsonRpcRequest(payload)) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }));
    return;
  }

  const response = await handleRpcRequest(payload);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(response));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`WeaveLight engine sidecar listening on http://127.0.0.1:${port}\n`);
});

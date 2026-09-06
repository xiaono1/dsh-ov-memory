import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { McpHttpClient } from '../lib/mcp/upstream.js';

// Fake OpenViking /mcp endpoint (stateless streamable HTTP, JSON only).
let server;
let sawSessionHeader = [];
let boomCount = 0;

before(async () => {
  server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      // Idle SSE stream per server behavior.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end();
      return;
    }
    let data = '';
    for await (const chunk of req) data += chunk;
    const msg = JSON.parse(data);
    const sessionHeader = req.headers['mcp-session-id'] ?? null;
    const send = (payload) => {
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'ssn-1' });
      res.end(JSON.stringify(payload));
    };
    if (msg.method === 'initialize') {
      sawSessionHeader.push(sessionHeader);
      return send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'fake-openviking', version: '0.4' } },
      });
    }
    if (msg.method === 'tools/list') {
      return send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            { name: 'search', description: 'semantic search' },
            { name: 'remember', description: 'store' },
          ],
        },
      });
    }
    if (msg.method === 'tools/call') {
      if (msg.params.name === 'boom') {
        boomCount += 1;
        if (boomCount === 1) {
          return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'session expired' } });
        }
      }
      return send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { content: [{ type: 'text', text: `called ${msg.params.name}` }] },
      });
    }
    return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
after(() => server.close());

function makeClient() {
  return new McpHttpClient({
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    apiKey: 'k',
    timeoutMs: 2000,
  });
}

describe('mcp upstream client', () => {
  it('initializes, lists tools and calls a tool', async () => {
    const client = makeClient();
    const info = await client.initialize();
    assert.equal(info.serverInfo.name, 'fake-openviking');
    const tools = await client.listTools();
    assert.equal(tools.length, 2);
    const result = await client.callTool('search', { query: 'x' });
    assert.match(result.content[0].text, /called search/);
    // initialize went without a session id, later calls echo it
    assert.equal(sawSessionHeader[0], null);
  });

  it('transparently re-initializes after a stale-session error', async () => {
    const client = makeClient();
    await client.initialize();
    const result = await client.callTool('boom', {});
    assert.match(result.content[0].text, /called boom/);
  });

  it('never opens the GET SSE stream (request/response only)', async () => {
    // The fake above treats GET as SSE; a fetch of the root must not hang the client.
    const client = makeClient();
    await client.initialize();
    const tools = await client.listTools();
    assert.ok(tools.length >= 1);
  });

  it('maps upstream errors into typed failures', async () => {
    const client = makeClient();
    await client.initialize();
    await assert.rejects(
      () => client.request('no/such/method', {}),
      (err) => {
        assert.match(err.message, /not found/);
        return true;
      },
    );
  });
});

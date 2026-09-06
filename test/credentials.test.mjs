import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseConfigText,
  resolveCredentials,
  describeLayers,
} from '../lib/credentials.js';

describe('credentials parseConfigText', () => {
  it('parses key: value YAML-ish lines', () => {
    const f = parseConfigText('url: http://localhost:1933\napi_key: secret123\naccount: myacct\n');
    assert.deepEqual(f, { url: 'http://localhost:1933', apiKey: 'secret123', account: 'myacct' });
  });

  it('parses key = value lines and sections', () => {
    const f = parseConfigText('[server]\nhost = 127.0.0.1\nport = 1933\nroot_api_key = root1\n');
    assert.equal(f.url, 'http://127.0.0.1:1933');
    assert.equal(f.apiKey, 'root1');
  });

  it('parses JSON config', () => {
    const f = parseConfigText('{"url":"http://x:1","api_key":"k","user":"u"}');
    assert.equal(f.url, 'http://x:1');
    assert.equal(f.apiKey, 'k');
    assert.equal(f.user, 'u');
  });
});

describe('credentials resolveCredentials', () => {
  it('env beats cli file, cli beats ov.conf', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-creds-'));
    writeFileSync(join(dir, 'ovcli.conf'), 'url: http://cli:1\napi_key: cli-key\naccount: cli-acct\n');
    writeFileSync(join(dir, 'ov.conf'), 'url: http://ov:1\napi_key: ov-key\n');
    const res = resolveCredentials({
      cwd: dir,
      configDir: dir,
      env: {
        OPENVIKING_URL: 'http://env:9',
        OPENVIKING_API_KEY: 'env-key',
      },
    });
    assert.equal(res.fields.url, 'http://env:9');
    assert.equal(res.fields.apiKey, 'env-key');
    assert.equal(res.fields.account, 'cli-acct');
    assert.equal(res.mcpUrl, 'http://env:9/mcp');
    assert.equal(describeLayers(res), 'ov.conf → ovcli.conf → env');
  });

  it('uses only file layers when env is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-creds2-'));
    writeFileSync(join(dir, 'ov.conf'), 'url: http://ov:1\napi_key: ov-key\n');
    const res = resolveCredentials({ cwd: dir, configDir: dir, env: {} });
    assert.equal(res.fields.url, 'http://ov:1');
    assert.equal(res.fields.apiKey, 'ov-key');
    assert.equal(res.mcpUrl, 'http://ov:1/mcp');
  });

  it('falls back to defaults with no sources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-creds3-'));
    const res = resolveCredentials({ cwd: dir, configDir: dir, env: {} });
    assert.equal(res.fields.url, undefined);
    assert.equal(res.mcpUrl, null);
    assert.equal(describeLayers(res), 'none');
  });

  it('honours OPENVIKING_MCP_URL override', () => {
    const res = resolveCredentials({
      configDir: mkdtempSync(join(tmpdir(), 'ov-creds4-')),
      env: { OPENVIKING_URL: 'http://x:1', OPENVIKING_MCP_URL: 'http://gateway:99/mcp' },
    });
    assert.equal(res.mcpUrl, 'http://gateway:99/mcp');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { guardVikingUri, isOwnMcpTool } from '../lib/guard.js';

describe('guard guardVikingUri', () => {
  it('allows ordinary local tool calls', () => {
    assert.equal(guardVikingUri({ name: 'fs_read', arguments: { path: 'C:\\tmp\\a.txt' } }).kind, 'allow');
    assert.equal(guardVikingUri({ name: 'bash', arguments: { command: 'ls' } }).kind, 'allow');
    assert.equal(guardVikingUri({ name: 'random_tool', arguments: {} }).kind, 'allow');
  });

  it('denies built-in path tools aimed at viking URIs', () => {
    const d = guardVikingUri({ name: 'fs_read', arguments: { path: 'viking://~/memories/x' } });
    assert.equal(d.kind, 'deny');
    if (d.kind === 'deny') {
      assert.match(d.reason, /mcp__openviking__read/);
    }
  });

  it('denies shell tools that receive viking arguments', () => {
    const d = guardVikingUri({ name: 'bash', arguments: { command: 'cat viking://~/memories/x' } });
    assert.equal(d.kind, 'deny');
  });

  it('allows our own bridged MCP tools', () => {
    assert.equal(isOwnMcpTool('mcp__openviking__read'), true);
    assert.equal(guardVikingUri({ name: 'mcp__openviking__forget', arguments: { uri: 'viking://~/memories/x' } }).kind, 'allow');
  });
});

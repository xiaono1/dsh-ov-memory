import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVikingUri,
  parseVikingUri,
  classifyScope,
  findVikingUris,
  hasVikingTarget,
} from '../lib/uri.js';

describe('uri', () => {
  it('recognizes viking URIs', () => {
    assert.equal(isVikingUri('viking://~/memories'), true);
    assert.equal(isVikingUri('file:///tmp/x'), false);
    assert.equal(isVikingUri(undefined), false);
  });

  it('parses home alias and segments', () => {
    const uri = parseVikingUri('viking://~/memories/preferences/team.md');
    assert.ok(uri);
    assert.equal(uri.isHome, true);
    assert.equal(uri.kind, 'memories');
    assert.deepEqual(uri.segments, ['memories', 'preferences', 'team.md']);
  });

  it('classifies scopes for policy', () => {
    const home = parseVikingUri('viking://~/memories');
    const userUri = parseVikingUri('viking://user/me/memories');
    const res = parseVikingUri('viking://resources/x');
    const agent = parseVikingUri('viking://agent/skills/s');
    assert.ok(home && userUri && res && agent);
    assert.equal(classifyScope(home), 'user');
    assert.equal(classifyScope(userUri), 'user');
    assert.equal(classifyScope(res), 'resources');
    assert.equal(classifyScope(agent), 'agent');
  });

  it('extracts viking targets from nested arguments', () => {
    const args = { uris: ['viking://~/memories', 'plain.txt'], nested: { path: 'viking://~/resources/x' } };
    const found = findVikingUris(args);
    assert.equal(found.length, 2);
    assert.equal(hasVikingTarget(args), true);
    assert.equal(hasVikingTarget({ path: 'C:\\tmp\\x' }), false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGitOrigin } from '../lib/peer.js';

describe('peer normalizeGitOrigin', () => {
  it('normalizes scp-like origins', () => {
    assert.equal(
      normalizeGitOrigin('git@github.com:volcengine/OpenViking.git'),
      'github.com-volcengine-openviking',
    );
  });

  it('normalizes https origins', () => {
    assert.equal(
      normalizeGitOrigin('https://github.com/volcengine/OpenViking.git'),
      'github.com-volcengine-openviking',
    );
  });

  it('handles scp-with-port, trailing slashes and case', () => {
    assert.equal(normalizeGitOrigin('git@github.com:8080:Team/Repo.Git'), 'github.com-8080-team-repo');
    assert.equal(normalizeGitOrigin('https://github.com/A/B/'), 'github.com-a-b');
  });

  it('falls back to slugifying anything else', () => {
    assert.equal(normalizeGitOrigin('C:\\work\\my repo'), 'c-work-my-repo');
  });
});

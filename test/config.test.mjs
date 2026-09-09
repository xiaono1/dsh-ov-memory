import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_ENDPOINT } from '../lib/config.js';

describe('config normalizeConfig', () => {
  it('fills defaults for an empty input', () => {
    const cfg = normalizeConfig({});
    assert.equal(cfg.endpoint, DEFAULT_ENDPOINT);
    assert.equal(cfg.mcp.serverName, 'openviking');
    assert.equal(cfg.mcp.toolCallTimeoutMs, 60000);
    assert.equal(cfg.recall.budgetTokens, 2000);
    assert.equal(cfg.recall.scoreFloor, 0.35);
    assert.equal(cfg.commit.thresholdTokens, 20000);
    assert.equal(cfg.commit.keepRecentCount, 10);
    assert.equal(cfg.capture.toolResults, false);
    assert.equal(cfg.capture.syncTurns, true);
    assert.equal(cfg.learn.minScore, 0.5);
  });

  it('honours explicit values and nested sections', () => {
    const cfg = normalizeConfig({
      endpoint: 'http://localhost:9999/',
      apiKey: 'k',
      account: 'acct',
      recall: { budgetTokens: 500, scoreFloor: 0.1 },
      commit: { thresholdTokens: 12000 },
      learn: { minScore: 0.8 },
    });
    assert.equal(cfg.endpoint, 'http://localhost:9999');
    assert.equal(cfg.apiKey, 'k');
    assert.equal(cfg.account, 'acct');
    assert.equal(cfg.recall.budgetTokens, 500);
    assert.equal(cfg.recall.scoreFloor, 0.1);
    assert.equal(cfg.recall.enabled, true); // sibling default preserved
    assert.equal(cfg.commit.thresholdTokens, 12000);
    assert.equal(cfg.learn.minScore, 0.8);
  });

  it('strips trailing slashes from endpoint', () => {
    assert.equal(normalizeConfig({ endpoint: 'http://x:1///' }).endpoint, 'http://x:1');
  });
});

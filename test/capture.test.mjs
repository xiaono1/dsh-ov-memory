import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureEvent } from '../lib/capture.js';
import { openvikingSessionId, isSubagentSession } from '../lib/session.js';

const OPTS = { ownPluginSource: 'ov-memory', toolResults: false };

function textMessage(role, text, extra = {}) {
  return { id: `m-${text}`, role, content: [{ type: 'text', text }], ...extra };
}

describe('capture captureEvent', () => {
  it('captures user messages as text', () => {
    const out = captureEvent({ type: 'user/message', data: textMessage('user', 'hello there') }, OPTS);
    assert.deepEqual(out, { role: 'user', text: 'hello there', messageId: 'm-hello there' });
  });

  it('captures assistant messages', () => {
    const out = captureEvent(
      { type: 'assistant/message', message: textMessage('assistant', 'sure!') },
      OPTS,
    );
    assert.deepEqual(out, { role: 'assistant', text: 'sure!', messageId: 'm-sure!' });
  });

  it('skips empty messages and unknown events', () => {
    assert.equal(captureEvent({ type: 'user/message', data: textMessage('user', '  ') }, OPTS), null);
    assert.equal(captureEvent({ type: 'step/start' }, OPTS), null);
    assert.equal(captureEvent(null, OPTS), null);
  });

  it('skips our own injected plugin blocks', () => {
    const msg = {
      id: 'x',
      role: 'user',
      content: [{ type: 'text', text: '[recall] stuff' }],
      source: { kind: 'plugin', plugin: 'ov-memory', form: 'recall' },
    };
    assert.equal(captureEvent({ type: 'user/message', data: msg }, OPTS), null);
  });

  it('captures tool results only when enabled', () => {
    const result = {
      id: 'tr',
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 't1', content: '42', isError: false }],
      source: { kind: 'tool', callId: 't1', name: 'bash' },
    };
    assert.equal(
      captureEvent({ type: 'tool/result', message: result }, { ownPluginSource: 'ov-memory', toolResults: false }),
      null,
    );
    const out = captureEvent(
      { type: 'tool/result', message: result },
      { ownPluginSource: 'ov-memory', toolResults: true },
    );
    assert.ok(out);
    assert.equal(out.role, 'tool');
    assert.equal(out.toolName, 'bash');
  });
});

describe('session mapping', () => {
  it('prefixes dsh session ids', () => {
    assert.equal(openvikingSessionId('abc-123'), 'dsh-abc-123');
    assert.equal(openvikingSessionId('dsh-abc'), 'dsh-abc');
  });

  it('detects subagent sessions by header origin', () => {
    assert.equal(isSubagentSession({ id: 's1', header: { origin: 'subagent' } }), true);
    assert.equal(isSubagentSession({ id: 's1', header: { origin: 'startup' } }), false);
    assert.equal(isSubagentSession({ id: 's1' }), false);
  });
});

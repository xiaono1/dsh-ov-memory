/**
 * Workspace → OpenViking actor-peer resolution.
 *
 * OpenViking groups durable context under *peers*: stable identities for a
 * body of work. DSH has no peer concept of its own, so the plugin derives one
 * from the session workspace's git identity — the normalized remote origin
 * when the workspace is a git checkout, otherwise its repository root path.
 * Outside a git repository no peer is sent at all.
 */

import { execFileSync } from 'node:child_process';

export type PeerSource = 'git' | 'cwd' | 'none';

export interface PeerResolution {
  /** Peer id to send, or null when the workspace is outside git. */
  peerId: string | null;
  /** Where the id came from, for logging and tests. */
  source: PeerSource;
}

/** Normalize `origin` URLs of either form to a filesystem-safe slug. */
export function normalizeGitOrigin(origin: string): string {
  const trimmed = origin.trim();
  // URL-shaped origins (https://…, ssh://…, git://…) take the URL branch.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const path = u.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
      const parts = [u.hostname, ...path.split('/').filter(Boolean)];
      return slugify(parts.join('-').toLowerCase());
    } catch {
      return slugify(trimmed);
    }
  }
  // scp-like: git@github.com:volcengine/OpenViking.git
  const scp = /^(?:[^@/]+@)?([^:/]+):(.*)$/.exec(trimmed);
  if (scp) {
    const hostname = scp[1]!;
    const path = scp[2]!.replace(/\/+$/, '').replace(/\.git$/i, '');
    return slugify([hostname, ...path.split('/').filter(Boolean)].join('-').toLowerCase());
  }
  return slugify(trimmed);
}

function slugify(input: string): string {
  // Keep letters, digits, dots and dashes; collapse everything else.
  return input
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Resolve a workspace directory to a peer id using its git origin. */
export function resolvePeerFromGit(cwd: string): string | null {
  try {
    const origin = execFileSync(
      'git',
      ['config', '--get', 'remote.origin.url'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    ).trim();
    return origin ? normalizeGitOrigin(origin) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a peer for a session workspace.
 *
 * @param opts.explicit  `OPENVIKING_PEER_ID`-style pinned peer (wins).
 * @param opts.cwd       Session workspace directory.
 * @param opts.fromGit   Try git-derived peer (default true).
 */
export function resolvePeer(opts: {
  explicit?: string | null;
  cwd: string;
  fromGit?: boolean;
}): PeerResolution {
  const explicit = opts.explicit?.trim();
  if (explicit) return { peerId: explicit, source: 'git' };
  if (opts.fromGit !== false) {
    const peerId = resolvePeerFromGit(opts.cwd);
    if (peerId) return { peerId, source: 'git' };
  }
  return { peerId: null, source: 'none' };
}

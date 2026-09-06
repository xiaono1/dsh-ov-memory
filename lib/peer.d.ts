/**
 * Workspace → OpenViking actor-peer resolution.
 *
 * OpenViking groups durable context under *peers*: stable identities for a
 * body of work. DSH has no peer concept of its own, so the plugin derives one
 * from the session workspace's git identity — the normalized remote origin
 * when the workspace is a git checkout, otherwise its repository root path.
 * Outside a git repository no peer is sent at all.
 */
export type PeerSource = 'git' | 'cwd' | 'none';
export interface PeerResolution {
    /** Peer id to send, or null when the workspace is outside git. */
    peerId: string | null;
    /** Where the id came from, for logging and tests. */
    source: PeerSource;
}
/** Normalize `origin` URLs of either form to a filesystem-safe slug. */
export declare function normalizeGitOrigin(origin: string): string;
/** Resolve a workspace directory to a peer id using its git origin. */
export declare function resolvePeerFromGit(cwd: string): string | null;
/**
 * Resolve a peer for a session workspace.
 *
 * @param opts.explicit  `OPENVIKING_PEER_ID`-style pinned peer (wins).
 * @param opts.cwd       Session workspace directory.
 * @param opts.fromGit   Try git-derived peer (default true).
 */
export declare function resolvePeer(opts: {
    explicit?: string | null;
    cwd: string;
    fromGit?: boolean;
}): PeerResolution;
//# sourceMappingURL=peer.d.ts.map
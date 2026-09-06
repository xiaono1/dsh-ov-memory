/**
 * Proxy process entry point.
 *
 * DSH spawns this file as a stdio MCP server (one process per profile). All
 * configuration travels through the child environment — DSH scrubs
 * credential-shaped names out of the inherited environment, so the parent
 * passes the resolved OpenViking values explicitly in `env`.
 */
export {};
//# sourceMappingURL=proxy-entry.d.ts.map
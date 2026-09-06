/** Minimal logger surface accepted by the runtime (ctx.logger satisfies it). */
export interface Logger {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
//# sourceMappingURL=types.d.ts.map
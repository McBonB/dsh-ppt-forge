/**
 * Shell helpers shared by every tool. All external processes (git, python,
 * node validators) go through the `shell` seam — the sanctioned process path
 * for plugin tools — so they inherit credential scrubbing, abort escalation,
 * and output caps.
 */

/**
 * Workspace root of the driving session, used as the default workdir for
 * PPT project paths (the engine three-directory model resolves project
 * directories against the working folder).
 * @param {import('./types.js').ToolRunContext} exec
 * @returns {string | undefined}
 */
export function sessionCwd(exec) {
  return exec.agent?.session?.header?.cwd;
}

/** POSIX single-quote a value for interpolation into a `bash -c` command. */
export function shq(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/**
 * Run one command and return a plain result record. `run` resolves for
 * nonzero exits, timeouts, and aborts; it never rejects except on
 * infrastructure failure, which callers let propagate.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ command: string, workdir?: string | undefined, signal?: AbortSignal | undefined,
 *           timeoutMs?: number | undefined, env?: Record<string, string> | undefined }} request
 */
export async function runShell(ctx, request) {
  const result = await ctx.shell.run(ctx.shell.resolve({
    command: request.command,
    ...request.workdir !== undefined ? { workdir: request.workdir } : {},
    ...request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {},
    ...request.signal !== undefined ? { signal: request.signal } : {},
    ...request.env !== undefined ? { env: request.env } : {},
    stdoutMaxBytes: 512 * 1024,
  }));
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    aborted: result.aborted,
    stdout: result.stdout.text,
    stderr: result.stderr.text,
  };
}

/** Last `maxChars` characters of captured output, for bounded tool results. */
export function tail(text, maxChars = 4000) {
  if (text.length <= maxChars) return text;
  return `…${text.slice(-maxChars)}`;
}

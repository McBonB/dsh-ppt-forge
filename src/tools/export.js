import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { defineTool } from '../define-tool.js';
import { isInsideManaged } from '../paths.js';
import { runShell, sessionCwd, shq, tail } from '../shell.js';

/**
 * `pptx_export` — wraps the PPTX engine exporter `svg_to_pptx.py`.
 *
 * Converts the authored (or round-trip) SVG workspace into a native,
 * editable PPTX under `<project>/exports/`. The engine skill owns when
 * to call this in its workflow; the tool only guarantees the invocation is
 * well-formed, session-logged, and cancellable.
 */

const EXPORT_TIMEOUT_MS = 600_000;

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('../types.js').PluginRuntime} runtime
 */
export function createExportTool(ctx, runtime) {
  return defineTool({
    name: 'pptx_export',
    description:
      'Export an engine project to a native editable PPTX via svg_to_pptx.py. ' +
      'Use for the final export after the SVG quality check passes, or with roundtrip=true ' +
      'for Edit-Native workspaces. The PPTX lands in <project>/exports/.',
    parameters: {
      project: {
        type: 'string',
        required: true,
        description: 'Engine project directory: absolute path, or a name/path relative to the session workspace (as created by project_manager.py init).',
      },
      roundtrip: {
        type: 'boolean',
        required: false,
        description: 'Export an Edit-Native (--roundtrip) workspace back to PPTX with byte-exact passthrough for unchanged objects.',
      },
      quickGenerate: {
        type: 'boolean',
        required: false,
        description: 'Export a quick-generate project (--quick-generate).',
      },
      nativeChartsAndTables: {
        type: 'boolean',
        required: false,
        description: 'Emit native charts/tables with embedded workbooks instead of images (--native-charts-and-tables).',
      },
      noNotes: {
        type: 'boolean',
        required: false,
        description: 'Do not embed speaker notes (--no-notes).',
      },
      extraArgs: {
        type: 'array',
        required: false,
        description: 'Additional svg_to_pptx.py CLI flags passed verbatim, for options this tool does not model.',
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: renderExport(value) }],
    },
    async execute(args, exec) {
      const dirs = runtime.resolveDirs();
      guardPptMaster(runtime, dirs);
      const cwd = sessionCwd(exec);
      const projectDir = await resolveProjectDir(ctx, args.project, cwd, exec.signal);
      guardWorkspaceIsolation(dirs, projectDir);

      const flags = [];
      if (args.roundtrip === true) flags.push('--roundtrip');
      if (args.quickGenerate === true) flags.push('--quick-generate');
      if (args.nativeChartsAndTables === true) flags.push('--native-charts-and-tables');
      if (args.noNotes === true) flags.push('--no-notes');
      if (Array.isArray(args.extraArgs)) flags.push(...args.extraArgs);

      const python = await pickPython(runtime, dirs);
      const script = join(dirs.pptxEngineSkillDir, 'scripts', 'svg_to_pptx.py');
      const command = [python, script, projectDir, ...flags].map(shq).join(' ');
      const result = await runShell(ctx, {
        command,
        workdir: cwd,
        signal: exec.signal,
        timeoutMs: EXPORT_TIMEOUT_MS,
        // The venv lives outside the sandboxed workspace; keep python from
        // writing bytecode into it so the managed skill space stays pristine.
        env: { PYTHONDONTWRITEBYTECODE: '1' },
      });

      const exports = await listDir(ctx, join(projectDir, 'exports'), cwd, exec.signal);
      return {
        ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        command,
        projectDir,
        python,
        exports,
        stdoutTail: tail(result.stdout),
        stderrTail: tail(result.stderr),
      };
    },
  });
}

/**
 * @param {import('../types.js').PluginRuntime} runtime
 * @param {import('../types.js').PluginDirs} dirs
 */
function guardPptMaster(runtime, dirs) {
  if (!runtime.state().pptxEnginePresent) {
    throw new Error(`dsh-ppt-forge: the PPTX engine is not set up at ${dirs.pptxEngineDir} — run ppt_setup first`);
  }
}

/**
 * Generated content lives in the session workspace; the managed skill space
 * (clones, venv) stays pristine so upstream pulls and the attribution gate
 * never see project output.
 * @param {import('../types.js').PluginDirs} dirs
 * @param {string} projectDir absolute path
 */
function guardWorkspaceIsolation(dirs, projectDir) {
  if (isInsideManaged(dirs, projectDir)) {
    throw new Error(
      `dsh-ppt-forge: refusing to operate inside the managed skill space (${dirs.managedDir}); ` +
      'PPT projects belong in your session workspace',
    );
  }
}

/**
 * Resolve the project argument to an absolute directory and fail loud when it
 * does not exist.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} project
 * @param {string | undefined} cwd
 * @param {AbortSignal} signal
 */
async function resolveProjectDir(ctx, project, cwd, signal) {
  const absolute = isAbsolute(project) ? project : resolve(cwd ?? process.cwd(), project);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`dsh-ppt-forge: project directory not found: ${absolute}`);
  }
  return absolute;
}

/**
 * Prefer the managed venv; fall back to the configured python with a warning
 * in the result so the agent can surface it.
 * @param {import('../types.js').PluginRuntime} runtime
 * @param {import('../types.js').PluginDirs} dirs
 */
async function pickPython(runtime, dirs) {
  try {
    await stat(dirs.venvPython);
    return dirs.venvPython;
  } catch {
    runtime.warn(`engine venv missing at ${dirs.venvPython}; falling back to '${runtime.config.pythonBin}'`);
    return runtime.config.pythonBin;
  }
}

/** @returns {Promise<string[]>} */
async function listDir(ctx, dir, cwd, signal) {
  const result = await runShell(ctx, {
    command: `ls -1 ${shq(dir)} 2>/dev/null || true`,
    workdir: cwd,
    signal,
    timeoutMs: 15_000,
  });
  return result.stdout.split('\n').map(line => line.trim()).filter(line => line !== '');
}

/**
 * @param {Record<string, unknown>} value
 */
function renderExport(value) {
  if (value.ok !== true) {
    return `pptx_export FAILED (exit ${String(value.exitCode)})\n${String(value.stderrTail ?? '')}`.trim();
  }
  const exports = Array.isArray(value.exports) ? value.exports : [];
  const fileList = exports.length > 0 ? exports.join(', ') : '(check exports/ directory)';
  return `pptx_export ok → ${String(value.projectDir)}/exports: ${fileList}`;
}

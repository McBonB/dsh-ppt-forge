import { isAbsolute, join, resolve } from 'node:path';
import { defineTool } from '../define-tool.js';
import { isInsideManaged } from '../paths.js';
import { runShell, sessionCwd, shq, tail } from '../shell.js';

/**
 * `ppt_quality_check` — wraps the PPTX engine gate `svg_quality_checker.py`.
 *
 * Modes mirror the authoring surface: canonical-authoring for generated
 * decks, roundtrip for Edit-Native workspaces, template-mode for template
 * prototypes, quick-generate for quick profiles. `--json` is always on so
 * the report parses deterministically.
 */

const CHECK_TIMEOUT_MS = 300_000;

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('../types.js').PluginRuntime} runtime
 */
export function createQualityTool(ctx, runtime) {
  return defineTool({
    name: 'ppt_quality_check',
    description:
      'Run the PPTX engine SVG quality gates on a project (svg_quality_checker.py --json). ' +
      'Use stage=early after the first ~5 authored pages and stage=final before pptx_export; ' +
      'the final exporter refuses to run without a passing final report.',
    parameters: {
      project: {
        type: 'string',
        required: true,
        description: 'Engine project or workspace directory: absolute, or relative to the session workspace.',
      },
      mode: {
        type: 'string',
        required: false,
        description: 'Checker mode. One of: canonical-authoring (default), roundtrip, template-mode, quick-generate.',
      },
      stage: {
        type: 'string',
        required: false,
        description: 'Gate stage. One of: early, final (default).',
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: renderQuality(value) }],
    },
    async execute(args, exec) {
      const dirs = runtime.resolveDirs();
      if (!runtime.state().pptxEnginePresent) {
        throw new Error(`dsh-ppt-forge: the PPTX engine is not set up at ${dirs.pptxEngineDir} — run ppt_setup first`);
      }
      const cwd = sessionCwd(exec);
      const projectDir = isAbsolute(args.project) ? args.project : resolve(cwd ?? process.cwd(), args.project);
      if (isInsideManaged(dirs, projectDir)) {
        throw new Error(
          `dsh-ppt-forge: refusing to operate inside the managed skill space (${dirs.managedDir}); ` +
          'PPT projects belong in your session workspace',
        );
      }
      const mode = normalizeChoice(args.mode, ['canonical-authoring', 'roundtrip', 'template-mode', 'quick-generate'], 'canonical-authoring');
      const stage = normalizeChoice(args.stage, ['early', 'final'], 'final');

      const flags = mode === 'quick-generate'
        ? ['--quick-generate', '--canonical-authoring']
        : [`--${mode}`];
      flags.push('--stage', stage, '--json');

      const python = runtime.state().venvPresent ? dirs.venvPython : runtime.config.pythonBin;
      const script = join(dirs.pptxEngineSkillDir, 'scripts', 'svg_quality_checker.py');
      const command = [python, script, projectDir, ...flags].map(shq).join(' ');
      const result = await runShell(ctx, {
        command,
        workdir: cwd,
        signal: exec.signal,
        timeoutMs: CHECK_TIMEOUT_MS,
        // The venv lives outside the sandboxed workspace; keep python from
        // writing bytecode into it so the managed skill space stays pristine.
        env: { PYTHONDONTWRITEBYTECODE: '1' },
      });

      const reportPath = mode === 'roundtrip'
        ? join(projectDir, 'validation', 'svg_quality_roundtrip_report.json')
        : join(projectDir, 'validation', stage === 'early' ? 'svg_quality_early_report.json' : 'svg_quality_report.json');
      return {
        ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        mode,
        stage,
        command,
        projectDir,
        reportPath,
        stdoutTail: tail(result.stdout, 8000),
        stderrTail: tail(result.stderr, 2000),
      };
    },
  });
}

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} fallback
 */
function normalizeChoice(value, allowed, fallback) {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!allowed.includes(value)) {
    throw new Error(`dsh-ppt-forge: invalid choice '${value}' (expected one of: ${allowed.join(', ')})`);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} value
 */
function renderQuality(value) {
  const head = `ppt_quality_check (${String(value.mode)} / ${String(value.stage)}) → ${String(value.projectDir)}`;
  if (value.ok !== true) {
    return `${head} ISSUES FOUND (exit ${String(value.exitCode)})\nreport: ${String(value.reportPath)}\n${String(value.stdoutTail ?? value.stderrTail ?? '')}`.trim();
  }
  return `${head} PASSED\nreport: ${String(value.reportPath)}`;
}

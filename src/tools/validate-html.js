import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { defineTool } from '../define-tool.js';
import { runShell, sessionCwd, shq, tail } from '../shell.js';

/**
 * `html_ppt_validate` — wraps the HTML engine zero-dependency Node
 * validators. `validate-swiss-deck.mjs` checks Swiss-style structural rules
 * (layout registry, slot contracts) and, when Playwright is resolvable,
 * rendered overflow measurements; `validate-presenter-mode.mjs` checks the
 * SPEAKER_NOTES schema and runtime-control contract for either style.
 */

const VALIDATE_TIMEOUT_MS = 300_000;

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('../types.js').PluginRuntime} runtime
 */
export function createValidateHtmlTool(ctx, runtime) {
  return defineTool({
    name: 'html_ppt_validate',
    description:
      'Validate a generated HTML deck with its upstream validators. ' +
      'Run before delivering any HTML PPT; fix everything the validators report, then re-run.',
    parameters: {
      deck: {
        type: 'string',
        required: true,
        description: 'Path to the deck index.html: absolute, or relative to the session workspace.',
      },
      validators: {
        type: 'string',
        required: false,
        description: 'Which validators to run. One of: both (default), swiss, presenter.',
      },
      targetMinutes: {
        type: 'number',
        required: false,
        description: 'Target talk length in minutes for the presenter-mode time budget check.',
      },
      allowExperimental: {
        type: 'boolean',
        required: false,
        description: 'Permit experimental layouts in the Swiss validator (--allow-experimental).',
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: renderValidate(value) }],
    },
    async execute(args, exec) {
      const dirs = runtime.resolveDirs();
      if (!runtime.state().htmlEnginePresent) {
        throw new Error(`dsh-ppt-forge: the HTML deck engine is not set up at ${dirs.htmlEngineDir} — run ppt_setup first`);
      }
      const cwd = sessionCwd(exec);
      const deck = isAbsolute(args.deck) ? args.deck : resolve(cwd ?? process.cwd(), args.deck);
      try {
        await stat(deck);
      } catch {
        throw new Error(`dsh-ppt-forge: deck not found: ${deck}`);
      }
      const which = typeof args.validators === 'string' && args.validators !== ''
        ? args.validators : 'both';
      if (!['both', 'swiss', 'presenter'].includes(which)) {
        throw new Error(`dsh-ppt-forge: invalid validators '${which}' (expected both, swiss, or presenter)`);
      }

      /** @type {Array<Record<string, unknown>>} */
      const results = [];
      if (which === 'both' || which === 'swiss') {
        const flags = args.allowExperimental === true ? ['--allow-experimental'] : [];
        results.push(await runValidator(ctx, runtime, 'swiss',
          join(dirs.htmlEngineDir, 'scripts', 'validate-swiss-deck.mjs'), [deck, ...flags], cwd, exec.signal));
      }
      if (which === 'both' || which === 'presenter') {
        const flags = typeof args.targetMinutes === 'number'
          ? ['--target-minutes', String(args.targetMinutes)] : [];
        results.push(await runValidator(ctx, runtime, 'presenter',
          join(dirs.htmlEngineDir, 'scripts', 'validate-presenter-mode.mjs'), [deck, ...flags], cwd, exec.signal));
      }
      return { deck, results };
    },
  });
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('../types.js').PluginRuntime} runtime
 * @param {string} name
 * @param {string} script
 * @param {string[]} args
 * @param {string | undefined} cwd
 * @param {AbortSignal} signal
 */
async function runValidator(ctx, runtime, name, script, args, cwd, signal) {
  const command = [runtime.config.nodeBin, script, ...args].map(shq).join(' ');
  const result = await runShell(ctx, { command, workdir: cwd, signal, timeoutMs: VALIDATE_TIMEOUT_MS });
  return {
    validator: name,
    command,
    ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdoutTail: tail(result.stdout, 8000),
    stderrTail: tail(result.stderr, 2000),
  };
}

/**
 * @param {Record<string, unknown>} value
 */
function renderValidate(value) {
  const lines = [`html_ppt_validate → ${String(value.deck)}`];
  const results = Array.isArray(value.results) ? value.results : [];
  for (const result of results) {
    if (result === null || typeof result !== 'object') continue;
    lines.push(`- ${String(result.validator)}: ${result.ok === true ? 'PASSED' : `FAILED (exit ${String(result.exitCode)})`}`);
    if (result.ok !== true) {
      const detail = `${String(result.stdoutTail ?? '')}\n${String(result.stderrTail ?? '')}`.trim();
      if (detail !== '') lines.push(tailBlock(detail));
    }
  }
  return lines.join('\n');
}

function tailBlock(text) {
  const lines = text.split('\n').slice(-20).map(line => `  ${line}`);
  return lines.join('\n');
}

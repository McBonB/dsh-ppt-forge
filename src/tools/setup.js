import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTool } from '../define-tool.js';
import { tail } from '../shell.js';

/**
 * `ppt_setup` — one-shot, idempotent bootstrap.
 *
 * This is administration, not agent file access — the same plane as
 * `dsh plugin add` running pnpm. Every write destination (clone roots, venv)
 * comes from plugin config, never from model arguments (the tool's only
 * argument is `checkOnly`), and the commands run from the host process via
 * `execFile` with fixed argv: the agent shell sandbox confines writes to the
 * session workspace by design, and the managed skill space under $DSH_HOME
 * must stay outside it. The per-project tools (`pptx_export`,
 * `ppt_quality_check`) keep going through the sandboxed `shell` seam because
 * they only touch workspace paths.
 */

const SETUP_TIMEOUT_MS = 600_000;

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('../types.js').PluginRuntime} runtime
 */
export function createSetupTool(ctx, runtime) {
  return defineTool({
    name: 'ppt_setup',
    description:
      'Bootstrap (or check) the dsh-ppt-forge environment: fetch the upstream engine ' +
      'skill repositories, create the python venv, install engine requirements, and register ' +
      'the skills. Idempotent — safe to run again. Run this first after installing dsh-ppt-forge, or ' +
      'after changing its config. With checkOnly=true it only reports status.',
    parameters: {
      checkOnly: {
        type: 'boolean',
        required: false,
        description: 'Only report current status; do not clone or install anything.',
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: renderSetup(value) }],
    },
    async execute(args) {
      const { config } = runtime;
      const dirs = runtime.resolveDirs();
      /** @type {Array<Record<string, unknown>>} */
      const steps = [];

      const status = await collectStatus(runtime);
      if (args.checkOnly === true) {
        return { checkOnly: true, ...status, steps };
      }

      if (config.localPptxEngineDir === '' && !status.pptx.present) {
        steps.push(await runStep(`Cloning ${config.pptxEngineRepo}`,
          'git', cloneArgv(config.pptxEngineRepo, config.pptxEngineRef, dirs.pptxEngineDir)));
      }
      if (config.localHtmlEngineDir === '' && !status.html.present) {
        steps.push(await runStep(`Cloning ${config.htmlEngineRepo}`,
          'git', cloneArgv(config.htmlEngineRepo, config.htmlEngineRef, dirs.htmlEngineDir)));
      }
      if (config.localDesignEngineDir === '' && !status.design.present) {
        // The design repo carries ~200 MB of example artifacts beyond skill/;
        // a blob-filtered sparse clone fetches only the skill tree.
        const argv = ['clone', '--depth', '1', '--filter', 'blob:none', '--sparse'];
        if (config.designEngineRef !== '') argv.push('--branch', config.designEngineRef);
        argv.push(config.designEngineRepo, dirs.designEngineDir);
        const clone = await runStep(`Cloning ${config.designEngineRepo} (sparse)`, 'git', argv);
        steps.push(clone);
        if (clone.ok) {
          steps.push(await runStep('Selecting skill/ tree (sparse-checkout)',
            'git', ['-C', dirs.designEngineDir, 'sparse-checkout', 'set', 'skill']));
        }
      }

      if (config.localSlidesEngineDir === '' && !status.slides.present) {
        steps.push(await runStep(`Cloning ${config.slidesEngineRepo}`,
          'git', cloneArgv(config.slidesEngineRepo, config.slidesEngineRef, dirs.slidesEngineDir)));
      }

      if ((config.enablePptx || config.enableDesign) && config.createVenv
        && ((config.enablePptx && await pathExists(dirs.pptxEngineSkillDir))
          || (config.enableDesign && await pathExists(dirs.designEngineSkillDir)))) {
        // The engines require Python >= 3.10; a venv created with an older
        // interpreter (e.g. a stock macOS python3) is rebuilt, not reused.
        const pythonBin = await resolvePythonBin(config);
        let venvPythonVersion = await pythonVersion(dirs.venvPython);
        if (await pathExists(dirs.venvPython)) {
          if (venvPythonVersion !== null && versionOk(venvPythonVersion)) {
            // reuse
          } else {
            await rm(dirs.venvDir, { recursive: true, force: true });
            venvPythonVersion = null;
          }
        }
        if (venvPythonVersion === null) {
          steps.push(await runStep(`Creating python venv (${pythonBin.bin} ${pythonBin.version.major}.${pythonBin.version.minor})`,
            pythonBin.bin, ['-m', 'venv', dirs.venvDir]));
          if (await pathExists(dirs.venvPython)) {
            steps.push(await runStep('Upgrading pip',
              dirs.venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', ...pipIndexArgs(config)]));
          }
        }
        if (await pathExists(dirs.venvPython)) {
          if (config.enablePptx && await pathExists(dirs.pptxEngineSkillDir)) {
            steps.push(await runStep('Installing PPTX engine requirements',
              dirs.venvPython, ['-m', 'pip', 'install', ...pipIndexArgs(config), '-r', join(dirs.pptxEngineDir, 'requirements.txt')]));
          }
          if (config.enableDesign && await pathExists(dirs.designEngineSkillDir)) {
            // The design engine's authoring layer + style/palette/typography
            // atoms live in its MIT python package.
            steps.push(await runStep('Installing design engine package (pptx-designer)',
              dirs.venvPython, ['-m', 'pip', 'install', ...pipIndexArgs(config), 'pptx-designer>=1.0.0b8']));
          }
        }
      }

      const skills = await runtime.refreshSkills();
      const final = await collectStatus(runtime);
      return { checkOnly: false, ...final, steps, skills };
    },
  });
}

/** @returns {string[]} */
function pipIndexArgs(config) {
  const args = config.pipIndexUrl !== '' ? ['-i', config.pipIndexUrl] : [];
  return [...args, ...pipProxyArgs(config)];
}

/**
 * pip inherits the OS proxy by default (macOS system proxy included); a dead
 * system proxy turns every install into retries. 'direct' forces
 * `--proxy=` (empty override); any other non-empty value is passed through.
 * @returns {string[]}
 */
function pipProxyArgs(config) {
  if (config.pipProxy === 'direct') return ['--proxy='];
  if (config.pipProxy !== '') return ['--proxy', config.pipProxy];
  return [];
}

/** @returns {{ major: number, minor: number } | null} */
async function pythonVersion(bin) {
  try {
    const out = await capture(bin, ['-c', 'import sys; print("%d %d" % sys.version_info[:2])']);
    const [major, minor] = out.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
    return { major, minor };
  } catch {
    return null;
  }
}

function versionOk(version) {
  return version.major > 3 || (version.major === 3 && version.minor >= 10);
}

/**
 * Pick an interpreter the PPTX engine can run on (>= 3.10). The configured value
 * is tried first and must qualify on its own; after that, well-known
 * interpreter names and install locations are probed newest-first.
 * @param {import('../types.js').PluginConfig} config
 * @returns {Promise<{ bin: string, version: { major: number, minor: number } }>}
 */
async function resolvePythonBin(config) {
  const candidates = [
    config.pythonBin,
    'python3.13', 'python3.12', 'python3.11', 'python3.10',
    '/opt/homebrew/bin/python3',
    '/opt/miniconda3/bin/python3',
    '/usr/local/bin/python3',
  ];
  for (const bin of candidates) {
    if (bin === '') continue;
    const version = await pythonVersion(bin);
    if (version !== null && versionOk(version)) return { bin, version };
  }
  throw new Error(
    `dsh-ppt-forge: no Python >= 3.10 found (tried: ${candidates.filter(c => c !== '').join(', ')}); ` +
    'the PPTX engine requires Python 3.10+ — set the pythonBin config field to a qualifying interpreter',
  );
}

/** @returns {string[]} */
function cloneArgv(repo, ref, targetDir) {
  const argv = ['clone', '--depth', '1'];
  if (ref !== '') argv.push('--branch', ref);
  argv.push(repo, targetDir);
  return argv;
}

/**
 * @param {import('../types.js').PluginRuntime} runtime
 */
async function collectStatus(runtime) {
  const { config } = runtime;
  const dirs = runtime.resolveDirs();
  return {
    pptx: {
      dir: dirs.pptxEngineDir,
      mode: config.localPptxEngineDir !== '' ? 'local-checkout' : 'managed-clone',
      present: await pathExists(join(dirs.pptxEngineDir, 'skills', 'ppt-master', 'SKILL.md')),
    },
    html: {
      dir: dirs.htmlEngineDir,
      mode: config.localHtmlEngineDir !== '' ? 'local-checkout' : 'managed-clone',
      present: await pathExists(join(dirs.htmlEngineDir, 'SKILL.md')),
    },
    slides: {
      dir: dirs.slidesEngineDir,
      mode: config.localSlidesEngineDir !== '' ? 'local-checkout' : 'managed-clone',
      present: await pathExists(join(dirs.slidesEngineDir, 'SKILL.md')),
    },
    design: {
      dir: dirs.designEngineDir,
      mode: config.localDesignEngineDir !== '' ? 'local-checkout' : 'managed-sparse-clone',
      present: await pathExists(join(dirs.designEngineSkillDir, 'SKILL.md')),
    },
    venv: { dir: dirs.venvDir, present: await pathExists(dirs.venvPython) },
  };
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one bootstrap command in the host process with fixed argv.
 * @param {string} label
 * @param {string} file
 * @param {string[]} argv
 */
async function runStep(label, file, argv) {
  try {
    const result = await new Promise((resolveRun) => {
      execFile(file, argv, { timeout: SETUP_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error !== null) {
          resolveRun({ code: typeof error.code === 'number' ? error.code : 1, killed: error.killed === true, stdout: String(stdout ?? ''), stderr: `${String(stderr ?? '')}\n${error.message}` });
        } else {
          resolveRun({ code: 0, killed: false, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
        }
      });
    });
    return {
      step: label,
      ok: result.code === 0 && !result.killed,
      exitCode: result.code,
      timedOut: result.killed,
      stderrTail: tail(result.stderr, 2000),
      stdoutTail: tail(result.stdout, 2000),
    };
  } catch (error) {
    return { step: label, ok: false, exitCode: 1, timedOut: false, stderrTail: String(error), stdoutTail: '' };
  }
}

/** Capture stdout of a short-running command; rejects on failure. */
function capture(file, argv) {
  return new Promise((resolveCapture, rejectCapture) => {
    execFile(file, argv, { timeout: 15_000 }, (error, stdout) => {
      if (error !== null) rejectCapture(error);
      else resolveCapture(String(stdout ?? ''));
    });
  });
}

/**
 * @param {Record<string, unknown>} value
 */
function renderSetup(value) {
  const lines = ['dsh-ppt-forge setup'];
  for (const key of ['pptx', 'html', 'slides', 'design', 'venv']) {
    const block = value[key];
    if (block === undefined || typeof block !== 'object') continue;
    const info = block;
    lines.push(`- ${key}: ${info.present === true ? 'ready' : 'missing'} (${String(info.mode ?? 'venv')}) at ${String(info.dir)}`);
  }
  const steps = value.steps;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (step === null || typeof step !== 'object') continue;
      const tailText = typeof step.stderrTail === 'string' && step.stderrTail !== ''
        ? ` ${step.stderrTail.split('\n').slice(-2).join(' | ')}` : '';
      lines.push(`- ${String(step.step)}: ${step.ok === true ? 'ok' : `FAILED (exit ${String(step.exitCode)})`}${tailText}`);
    }
  }
  const skills = value.skills;
  if (skills !== undefined && typeof skills === 'object') {
    const sk = skills;
    lines.push(`- skills registered: ${Array.isArray(sk.registered) ? sk.registered.join(', ') : 'none'}${Array.isArray(sk.pending) && sk.pending.length > 0 ? `; pending: ${sk.pending.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

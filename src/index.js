import { statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { createSkillRegistrations } from './skills.js';
import { parseFrontmatter } from './frontmatter.js';
import { resolveDirs, skillRoots } from './paths.js';
import { createSetupTool } from './tools/setup.js';
import { createExportTool } from './tools/export.js';
import { createQualityTool } from './tools/quality.js';
import { createValidateHtmlTool } from './tools/validate-html.js';

/**
 * dsh-ppt-forge — free PPT generation for DeepSeek Harness.
 *
 * A thin orchestration layer over three upstream agent skills:
 *   - a native-PPTX engine (upstream, MIT): the model authors slide SVGs; python scripts compile
 *     them into native editable PPTX, and a round-trip path edits existing
 *     decks byte-exactly.
 *   - an HTML-deck engine (upstream, AGPL-3.0): the model writes a single-file HTML deck
 *     in one of two locked visual systems.
 *   - a design engine (upstream, MIT): a methodology skill (style/palette/typography
 *     atoms, composition recipes, acceptance-gated PNG review) driving a
 *     python-pptx authoring package for pixel-placed, fully editable decks.
 *
 * This plugin never modifies or redistributes their code. It fetches their
 * repositories verbatim, registers their SKILL.md files with dsh's skill
 * registry, and exposes setup/export/validate tools so the deterministic
 * gates run through the session-logged tool pipeline. All model-facing
 * authoring knowledge stays in the skills themselves.
 */

export const name = 'dsh-ppt-forge';

export const inject = ['tools', 'skills', 'shell'];

export const Config = Schema.object({
  managedDir: Schema.string().default('')
    .description('Where clones and the venv live. Empty = $DSH_HOME/dsh-ppt-forge.'),
  pptxEngineRepo: Schema.string().default('https://github.com/hugohe3/ppt-master.git')
    .description('git remote cloned when no local checkout is configured.'),
  pptxEngineRef: Schema.string().default('')
    .description('Branch or tag for the managed PPTX engine clone. Empty = default branch.'),
  htmlEngineRepo: Schema.string().default('https://github.com/op7418/guizang-ppt-skill.git')
    .description('git remote cloned when no local checkout is configured.'),
  htmlEngineRef: Schema.string().default('')
    .description('Branch or tag for the managed HTML-deck engine clone. Empty = default branch.'),
  designEngineRepo: Schema.string().default('https://github.com/sunchaokun/PPT-Design-Skill.git')
    .description('git remote cloned when no local checkout is configured (sparse: only skill/ is checked out).'),
  designEngineRef: Schema.string().default('')
    .description('Branch or tag for the managed design engine clone. Empty = default branch.'),
  localPptxEngineDir: Schema.string().default('')
    .description('Use an existing PPTX engine checkout (absolute path) instead of a managed clone; never written to.'),
  localHtmlEngineDir: Schema.string().default('')
    .description('Use an existing HTML-deck engine checkout (absolute path) instead of a managed clone; never written to.'),
  localDesignEngineDir: Schema.string().default('')
    .description('Use an existing design engine checkout (absolute path) instead of a managed clone; never written to.'),
  pythonBin: Schema.string().default('python3')
    .description('Python interpreter candidate for the venv; must be >= 3.10 (auto-discovery probes common names and install locations as fallback).'),
  pipIndexUrl: Schema.string().default('')
    .description('pip -i index for venv installs. Empty = your pip config. Set when your mirror lags behind PyPI (the engine pins recent releases).'),
  pipProxy: Schema.string().default('')
    .description('pip proxy. Empty = inherit (incl. OS proxy); "direct" disables proxying (--proxy=); or an explicit proxy URL.'),
  nodeBin: Schema.string().default('node')
    .description('Node interpreter used for the HTML deck validators.'),
  createVenv: Schema.boolean().default(true)
    .description('Create a dedicated venv under managedDir and install engine requirements into it.'),
  enablePptx: Schema.boolean().default(true)
    .description('Mount the PPTX skill and its tools.'),
  enableHtml: Schema.boolean().default(true)
    .description('Mount the HTML-deck skill and its validator tool.'),
  enableDesign: Schema.boolean().default(true)
    .description('Mount the design skill (style atoms, composition recipes, acceptance-gated PPTX authoring).'),
  pptxSkillName: Schema.string().default('dsh-ppt-forge-pptx')
    .description('Registered catalog name for the PPTX skill. Kebab-case; plugin-namespaced by default so it never shadows a personal skill of the same upstream name.'),
  htmlSkillName: Schema.string().default('dsh-ppt-forge-html')
    .description('Registered catalog name for the HTML-deck skill. Kebab-case; plugin-namespaced by default.'),
  designSkillName: Schema.string().default('dsh-ppt-forge-design')
    .description('Registered catalog name for the design skill. Kebab-case; plugin-namespaced by default.'),
  enableRouter: Schema.boolean().default(true)
    .description('Mount the plugin-authored router skill: format decision + design brief, then handoff to an engine skill.'),
  routerSkillName: Schema.string().default('dsh-ppt-forge')
    .description('Registered catalog name for the router skill. Kebab-case.'),
});

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./types.js').PluginConfig} config
 */
export function apply(ctx, config) {
  // Explicitly configured checkouts must exist now — fail loud at load.
  if (config.localPptxEngineDir !== '') {
    assertDirectory(join(config.localPptxEngineDir, 'skills', 'ppt-master'), 'localPptxEngineDir', config.localPptxEngineDir);
  }
  if (config.localHtmlEngineDir !== '') {
    assertDirectory(config.localHtmlEngineDir, 'localHtmlEngineDir', config.localHtmlEngineDir);
  }
  if (config.localDesignEngineDir !== '') {
    assertDirectory(join(config.localDesignEngineDir, 'skill'), 'localDesignEngineDir', config.localDesignEngineDir);
  }
  for (const [field, value] of [
    ['pptxSkillName', config.pptxSkillName],
    ['htmlSkillName', config.htmlSkillName],
    ['designSkillName', config.designSkillName],
    ['routerSkillName', config.routerSkillName],
  ]) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new Error(`dsh-ppt-forge: ${field} must be kebab-case (lowercase letters, digits, hyphens): ${JSON.stringify(value)}`);
    }
  }

  const skillRegistrations = createSkillRegistrations(ctx, resolveDirs(config), config);

  /** @type {import('./types.js').PluginState} */
  let state = { pptxEnginePresent: false, htmlEnginePresent: false, designEnginePresent: false, venvPresent: false };
  const refreshState = async () => {
    const dirs = resolveDirs(config);
    state = {
      pptxEnginePresent: await exists(join(dirs.pptxEngineSkillDir, 'SKILL.md')),
      htmlEnginePresent: await exists(join(dirs.htmlEngineSkillDir, 'SKILL.md')),
      designEnginePresent: await exists(join(dirs.designEngineSkillDir, 'SKILL.md')),
      venvPresent: await exists(dirs.venvPython),
    };
  };

  /** @type {import('./types.js').PluginRuntime} */
  const runtime = {
    config,
    resolveDirs: () => resolveDirs(config),
    state: () => state,
    refreshSkills: async () => {
      const result = await skillRegistrations.refresh();
      await refreshState();
      return result;
    },
    warn: (message) => { ctx.logger?.warn?.(message); },
  };

  ctx.tools.register(createSetupTool(ctx, runtime));
  if (config.enablePptx) {
    ctx.tools.register(createExportTool(ctx, runtime));
    ctx.tools.register(createQualityTool(ctx, runtime));
  }
  if (config.enableHtml) {
    ctx.tools.register(createValidateHtmlTool(ctx, runtime));
  }

  // Register whatever is already on disk (no-op while setup is pending);
  // ppt_setup re-runs this after fetching.
  void skillRegistrations.refresh().then(refreshState, (error) => {
    ctx.logger?.error?.(`dsh-ppt-forge: initial skill registration failed: ${String(error)}`);
  });

  ctx.effect(() => () => {
    skillRegistrations.dispose();
  });
}

/**
 * @param {string} dir
 * @param {string} field
 * @param {string} configured
 */
function assertDirectory(dir, field, configured) {
  let info;
  try {
    info = statSync(dir);
  } catch {
    throw new Error(`dsh-ppt-forge: ${field} is configured but not found: ${configured} (expected ${dir})`);
  }
  if (!info.isDirectory()) {
    throw new Error(`dsh-ppt-forge: ${field} is configured but not a directory: ${dir}`);
  }
}

/** @returns {Promise<boolean>} */
async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Re-exported for tests and downstream introspection.
export { parseFrontmatter, resolveDirs, skillRoots };

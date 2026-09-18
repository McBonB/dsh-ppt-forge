import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { skillName, skillRoots } from './paths.js';

/**
 * Inline registration of the two upstream skills onto `ctx.skills`.
 *
 * The skills stay on disk exactly as their upstream repositories ship them
 * (the PPTX engine upstream attribution guard fails on any modification of its gated
 * files), so this layer only reads SKILL.md and registers it with
 * `resourceBase` pointing at the skill directory — the `SKILL_DIR` anchor the
 * engine instructions demand. The registered NAME is plugin-namespaced
 * (`dsh-ppt-forge-pptx` / `dsh-ppt-forge-html` by default, configurable): the plugin
 * must not shadow a user's personal skill that carries the upstream name,
 * and the catalog entry carries a `[dsh-ppt-forge · engine: …]` tag so the model
 * picks the right name while the description keeps the upstream credit.
 * Missing directories are not an error at apply time: the plugin must load
 * before `ppt_setup` has fetched them. Registration is repeated (dispose +
 * re-register) whenever setup changes what is on disk, which also picks up
 * upstream `git pull` updates.
 */

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./paths.js').PluginDirs} dirs
 * @param {import('./types.js').PluginConfig} config
 */
export function createSkillRegistrations(ctx, dirs, config) {
  /** @type {{ disposers: Array<() => void> }} */
  const state = { disposers: [] };
  return {
    async refresh() {
      for (const dispose of state.disposers.splice(0)) dispose();
      return registerInto(ctx, dirs, config, state);
    },
    dispose() {
      for (const dispose of state.disposers.splice(0)) dispose();
    },
  };
}

const ENGINE_TAGS = {
  pptx: '[dsh-ppt-forge · engine: ppt-master (MIT)] ',
  html: '[dsh-ppt-forge · engine: guizang-ppt-skill (AGPL-3.0)] ',
  design: '[dsh-ppt-forge · engine: ppt-design-skill (MIT)] ',
};

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./paths.js').PluginDirs} dirs
 * @param {import('./types.js').PluginConfig} config
 * @param {{ disposers: Array<() => void> }} state
 * @returns {Promise<{ registered: string[], pending: string[] }>}
 */
async function registerInto(ctx, dirs, config, state) {
  const registered = [];
  const pending = [];
  for (const root of skillRoots(dirs, config)) {
    const name = skillName(config, root.route);
    const file = join(root.skillDir, 'SKILL.md');
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      pending.push(name);
      continue;
    }
    const parsed = parseFrontmatter(text);
    if (parsed === null) {
      throw new Error(`dsh-ppt-forge: ${file} has no usable frontmatter (name + description required)`);
    }
    state.disposers.push(ctx.skills.register({
      name,
      description: `${ENGINE_TAGS[root.route]}${parsed.description}`,
      source: 'custom',
      path: file,
      resourceBase: { kind: 'directory', path: root.skillDir },
      content: parsed.body,
    }));
    registered.push(name);
  }
  return { registered, pending };
}

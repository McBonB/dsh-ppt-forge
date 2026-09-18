import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

/**
 * Resolve every filesystem location the plugin manages.
 *
 * Layout under `managedDir` (default `$DSH_HOME/dsh-ppt-forge`):
 *   clones/pptx-engine/     upstream checkout (skill nested at skills/ppt-master/)
 *   clones/html-engine/     upstream checkout (SKILL.md at repo root)
 *   clones/design-engine/   sparse upstream checkout (skill/ only; the repo is
 *                           ~200 MB of example artifacts beyond it)
 *   venv/                   python virtualenv for the engine requirements
 *
 * When the config names a local checkout (`localPptxEngineDir` /
 * `localHtmlEngineDir` / `localDesignEngineDir`), that checkout is used
 * instead of a managed clone and is never written to.
 *
 * @param {import('../src/types.js').PluginConfig} config
 * @returns {import('../src/types.js').PluginDirs}
 */
export function resolveDirs(config) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const managedDir = config.managedDir !== '' ? config.managedDir : join(home, 'dsh-ppt-forge')
  const pptxEngineDir = config.localPptxEngineDir !== ''
    ? config.localPptxEngineDir
    : join(managedDir, 'clones', 'pptx-engine')
  const htmlEngineDir = config.localHtmlEngineDir !== ''
    ? config.localHtmlEngineDir
    : join(managedDir, 'clones', 'html-engine')
  const designEngineDir = config.localDesignEngineDir !== ''
    ? config.localDesignEngineDir
    : join(managedDir, 'clones', 'design-engine')
  const venvDir = join(managedDir, 'venv')
  return {
    home,
    managedDir,
    pptxEngineDir,
    pptxEngineSkillDir: join(pptxEngineDir, 'skills', 'ppt-master'),
    htmlEngineDir,
    htmlEngineSkillDir: htmlEngineDir,
    designEngineDir,
    designEngineSkillDir: join(designEngineDir, 'skill'),
    venvDir,
    venvPython: join(venvDir, 'bin', 'python'),
  }
}

/**
 * Skill roots to expose, in registration order. `skillDir` is the directory
 * holding SKILL.md; it doubles as the resource base agents resolve relative
 * asset paths against. `route` keys the Config field that names the
 * registered skill — catalog names are plugin-namespaced by default so the
 * plugin never shadows a user's personal skill with the same upstream name.
 *
 * @param {import('../src/types.js').PluginDirs} dirs
 * @param {import('../src/types.js').PluginConfig} config
 */
export function skillRoots(dirs, config) {
  const roots = []
  if (config.enablePptx) roots.push({ route: 'pptx', skillDir: dirs.pptxEngineSkillDir })
  if (config.enableHtml) roots.push({ route: 'html', skillDir: dirs.htmlEngineSkillDir })
  if (config.enableDesign) roots.push({ route: 'design', skillDir: dirs.designEngineSkillDir })
  return roots
}

/**
 * @param {import('../src/types.js').PluginConfig} config
 * @param {'pptx' | 'html' | 'design'} route
 */
export function skillName(config, route) {
  if (route === 'pptx') return config.pptxSkillName
  if (route === 'html') return config.htmlSkillName
  return config.designSkillName
}

/**
 * True when `target` is inside the plugin-managed skill space (clones +
 * venv). Generated PPT content belongs in the session workspace, never here,
 * so the tools refuse to operate on paths under the managed directory.
 *
 * @param {import('../src/types.js').PluginDirs} dirs
 * @param {string} target absolute path
 */
export function isInsideManaged(dirs, target) {
  const rel = relative(dirs.managedDir, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

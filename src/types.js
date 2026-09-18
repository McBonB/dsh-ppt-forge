/**
 * Shared JSDoc types. Type-only module — no runtime exports.
 */

/**
 * @typedef {object} PluginConfig
 * @property {string} managedDir
 * @property {string} pptxEngineRepo
 * @property {string} pptxEngineRef
 * @property {string} htmlEngineRepo
 * @property {string} htmlEngineRef
 * @property {string} localPptxEngineDir
 * @property {string} localHtmlEngineDir
 * @property {string} pythonBin
 * @property {string} pipIndexUrl
 * @property {string} pipProxy
 * @property {string} nodeBin
 * @property {boolean} createVenv
 * @property {boolean} enablePptx
 * @property {boolean} enableHtml
 * @property {string} pptxSkillName
 * @property {string} htmlSkillName
 */

/**
 * @typedef {object} PluginDirs
 * @property {string} home
 * @property {string} managedDir
 * @property {string} pptxEngineDir
 * @property {string} pptxEngineSkillDir
 * @property {string} htmlEngineDir
 * @property {string} htmlEngineSkillDir
 * @property {string} venvDir
 * @property {string} venvPython
 */

/**
 * Live presence flags shared across tools, recomputed by the runtime.
 * @typedef {object} PluginState
 * @property {boolean} pptxEnginePresent
 * @property {boolean} htmlEnginePresent
 * @property {boolean} venvPresent
 */

/**
 * Minimal shape of the execution context the host passes to `execute(args, exec)`.
 * The host owns the full type; this plugin reads only these fields.
 * @typedef {object} ToolRunContext
 * @property {unknown} callId
 * @property {string} name
 * @property {AbortSignal} signal
 * @property {{ session: { header: { cwd: string } } } | undefined} [agent]
 */

/**
 * The object index.js hands to every tool factory.
 * @typedef {object} PluginRuntime
 * @property {PluginConfig} config
 * @property {() => PluginDirs} resolveDirs
 * @property {() => PluginState} state
 * @property {() => Promise<{ registered: string[], pending: string[] }>} refreshSkills
 * @property {(message: string) => void} warn
 */

export {};

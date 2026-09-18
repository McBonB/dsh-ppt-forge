# dsh-ppt-forge

Free PPT generation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). 英文说明在前,中文说明见后半部分。

`dsh-ppt-forge` is a thin orchestration plugin, not a generator itself. It mounts two mature upstream agent skills into your dsh session and wires their deterministic gates into dsh's tool pipeline:

| Capability | Upstream skill (engine) | Registered as | Output |
|---|---|---|---|
| Native editable PPTX (SVG→DrawingML), template fill, byte-exact editing of existing decks | [ppt-master](https://github.com/hugohe3/ppt-master) (MIT) | `dsh-ppt-forge-pptx` | `.pptx` under `<project>/exports/` |
| Single-file HTML deck, magazine or Swiss style, presenter mode | [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) (AGPL-3.0) | `dsh-ppt-forge-html` | `index.html` (browser-only viewing) |

Skill catalog names are **plugin-namespaced by default** (`dsh-ppt-forge-pptx` / `dsh-ppt-forge-html`, configurable via `pptxSkillName` / `htmlSkillName`): the plugin never shadows a personal skill you may already have under the upstream name, and each catalog entry carries an `[dsh-ppt-forge · engine: …]` tag with the upstream credit. The upstream checkouts themselves stay byte-for-byte pristine.

The model in your dsh session does the authoring — there is no extra API cost beyond your normal agent usage, and no model key is added by this plugin.

## How it works

```
your dsh profile
└── dsh-ppt-forge (this plugin, MIT)
    ├── skill registry: registers both upstream SKILL.md files (unmodified)
    ├── ppt_setup        git-clone both skills, create venv, pip install, refresh registration
    ├── pptx_export      wraps svg_to_pptx.py (final + --roundtrip export)
    ├── ppt_quality_check  wraps svg_quality_checker.py (--json gates)
    └── html_ppt_validate  wraps validate-swiss-deck.mjs + validate-presenter-mode.mjs
```

Everything else (slide authoring, workflow routing, image handling, preview servers) is driven by the skills' own instructions through the agent — exactly as their authors intended. The skill checkouts stay verbatim from upstream:

**Where content lives.** The plugin manages only the two clean upstream clones and a venv under `$DSH_HOME/dsh-ppt-forge/`. Everything you generate — ppt-master project folders (`<name>_<date>/` with `exports/`), HTML decks, images — is created under your session workspace (the directory you launched dsh from), never inside this plugin's package or the managed clones; the export/check tools actively refuse paths inside the managed skill space. Launch dsh from a dedicated working directory (e.g. `~/ppt-lab`) to keep experiments contained.

- **ppt-master** ships an attribution integrity gate (`attribution_guard.py`) that hard-fails if its LICENSE/SPONSORS/SKILL.md metadata is modified. This plugin never touches those files, so the gate always passes.
- **guizang-ppt-skill** is AGPL-3.0. This plugin does not vendor, modify, or redistribute its code; your checkout is fetched directly from upstream and remains under its license. If you redistribute or modify that skill yourself, review AGPL-3.0 (including §13, network use) first.
- ppt-master's optional PDF import dependency (PyMuPDF) is AGPL-3.0; it is installed by `pip install -r requirements.txt` per upstream defaults. Skip it if you never import PDF sources (see upstream requirements.txt notes).

## Install

Requires a working dsh (`npx @deepseek-ai/dsh web` era, developer preview), git, Python 3.10+, and Node 20+.

```sh
dsh plugin --profile default add dsh-ppt-forge   # or: add github:<you>/dsh-ppt-forge
```

Then, inside a dsh session, ask the agent to run the setup tool once (or say "run ppt_setup"):

```text
Set up dsh-ppt-forge: run ppt_setup, then confirm both skills are registered.
```

`ppt_setup` clones both repositories under `$DSH_HOME/dsh-ppt-forge/clones/` (shallow), creates `$DSH_HOME/dsh-ppt-forge/venv/`, installs ppt-master's requirements, and registers the skills. It is idempotent — run it again after config changes or upstream updates (`git -C <clone> pull` yourself, then re-run `ppt_setup` to re-register).

## Configuration

Override the `dsh-ppt-forge` row from any later layer (profile `cordis.patch.yml`, `$DSH_HOME/cordis.patch.yml`, or `--patch`). Remember: a patch replaces the whole config block, so restate every key.

```yaml
- id: dsh-ppt-forge
  config:
    localPptMasterDir: '/absolute/path/to/ppt-master'   # use an existing checkout
    localGuizangDir: '/absolute/path/to/guizang-ppt-skill'
    enableHtml: true
    enablePptx: true
```

| Field | Default | Meaning |
|---|---|---|
| `managedDir` | `$DSH_HOME/dsh-ppt-forge` | Where clones and the venv live |
| `pptxEngineRepo` / `pptMasterRef` | upstream URL / '' | Clone source for the PPTX engine (branch or tag) |
| `htmlEngineRepo` / `guizangRef` | upstream URL / '' | Clone source for the HTML-deck engine |
| `localPptxEngineDir` / `localHtmlEngineDir` | '' | Offline-dev escape hatch: existing checkouts to use instead of cloning (must exist at load; never written to). Prefer managed clones — personal checkouts mix your generated content into skill space |
| `pythonBin` / `nodeBin` | `python3` / `node` | Interpreter candidates (`pythonBin` must be >= 3.10; setup auto-probes common names and install locations) |
| `pipIndexUrl` | '' | pip `-i` index for venv installs; set when your mirror lags behind PyPI |
| `pipProxy` | '' | pip proxy: '' = inherit (incl. OS proxy), `'direct'` = disable proxying, or an explicit URL |
| `createVenv` | `true` | Dedicated venv for ppt-master requirements |
| `enablePptx` / `enableHtml` | `true` / `true` | Mount each skill and its tools independently |
| `pptxSkillName` / `htmlSkillName` | `dsh-ppt-forge-pptx` / `dsh-ppt-forge-html` | Registered catalog names (kebab-case); rename if they collide with your own skills |

## Tools

| Tool | Wraps | Notes |
|---|---|---|
| `ppt_setup` | git clone, venv, pip | `checkOnly: true` for a status report |
| `pptx_export` | `svg_to_pptx.py` | flags: `roundtrip`, `quickGenerate`, `nativeChartsAndTables`, `noNotes`, `extraArgs` |
| `ppt_quality_check` | `svg_quality_checker.py` | modes: `canonical-authoring` / `roundtrip` / `template-mode` / `quick-generate`; stages: `early` / `final` |
| `html_ppt_validate` | `validate-swiss-deck.mjs`, `validate-presenter-mode.mjs` | `validators`, `targetMinutes`, `allowExperimental` |

## Developing

```sh
npm run check   # syntax check every module (zero-dependency)
npm test        # frontmatter parser tests against upstream shapes
```

Local end-to-end: launch dsh from a scratch workspace with an overlay (see `dev/cordis.yml` for a restricted-network variant that clones via SSH over 443):

```sh
mkdir -p ~/ppt-lab && cd ~/ppt-lab
npx @deepseek-ai/dsh web --patch /path/to/dsh-ppt-forge/dev/cordis.yml
```

The plugin has exactly one runtime dependency (`@deepseek-ai/schemastery`, for the config schema). Tool definitions are registered through the raw JSON-Schema path of `ctx.tools.register()` via a local `define-tool.js` factory — deliberately NOT through `@deepseek-ai/dsh-tools`, whose published build carries a peer closure that pnpm cannot fully install for out-of-tree packages.

> **Node version**: the published `dsh` CLI requires Node ^22.19 || >=24 (its entry gates on `import.meta.main`; on Node 23.x it exits silently doing nothing). On macOS with Homebrew: `/opt/homebrew/opt/node@24/bin/node`.

## 中文说明

`dsh-ppt-forge` 是 DeepSeek Harness 的 PPT 生成插件:把 ppt-master(生成原生可编辑 PPTX)和 guizang-ppt-skill(生成单文件 HTML 网页 PPT)两个开源技能原样挂载进 dsh,并提供 `ppt_setup` / `pptx_export` / `ppt_quality_check` / `html_ppt_validate` 四个工具。创作由你 dsh 会话里的模型完成,无额外模型成本。

**内容落点**:插件只管理 `$DSH_HOME/dsh-ppt-forge/` 下两个干净的上游克隆和 venv;你生成的所有内容(ppt-master 项目目录、导出、HTML 演示稿)都落在会话工作目录(启动 dsh 的目录),绝不进插件包和技能克隆——导出/检查工具会主动拒绝托管目录内的路径。建议在专用目录(如 `~/ppt-lab`)启动 dsh 做实验。

安装:`dsh plugin --profile default add dsh-ppt-forge`,然后在会话里让 agent 执行一次 `ppt_setup`(克隆两个技能仓库、建 Python venv、装依赖、注册技能)。默认克隆到 `$DSH_HOME/dsh-ppt-forge/`;如需临时指向已有 checkout 做离线开发,用 `localPptxEngineDir` / `localHtmlEngineDir`(日常不建议,那会把个人生成物混进技能目录)。

许可:本插件 MIT。两个技能仓库始终以原样从上游获取并保留各自协议——ppt-master 为 MIT(其署名完整性校验要求文件不被修改,本插件从不触碰);guizang-ppt-skill 为 AGPL-3.0(本插件不分发、不修改其代码;如你自行修改或再分发该技能,请先确认 AGPL-3.0 义务,含第 13 条网络使用条款)。

## License

MIT — see [LICENSE](LICENSE). Upstream skills keep their own licenses (ppt-master: MIT; guizang-ppt-skill: AGPL-3.0); this plugin distributes none of their code.

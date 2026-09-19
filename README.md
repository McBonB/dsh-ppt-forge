# dsh-ppt-forge

English | [简体中文](README.zh.md)

Free PPT generation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) — one plugin, a design dialogue up front, then three battle-tested generation routes. The model in your dsh session does the authoring: no extra API cost beyond your normal agent usage, and no model key is added by this plugin.

## What you get

`dsh-ppt-forge` is a thin orchestration plugin. It mounts three mature upstream agent skills into your dsh session and wires their deterministic gates into the tool pipeline:

| Route | Registered skill | Output |
|---|---|---|
| **Native PPTX** — SVG→DrawingML compilation, template fill, byte-exact editing of existing decks | `dsh-ppt-forge-pptx` | `.pptx` under `<project>/exports/` |
| **HTML deck** — single-file horizontal-swipe deck, magazine or Swiss style, presenter mode with audience sync | `dsh-ppt-forge-html` | `index.html` (runs in any browser) |
| **Design-led PPTX** — style-atom theming, pixel-placed authoring, acceptance-gated delivery | `dsh-ppt-forge-design` | `.pptx` + reproducible build script + PDF/PNG artifacts |

Each route's strengths:

- **Native PPTX** — the model hand-authors each slide as compact SVG over 187 Office shape presets; a deterministic compiler emits fully editable native charts, tables, formulas, and masters. A round-trip path edits existing decks with byte-exact passthrough for unchanged objects.
- **HTML deck** — two locked visual systems (serif magazine / Swiss grid), WebGL backgrounds, declarative animation recipes, speaker notes with a full presenter/audience runtime, all embedded in one self-contained HTML file.
- **Design-led PPTX** — a curated design-atom database (84 styles × 192 palettes × 74 typography pairings ≈ 1.2M combinations) plus a theme composer that locks one resolved theme per deck; pixel-perfect Build Mode placing every element at explicit coordinates; FreeStyle fast drafts; VI mode that extracts a template's design DNA and merges new pages under protected precedence; composition recipes and a brief-driven acceptance workflow (MUST/SHOULD/NICE_TO_HAVE conditions checked against rendered slides).

**The design dialogue comes first.** The plugin also registers its own router skill (`dsh-ppt-forge`, the only content authored by this project): for every new presentation request the agent runs a format decision (edit afterwards? browser delivery? corporate template?), collects a format-agnostic design brief (audience, scenario, tone, density), and then hands off to the matching engine skill. Aesthetic tokens are deliberately not unified — each engine resolves design in its own vocabulary, so the brief stays semantic and every engine consumes it natively.

Catalog names are **plugin-namespaced by default** (configurable via `pptxSkillName` / `htmlSkillName` / `designSkillName` / `routerSkillName`), so the plugin never shadows a personal skill you may already have under an upstream name. Each engine entry carries an `[dsh-ppt-forge · engine: …]` tag with the upstream credit.

## How it works

```
your dsh profile
└── dsh-ppt-forge (this plugin, MIT)
    ├── skill registry: the plugin-authored router skill (design dialogue)
    │   └── format decision + design brief + handoff to one engine below
    ├── upstream SKILL.md files (unmodified)
    ├── ppt_setup          clone the skills (design route: sparse, skill/ only), create venv, pip install, refresh registration
    ├── pptx_export        wraps svg_to_pptx.py (final + --roundtrip export)
    ├── ppt_quality_check  wraps svg_quality_checker.py (--json gates)
    └── html_ppt_validate  wraps validate-swiss-deck.mjs + validate-presenter-mode.mjs
```

Everything else — slide authoring, workflow routing, image handling, preview — is driven by the skills' own instructions through the agent, exactly as their authors intended.

**Where content lives.** The plugin manages only the clean upstream clones and a venv under `$DSH_HOME/dsh-ppt-forge/`. Everything you generate is created under your session workspace (the directory you launched dsh from), never inside the plugin package or the managed clones; the export/check tools actively refuse paths inside the managed skill space. Launch dsh from a dedicated working directory (e.g. `~/ppt-lab`) to keep experiments contained.

## Install

Requires a working dsh, git, Python 3.10+, and Node 20+.

```sh
dsh plugin --profile default add dsh-ppt-forge   # or: add github:McBonB/dsh-ppt-forge
```

Then, inside a dsh session, ask the agent to run the setup tool once (or say "run ppt_setup"):

```text
Set up dsh-ppt-forge: run ppt_setup, then confirm the router and all three engine skills are registered.
```

`ppt_setup` clones the skill repositories (shallow; the design route clones sparsely, fetching only `skill/`), creates `$DSH_HOME/dsh-ppt-forge/venv/`, installs engine requirements, and registers the skills. It is idempotent — run it again after config changes or upstream updates (`git -C <clone> pull` yourself, then re-run `ppt_setup` to re-register).

## Configuration

Override the `dsh-ppt-forge` row from any later layer (profile `cordis.patch.yml`, `$DSH_HOME/cordis.patch.yml`, or `--patch` overlays). A patch replaces the whole config block, so restate every key.

```yaml
- id: dsh-ppt-forge
  config:
    enableDesign: true
    enableHtml: true
    enablePptx: true
```

| Field | Default | Meaning |
|---|---|---|
| `managedDir` | `$DSH_HOME/dsh-ppt-forge` | Where clones and the venv live |
| `pptxEngineRepo` / `pptxEngineRef` | upstream URL / '' | Clone source for the native-PPTX route (branch or tag) |
| `htmlEngineRepo` / `htmlEngineRef` | upstream URL / '' | Clone source for the HTML-deck route |
| `designEngineRepo` / `designEngineRef` | upstream URL / '' | Clone source for the design route (sparse clone: only `skill/`) |
| `localPptxEngineDir` / `localHtmlEngineDir` / `localDesignEngineDir` | '' | Offline-dev escape hatch: existing checkouts to use instead of cloning (must exist at load; never written to) |
| `pythonBin` / `nodeBin` | `python3` / `node` | Interpreter candidates (`pythonBin` must be >= 3.10; setup auto-probes common names and install locations) |
| `pipIndexUrl` | '' | pip `-i` index for venv installs; set when your mirror lags behind PyPI |
| `pipProxy` | '' | pip proxy: '' = inherit (incl. OS proxy), `'direct'` = disable proxying, or an explicit URL |
| `createVenv` | `true` | Dedicated venv for engine requirements |
| `enablePptx` / `enableHtml` / `enableDesign` | `true` | Mount each route's skill (and its tools) independently |
| `enableRouter` / `routerSkillName` | `true` / `dsh-ppt-forge` | The plugin-authored design-dialogue router skill |
| `pptxSkillName` / `htmlSkillName` / `designSkillName` | `dsh-ppt-forge-pptx` / `-html` / `-design` | Registered catalog names (kebab-case); rename if they collide with your own skills |

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
npm test        # frontmatter parser tests (synthetic fixtures covering both structural shapes)
```

Local end-to-end: launch dsh from a scratch workspace with an overlay (see `dev/cordis.yml` for a restricted-network variant that clones via SSH over 443):

```sh
mkdir -p ~/ppt-lab && cd ~/ppt-lab
npx @deepseek-ai/dsh web --patch /path/to/dsh-ppt-forge/dev/cordis.yml
```

The plugin has exactly one runtime dependency (`@deepseek-ai/schemastery`, for the config schema). Tool definitions are registered through the raw JSON-Schema path of `ctx.tools.register()` via a local `define-tool.js` factory — deliberately NOT through `@deepseek-ai/dsh-tools`, whose published build carries a peer closure that pnpm cannot fully install for out-of-tree packages.

> **Node version**: the published `dsh` CLI requires Node ^22.19 || >=24 (its entry gates on `import.meta.main`; on Node 23.x it exits silently doing nothing). On macOS with Homebrew: `/opt/homebrew/opt/node@24/bin/node`.

## Licensing

MIT — see [LICENSE](LICENSE). This plugin never modifies or redistributes upstream skill code; every checkout is fetched verbatim from its own repository and keeps its own license:

- [ppt-master](https://github.com/hugohe3/ppt-master) (native-PPTX route) — MIT. It ships an attribution integrity gate that hard-fails if its LICENSE/SPONSORS/SKILL.md metadata is modified; this plugin never touches those files, so the gate always passes. Its optional PDF-import dependency (PyMuPDF) is AGPL-3.0 and only installed via upstream requirements defaults.
- [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) (HTML-deck route) — AGPL-3.0. If you redistribute or modify that skill yourself, review AGPL-3.0 (including §13, network use) first.
- [PPT-Design-Skill](https://github.com/sunchaokun/PPT-Design-Skill) (design route) and its authoring package `pptx-designer` (PyPI) — MIT.

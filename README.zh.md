# dsh-ppt-forge

[English](README.md) | 简体中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(dsh)的免费 PPT 生成插件——设计对话先行,随后四条久经考验的生成路线。创作由你 dsh 会话里的模型完成:无额外模型成本,本插件也不引入任何模型密钥。

## 你能得到什么

`dsh-ppt-forge` 是一个薄编排层插件。它把四个成熟的开源 agent 技能挂载进你的 dsh 会话,并把它们的确定性质量门接入工具管线:

| 路线 | 注册技能名 | 产物 |
|---|---|---|
| **原生 PPTX** —— SVG→DrawingML 编译、模板填充、对现有文稿字节级保真回改 | `dsh-ppt-forge-pptx` | `<project>/exports/` 下的 `.pptx` |
| **HTML 演示稿** —— 单文件横滑网页 PPT,杂志风/瑞士风双体系,演讲者模式 + 观众屏同步 | `dsh-ppt-forge-html` | `index.html`(任意浏览器直接放映) |
| **设计主导 PPTX** —— 风格原子主题化、像素级摆放创作、验收门交付 | `dsh-ppt-forge-design` | `.pptx` + 可复现构建脚本 + PDF/PNG 产物 |
| **演示 HTML** —— 经典 16:9 固定舞台、精选模板设计库、PPTX→HTML 重制、Playwright 导出 PDF | `dsh-ppt-forge-slides` | 单文件 `index.html`(+ 可选 PDF) |

各路线的独到之处:

- **原生 PPTX** —— 模型基于 187 个 Office 形状预设逐页手写紧凑 SVG;确定性编译器输出完全可编辑的原生图表、表格、公式与母版。round-trip 路线回改现有文稿时,未改动对象逐字节保真透传。
- **HTML 演示稿** —— 两套锁定视觉体系(衬线杂志风 / 瑞士网格),WebGL 背景、声明式动效配方、带完整演讲者/观众双端运行时的讲稿系统,全部内嵌在一个自包含 HTML 文件里。
- **设计主导 PPTX** —— 精选设计原子库(84 风格 × 192 配色 × 74 字体搭配,约 120 万种组合)+ 主题合成器(每份文稿锁定一个解析后的主题);Build 模式按显式坐标像素级放置每个元素;FreeStyle 模式快速出稿;VI 模式提取企业模板的设计 DNA 并以保护性优先级合并新页面;构图配方,以及由需求驱动的验收工作流(MUST/SHOULD/NICE_TO_HAVE 条件对照渲染结果逐条核验)。

**设计对话先行**:插件还注册了一个自研路由技能(`dsh-ppt-forge`,本项目唯一自著内容)——对每个新的演示请求,agent 先做格式判定(交付后还要编辑吗?浏览器放映?企业模板合规?),再收集一份与格式无关的设计简报(受众、场景、调性、密度),然后移交给匹配的引擎技能。设计 token 刻意不做统一——各引擎以自己的美学词汇消化简报,语义层的简报对所有引擎原生可用。

目录名默认**采用插件命名空间**(可通过 `pptxSkillName` / `htmlSkillName` / `designSkillName` / `slidesSkillName` / `routerSkillName` 配置),不会遮蔽你已有的同名个人技能;每条引擎目录都带 `[dsh-ppt-forge · engine: …]` 署名标签。

## 工作原理

```
你的 dsh profile
└── dsh-ppt-forge(本插件,MIT)
    ├── 技能注册表: 插件自研路由技能(设计对话)
    │   └── 格式判定 + 设计简报 + 移交到下方某一引擎
    ├── 上游 SKILL.md(原样,不作修改)
    ├── ppt_setup          克隆技能仓库(design 路线: 稀疏克隆,只取 skill/)、建 venv、pip 安装、刷新注册
    ├── pptx_export        包装 svg_to_pptx.py(终稿导出 + --roundtrip 回改导出)
    ├── ppt_quality_check  包装 svg_quality_checker.py(--json 质量门)
    └── html_ppt_validate  包装 validate-swiss-deck.mjs + validate-presenter-mode.mjs
```

其余一切——幻灯片创作、工作流路由、配图、预览——都由各技能自己的指令通过 agent 驱动,与其作者的设计完全一致。

**内容落点**:插件只管理 `$DSH_HOME/dsh-ppt-forge/` 下的干净上游克隆和 venv。你生成的所有内容都落在会话工作目录(启动 dsh 的目录),绝不进插件包和技能克隆——导出/检查工具会主动拒绝托管目录内的路径。建议在专用目录(如 `~/ppt-lab`)启动 dsh 做实验。

## 安装

需要可用的 dsh、git、Python 3.10+ 和 Node 20+。

```sh
dsh plugin --profile default add dsh-ppt-forge   # 或: add github:McBonB/dsh-ppt-forge
```

然后在 dsh 会话里让 agent 执行一次安装工具(或直接说 "run ppt_setup"):

```text
Set up dsh-ppt-forge: run ppt_setup, then confirm the router and all three engine skills are registered.
```

`ppt_setup` 会克隆技能仓库(浅克隆;design 路线稀疏克隆,只拉取 `skill/`),创建 `$DSH_HOME/dsh-ppt-forge/venv/`,安装引擎依赖并注册技能。它是幂等的——改配置或上游更新后(`git -C <clone> pull`)再跑一次即可重新注册。

## 配置

在任意更上层(profile 的 `cordis.patch.yml`、`$DSH_HOME/cordis.patch.yml` 或 `--patch` 覆盖层)覆盖 `dsh-ppt-forge` 行。注意:补丁会整块替换 config,需重述全部键。

```yaml
- id: dsh-ppt-forge
  config:
    enableDesign: true
    enableHtml: true
    enablePptx: true
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `managedDir` | `$DSH_HOME/dsh-ppt-forge` | 克隆与 venv 的存放位置 |
| `pptxEngineRepo` / `pptxEngineRef` | 上游 URL / '' | 原生 PPTX 路线的克隆源(分支或标签) |
| `htmlEngineRepo` / `htmlEngineRef` | 上游 URL / '' | HTML 演示稿路线的克隆源 |
| `designEngineRepo` / `designEngineRef` | 上游 URL / '' | design 路线的克隆源(稀疏克隆:仅 `skill/`) |
| `slidesEngineRepo` / `slidesEngineRef` | 上游 URL / '' | 演示 HTML 路线的克隆源 |
| `localPptxEngineDir` / `localHtmlEngineDir` / `localDesignEngineDir` / `localSlidesEngineDir` | '' | 离线开发逃生口:改用已有 checkout(加载时必须存在;绝不写入) |
| `pythonBin` / `nodeBin` | `python3` / `node` | 解释器候选(`pythonBin` 须 >= 3.10;setup 会自动探测常见名称与安装位置) |
| `pipIndexUrl` | '' | venv 安装的 pip `-i` 源;镜像滞后于 PyPI 时设置 |
| `pipProxy` | '' | pip 代理:'' = 继承(含系统代理),`'direct'` = 禁用代理,或显式代理 URL |
| `createVenv` | `true` | 为引擎依赖创建专用 venv |
| `enablePptx` / `enableHtml` / `enableDesign` / `enableSlides` | `true` | 独立挂载各路线的技能(及其工具) |
| `enableRouter` / `routerSkillName` | `true` / `dsh-ppt-forge` | 插件自研的设计对话路由技能 |
| `pptxSkillName` / `htmlSkillName` / `designSkillName` / `slidesSkillName` | `dsh-ppt-forge-pptx` / `-html` / `-design` / `-slides` | 注册目录名(kebab-case);与你的技能撞名时可改 |

## 工具

| 工具 | 包装 | 说明 |
|---|---|---|
| `ppt_setup` | git clone、venv、pip | `checkOnly: true` 仅报告状态 |
| `pptx_export` | `svg_to_pptx.py` | flags: `roundtrip`、`quickGenerate`、`nativeChartsAndTables`、`noNotes`、`extraArgs` |
| `ppt_quality_check` | `svg_quality_checker.py` | modes: `canonical-authoring` / `roundtrip` / `template-mode` / `quick-generate`;stages: `early` / `final` |
| `html_ppt_validate` | `validate-swiss-deck.mjs`、`validate-presenter-mode.mjs` | `validators`、`targetMinutes`、`allowExperimental` |

## 开发

```sh
npm run check   # 全模块语法检查(零依赖)
npm test        # frontmatter 解析器测试(合成 fixture 覆盖两种结构形状)
```

本地端到端:在临时工作目录用覆盖层启动 dsh(受限网络见 `dev/cordis.yml`,走 SSH over 443 克隆):

```sh
mkdir -p ~/ppt-lab && cd ~/ppt-lab
npx @deepseek-ai/dsh web --patch /path/to/dsh-ppt-forge/dev/cordis.yml
```

本插件只有一个运行时依赖(`@deepseek-ai/schemastery`,用于配置 schema)。工具定义通过 `ctx.tools.register()` 的裸 JSON-Schema 路径、经由本地 `define-tool.js` 工厂注册——刻意不用 `@deepseek-ai/dsh-tools`,其发布版携带的 peer 闭包对树外包而言 pnpm 无法完整安装。

> **Node 版本**:已发布的 `dsh` CLI 要求 Node ^22.19 || >=24(入口依赖 `import.meta.main`;在 Node 23.x 上会静默退出、什么都不做)。macOS Homebrew 环境可用 `/opt/homebrew/opt/node@24/bin/node`。

## 许可

MIT——见 [LICENSE](LICENSE)。本插件从不修改、不再分发上游技能代码;每份 checkout 都从各自仓库原样获取并保留原协议:

- [ppt-master](https://github.com/hugohe3/ppt-master)(原生 PPTX 路线)—— MIT。它内置署名完整性门禁,其 LICENSE/SPONSORS/SKILL.md 元数据被改动即硬失败;本插件从不触碰这些文件,门禁恒通过。其可选 PDF 导入依赖(PyMuPDF)为 AGPL-3.0,仅随上游 requirements 默认项安装。
- [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill)(HTML 演示稿路线)—— AGPL-3.0。如你自行修改或再分发该技能,请先审阅 AGPL-3.0 义务(含第 13 条网络使用条款)。
- [PPT-Design-Skill](https://github.com/sunchaokun/PPT-Design-Skill)(design 路线)及其创作包 `pptx-designer`(PyPI)—— MIT。
- [frontend-slides](https://github.com/zarazhangrui/frontend-slides)(演示 HTML 路线)—— MIT。

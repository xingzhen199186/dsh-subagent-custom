<div align="center">

<!-- 项目 Logo 占位 -->
<img src="docs/images/logo.png" alt="dsh-subagent-custom Logo" width="120" height="120" onerror="this.style.display='none'" />

# dsh-subagent-custom
### DeepSeek Harness 子代理模型管控与 Jev 智能分流插件

<p align="center">
  专为 <strong>DeepSeek Harness 用户与开发者</strong> 打造的 <strong>子代理模型决策与分流扩展</strong>，解决 <strong>子代理无法独立选型、复杂任务与琐碎任务共用高配主模型导致算力浪费与响应缓慢</strong> 的痛点。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg?style=flat-square" alt="Node.js Version">
  <img src="https://img.shields.io/badge/version-0.1.0-orange.svg?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/tests-97%20passed-success.svg?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/status-active%20development-informational.svg?style=flat-square" alt="Status">
</p>

<p align="center">
  <a href="#-背景与痛点-why">背景与痛点</a> •
  <a href="#-核心特性-features">核心特性</a> •
  <a href="#-效果预览-preview">效果预览</a> •
  <a href="#-快速上手-quick-start">快速上手</a> •
  <a href="#-使用指南-usage">使用指南</a> •
  <a href="#-核心机制与判定流转">核心机制与判定流转</a> •
  <a href="#-离线策略回放-jev-replay">离线策略回放</a> •
  <a href="#-开发与测试">开发与测试</a> •
  <a href="#-路线图-roadmap">路线图</a> •
  <a href="#-由来与致谢-provenance">由来与致谢</a> •
  <a href="#-贡献指南-contributing">贡献指南</a> •
  <a href="#-开源协议-license">开源协议</a>
</p>

</div>

---

## 📌 背景与痛点 (Why?)

在 DeepSeek Harness (DSH) 原生的多智能体调度与协作体系中，派发子代理（Subagent）通常面临以下结构性痛点：

1. **子代理无法独立选型**：原生子代理往往只能默认继承父级主模型的配置或调用方传参，用户无法根据子任务属性为子代理灵活绑定专用模型。
2. **高阶算力浪费与响应成本高昂**：格式化排版、变量重命名、常规查阅等琐碎机械型任务，与深度业务架构设计同样依赖高配主模型执行，不仅消耗珍贵的高阶模型配额，还延长了整体响应耗时。
3. **分流缺乏工程化防御与硬性隔离**：依赖大模型自身在 Prompt 里自我判断何时派发子任务，速度缓慢且容易产生幻觉。当任务涉及敏感凭据泄露或破坏性操作风险时，缺乏确定性的前置安全门禁与拦截策略。

**`dsh-subagent-custom`** 针对上述问题构建了一套前置判定与模型重写方案。它接入 TypeSafe System One 架构的 Jev 分类器，在毫秒级时延内对用户任务完成多维结构化评估；同时在底层拦截并硬性改写子代理的模型与推理参数，实现子代理选型的精细化管控。

---

## ✨ 核心特性 (Features)

- ⚡ **底层请求级硬性改写**：基于 DSH 核心钩子 `agent/request` 拦截请求，直接改写子代理的 `provider`、`model` 与 `reasoningEffort`，覆盖调用方的默认传参，确保调度决策百分之百落地。
- 🧠 **Jev 语义极速判型**：接入 Jev 判定模型，对任务类别（Task Class）、工作量（Effort）、爆炸半径（Blast Radius）与高危属性（Risky）展开结构化判定，毫秒级得出评估结果。
- 🎛️ **双层管控开关解耦**：
  - **插件级激活模式**（`mode`）：控制后台分类器的侦听行为（`off` 关闭、`once` 按触发词判定、`auto` 全自动评估）。
  - **会话级选择器模式**（写在配置的 `selections.<会话>.mode` 里，由输入框上方的选择器写入）：控制当前会话对子代理模型的绑定行为（`inherit` 继承主模型、`auto` 依 Jev 判定自动映射、`manual` 手动指定固定模型与思考程度）。
- ⚖️ **「三点对齐」派发防御法则**：必须同时满足目标角色有合法模型、任务类别映射该角色、活跃档位白名单放行该类别，三者缺一绝不放行，杜绝意外派发。
- 🛡️ **隐私脱敏与静默放行（Fail-Open）**：进入判定前自动对 API Key、Token、Bearer 等凭据特征执行正则脱敏，并实施字符上限裁剪；判定超时（默认 4000 ms）或网络异常时静默放行，主会话正常流转绝不阻断。
- 🔄 **预设类别平滑自动补入**：升级时自动补全出厂预设中新增的任务类别与允许清单，采用增量补齐策略，不放宽用户收紧的档位规则，使用 `adoptedClasses` 防重标记保障幂等性。
- 🖥️ **全功能 Web GUI 与三语本地化**：深度注入 DSH Web 界面，包含输入框上方的模式切换器、会话标题栏状态徽章、右侧边栏专属标签页（状态、角色矩阵与最近 20 条派发流水），完整支持中文、英文、俄语。

---

## 🖼️ 效果预览 (Preview)

<!-- TODO: 添加交互界面实际截图或 GIF 动图，存放于 docs/images 目录 -->
| 输入框模式切换器 | 会话状态徽章与边栏流水 | 插件可视化设置卡片 |
| :---: | :---: | :---: |
| ![输入框选择器占位](docs/images/preview-picker.png) | ![边栏流水占位](docs/images/preview-sidebar.png) | ![设置面板占位](docs/images/preview-settings.png) |
| *位于主模型选择器右侧，支持继承/自动/手动三模切换* | *标题栏显示生效状态，边栏记录最近 20 条派发流水* | *支持配置决策档位、提供商预设、角色映射与问卷* |

> 💡 *注：上述截图为占位示意，发布前请把真实界面截图放进 `docs/images/` 目录并替换对应路径。*

---

## 🚀 快速上手 (Quick Start)

### 环境依赖

- **Node.js**：`>= 22.0.0`
- **包管理器**：`pnpm`（建议 `>= 9.0.0`）
- **宿主系统**：DeepSeek Harness (DSH) `^0.1.7-rc.2` 或兼容版本
- **核心 Peer 依赖**：
  - `@deepseek-ai/schemastery`: `>=3.18.1`
  - `@deepseek-ai/dsh-typert-protocol`: `>=0.1.7-rc.2 <0.3.0`
  - `@deepseek-ai/dsh-llm`: `^0.2.0-rc.2 || >=0.1.0-rc.6 <0.2.0`（可选）

### 安装与加载步骤

本项目当前未发布至 npm 官方注册表，请以本地打包或源码引用形式安装：

1. **获取源码并编译客户端资源**：
   ```bash
   git clone https://github.com/xingzhen199186/dsh-subagent-custom.git
   cd dsh-subagent-custom
   pnpm install
   node scripts/build-client.mjs
   ```

2. **打包生成插件安装包**：
   ```bash
   pnpm pack
   ```
   执行完成后在项目根目录生成 `dsh-subagent-custom-0.1.0.tgz`。

3. **在 DSH 桌面端安装插件**：
   - 打开 DSH 桌面客户端，进入「插件管理」页面；
   - 点击「安装本地包」，选择生成的 `dsh-subagent-custom-0.1.0.tgz` 上传并确认安装。

> ⚠️ **注意**：
> 插件包含宿主侧（Node.js 服务端）拦截逻辑。安装本地包或更新宿主侧核心代码后，**必须重启 DSH 桌面端应用**，宿主侧注入服务方可完全生效。

---

## ⚙️ 使用指南 (Usage)

### 1. 模式体系辨析：双层开关控制

本插件包含两个层级不同、职责分明的开关体系，请避免混淆：

| 控制维度 | 开关配置位置 | 可选枚举值 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **插件全局侦听模式** | 插件全局设置面板 (`config.mode`) | `off` / `once` / `auto` | 控制**后台判定服务何时介入**：<br>• `off`：完全关闭监听与判定，零调用开销；<br>• `once`：仅当用户输入命中触发词（如 `/route`、`/jev`）时单次评估；<br>• `auto`：对每一轮用户普通输入均进行判定。 |
| **会话模型绑定模式** | 对话输入框上方选择器（写入配置的 `selections.<会话>.mode`） | `inherit` / `auto` / `manual` | 控制**当前会话如何约束子代理模型**：<br>• `inherit`：继承主模型或调用方原有参数，不强行重写；<br>• `auto`：依据 Jev 判定结果，自动挂载预设角色与对应模型；<br>• `manual`：会话内固定锁定用户选定的模型与思考程度。 |

---

### 2. 角色路由与任务类别矩阵

出厂预置 **5 个角色** 与 **8 种任务类别**。设计遵循「角色代表执行者身份（Worker），类别代表具体工作性质（Work）」原则：

| 角色名称 (`Role`) | 默认绑定模型示例 | 承接的任务类别 (`Task Class`) | 出厂策略状态 |
| :--- | :--- | :--- | :--- |
| **`junior`** | `openrouter/qwen3.8-flash` | `mechanical`（格式化、重命名、样板代码、注释整理等有明确规约的机械改动） | 默认派发 |
| **`implementer`** | `openrouter/deepseek-v4-flash` | `bugfix`（根因已知、改动范围可控的缺陷修复） | 默认派发（兜底角色） |
| **`researcher`** | `openrouter/qwen3.8-flash` | `research`（查阅代码、收集事实、对比方案，不做代码修改） | 默认派发 |
| **`reviewer`** | `openrouter/qwen3.8-flash` | `review`（审查已有代码差异、PR 或技术方案，指出缺陷而非动手修复） | 默认派发 |
| **`writer`** | `openrouter/qwen3.8-flash` | `documentation`（编写或修订面向读者的 README、发布说明、Changelog 等） | 默认派发 |
| *(无绑定角色)* | *(由主模型承接)* | **`feature_work`**（引入产品新行为的新增功能开发） | **出厂故意闲置**，交给主模型 |
| *(无绑定角色)* | *(由主模型承接)* | **`refactor`**（不改变对外行为的代码重构，涉及设计权衡） | **出厂故意闲置**，交给主模型 |
| *(无绑定角色)* | *(由主模型承接)* | **`meta_chat`**（闲聊、问答或单纯规划，本轮不产生代码任务） | **出厂故意闲置**，交给主模型 |

> 💡 **设计说明**：
> - `junior` 与 `implementer` 虽均涉及代码修改，但机械性修改规格清晰无须深度排查，而缺陷修复需要排查根因。拆分后可避免为简单重命名支付高昂算力成本。
> - `feature_work`、`refactor` 与 `meta_chat` 涉及复杂系统设计与全局上下文，出厂默认不在派发白名单内，**故意留给主模型自身处理**。

---

### 3. 核心配置参数表

支持在 DSH 插件设置页或配置补丁中调整以下参数：

| 配置字段 (`Key`) | 类型 | 默认值 | 说明与有效取值 |
| :--- | :--- | :--- | :--- |
| `mode` | `string` | `"off"` | 插件激活模式：`"off"`、`"once"`、`"auto"`。 |
| `triggers` | `string[]` | `["/route", "/jev"]` | `once` 模式下的触发指令前缀。支持 `/route preview <任务>` 仅评估不派发。 |
| `provider` | `string` | `"typesafe"` | 判定提供商预设：`"typesafe"`、`"bai"`、`"openrouter"`。 |
| `endpoint` | `string` | 依预设 | Jev 判定服务端点地址（预设提供，高级自建网关可覆盖）。 |
| `apiPath` | `string` | 依预设 | Jev API 路径（预设提供，高级覆盖项）。 |
| `apiKeyEnv` | `string` | 依预设 | 密钥环境变量名或凭据项。 |
| `model` | `string` | 依预设 | 判定模型标识（例如 `"jev-1.13.0"` 或 `"jev-1.13"`）。 |
| `timeoutMs` | `number` | `4000` | 判定请求超时时间（毫秒）。超时后触发静默放行机制。 |
| `stateChars` | `number` | `1200` | 送往判定服务的任务状态文本长度截断上限（从头部截取）。 |
| `activeProfile` | `string` | `"auto"` | 当前生效的决策档位：`"auto"`（常规）、`"careful"`（严苛）。 |
| `defaultRoute` | `string` | `"implementer"` | 未匹配到细分任务类别时的兜底路由角色。 |
| `logDir` | `string` | `null` | 判定流水 NDJSON 日志目录；留空或 `null` 表示不持久化日志。 |
| `logTurnText` | `boolean` | `false` | 日志是否记录用户对话原始文本；默认 `false` 仅记录评估指标元数据。 |

---

## 🔍 核心机制与判定流转

### 1. 完整判定流转时序图

```
                [ 用户发送对话 / 触发任务 ]
                             │
                             ▼
                ┌─────────────────────────┐
                │ 是否具备子代理派发环境? │
                └────────────┬────────────┘
                      否     │     是 (具备 subagent 工具且调用深度允许)
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
  [ 保持原样直通 ]                        [ 插件运行模式 mode ]
                                ┌────────────────┴────────────────┐
                       mode="once"(未带触发词)                mode="auto" 或带触发词
                                │                                 │
                                ▼                                 ▼
                         [ 保持原样直通 ]               ┌───────────────────┐
                                                        │ 上下文脱敏与裁剪  │
                                                        └─────────┬─────────┘
                                                                  │
                                                                  ▼
                                                        ┌───────────────────┐
                                                        │ 调用 Jev 结构判定 │
                                                        └─────────┬─────────┘
                                                                  │
                                 ┌────────────────────────────────┴────────────────────────────────┐
                                 ▼                                                                 ▼
                     [ 超过阈值 / 标记高危 / 超时 ]                                       [ 判定符合决策档位要求 ]
                                 │                                                                 │
                                 ▼                                                                 ▼
                        [ 主模型自行执行 ]                                              [ 注入角色推荐提示文案 ]
                                                                                                   │
                                                                                                   ▼
                                                                                   ┌───────────────────────────────┐
                                                                                   │ Hook: agent/request 强制拦截  │
                                                                                   │ 会话若为 auto/manual:         │
                                                                                   │ 强制改写 provider, model,     │
                                                                                   │ reasoningEffort               │
                                                                                   │ (若配置前置提示词则首步注入)  │
                                                                                   └───────────────────────────────┘
```

---

### 2. 「三点对齐」派发法则

任务要在自动流转下成功指派给特定子代理模型，必须在配置中同时满足以下三项条件，缺一不可：

1. **角色就绪**：`routes.<角色>` 必须配置了可用的 `provider` 与 `model`，且属于子代理白名单；
2. **类别映射**：`routeFor.<类别>` 明确将该任务类别映射到了上述角色；
3. **档位放行**：活跃决策档位的白名单 `profiles.<档位>.delegate.taskClass` 包含该任务类别。

若任何一项未对齐，任务将拒绝自动派发，回退由主模型处理。

---

### 3. 升级时的预设类别自动补入机制

在插件版本迭代演进中，可能增加新的出厂预设任务类别（例如近期新增的 `review` 与 `documentation`）。为了解决配置冲突，插件实现了**启动时自动补入**逻辑：

- **痛点起因**：DSH 配置合并机制中，问卷定义 `questions.task_class` 与白名单 `profiles.<档位>.delegate.taskClass` 均为**整块覆盖**而非逐项字典合并。一旦用户通过界面编辑过配置，这两项会被完整持久化至用户本地，后续插件版本更新带来的新预设类别将“看得见却永远无法派发”。
- **补入原则**：
  1. **单向增量（只增不减）**：仅补入配置中缺失的官方出厂类别，绝不删除用户自建的类别。
  2. **尊重收紧策略**：仅向出厂允许该类别的档位追加白名单，绝不放宽用户主动收紧的档位限制（例如 `careful` 档位始终保持严格）。
  3. **幂等性与防重复记录**：首次补入的类别记录在 `adoptedClasses` 列表中。若用户后续主动删除了某类别，插件不会再次强行补回。
  4. **全新安装零写入**：全新安装由于直接使用出厂默认值，启动时不会执行任何冗余写入。
  5. **界面手动兜底**：设置面板若检测到未放行的预设类别，会明确提示并提供「按出厂预设补回去」的一键同步按钮。

---

### 4. 隐私安全脱敏与静默放行体系

- **敏感凭据脱敏**：文本离开本地上送判定服务前，插件通过内置正则自动剥离凭据特征（包括 `sk-...`、`ghp_...`、`AKIA...`、`Bearer ...` 及各类密钥键值对），替换为 `[redacted]` 占位符。
- **长度硬截断**：文本经由 `stateChars`（默认 1200 字符）从头部进行严格截断，防止大体积上下文消耗过多无关 Token。
- **静默放行（Fail-Open）**：子代理路由属于优化增强型功能。判定网络请求超时（默认 4000 ms）、服务故障或格式异常时，插件仅在控制台记录警告，主会话请求原样放行，绝不阻断用户的正常交互。

---

## 📊 离线策略回放 (`jev-replay`)

项目提供独立的 CLI 离线分析脚本 `bin/jev-replay.mjs`。该工具可解析历史沉淀的 NDJSON 判定日志，并在本地重放模拟候选决策策略，**全程离线运行，不产生任何在线 API 调用**。

### 运行命令

```bash
# 格式：node bin/jev-replay.mjs <历史日志路径.ndjson> [候选策略.json] [--json]
node bin/jev-replay.mjs ~/.dsh/logs/verdicts.ndjson candidate-policy.json
```

### 应用价值

- **策略调优验证**：在调整阈值（如 `confidenceMin`、`effortMax`、`blastRadiusMax`）前，量化评估历史任务的翻转比例。
- **分流影响分析**：统计不同任务类别在新旧策略下的派发流向差异，避免盲目收紧或放宽白名单。

---

## 🧪 开发与测试

仓库包含完整的工程校验与自动化测试套件：

```bash
# 1. 运行自动化单元测试套件（98 项用例，覆盖判定、回放、改写与配置合并；其中 1 项依赖宿主 `dsh` 命令，Windows 上自动跳过）
node --test "test/**/*.test.mjs"

# 2. 运行工程规范与代码合规检查
node scripts/check.mjs

# 3. 校验多语言国际化文案键位对齐（en / zh / ru）
node scripts/check-locales.mjs

# 4. 执行 TypeScript 静态类型检查
node node_modules/typescript/bin/tsc --noEmit

# 5. 构建客户端前端资源包（生成 lib/client.js）
node scripts/build-client.mjs
```

---

## 🗺️ 路线图 (Roadmap)

- [x] **v0.1.0 核心能力落地**
  - [x] 接入 Jev 判定模型，支持 TypeSafe、B.ai、OpenRouter 供应商预设
  - [x] 基于 `agent/request` 钩子实现子代理模型参数运行时硬性改写
  - [x] 会话级三模切换（继承 / 自动 / 手动）与思考程度调节
  - [x] 5 大角色与 8 种任务类别体系（含 `review`、`documentation`）
  - [x] 启动时预设类别增量自动补入机制（`planAdoption` 与 `adoptedClasses`）
  - [x] 凭据正则脱敏与静默放行（Fail-Open）防护
  - [x] 离线策略评估回放工具（`jev-replay`）
  - [x] 完整 Web GUI 注入与中、英、俄三语本地化
- [ ] **近期后续规划**
  - [ ] 针对不同子代理模型的 Token 与预估成本核算面板
  - [ ] 子代理执行失败时的自动回退与高配模型重试机制
  - [ ] 支持在 Web 端可视化配置中自定义新增判型问题维度

---

## 🧩 由来与致谢 (Provenance)

本插件由两个早期项目合并而成，能力各承其一：

| 早期项目 | 继承的能力 |
| :--- | :--- |
| [`dsh-subagent-model-picker`](https://github.com/ringoage/dsh-subagent-model-picker)（v1.0.0） | 可视化、手动的子代理模型选择：输入框上方的选择器、会话状态徽章、右侧边栏标签页 |
| [`dsh-jev-subagent-dispatch`](https://github.com/vitas/dsh-jev-subagent-dispatch)（v0.8.0） | 基于 Jev 判定模型的自动分流：任务判定、角色路由、子代理请求级模型改写 |

两者均为 MIT 许可，版权分别归 **ringoage** 与 **Vitaliy Ryumshyn**，完整声明见 [LICENSE](LICENSE)。

**合并遗留的旧名**：包名由 `dsh-jev-subagent-dispatch` 改为 `dsh-subagent-custom`，角色 `mechanical` 改名为 `junior`，插件来源标识由 `plugin:jev-subagent-dispatch` 改为 `plugin:subagent-custom`。因此少量注释里仍会读到旧名（例如 `cordis.patch.yml` 的文件头和 `src/shared/config.mjs` 的模块注释）——那是合并留下的痕迹，不是另一个仍在运行的插件。

---

## 🤝 贡献指南 (Contributing)

欢迎提交 Issue 或 Pull Request 共同改进项目！请遵循以下协作规范：

1. **Fork 仓库**并基于主干分支创建特性分支：
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **遵循编码准则**：
   - 坚持纯函数与逻辑解耦原则，关键业务需附带单元测试；
   - 若新增前端界面文案，必须在 `src/client/locales.ts` 中同步补齐 `zh`、`en`、`ru` 三语映射；
   - 保持最小侵入性，不引入未商定的冗余依赖。
3. **完成本地验证**：
   在提交前运行所有检查确保通过：
   ```bash
   node --test "test/**/*.test.mjs"
   node scripts/check.mjs
   node scripts/check-locales.mjs
   node node_modules/typescript/bin/tsc --noEmit
   ```
4. **提交 Pull Request**：
   详细阐述改动背景、设计推演及验证结果。

---

## 📄 开源协议 (License)

本项目依据 [MIT License](LICENSE) 开放源代码。

---


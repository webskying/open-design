# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

foxpre 是中国 IT 项目投标文档多智能体协作编制系统，基于 Open Design 代码库 fork 开发。核心能力：上传招标文件（PDF/DOCX）→ 9 个专业智能体协同撰写 → 输出符合格式要求的投标文件（DOCX）。

**架构定位**：foxpre 深度集成到 Open Design 的项目系统中，而非独立子页面。在 NewProjectPanel 中新增"标书制作" Tab（`ProjectKind = 'bid'`），在 ProjectView 中新增"标书"工作区 Tab。售前工程师用 Open Design 做原型、做 PPT、做架构图，然后通过 foxpre 把这些成果组装成投标文件。

**技术栈：** pnpm monorepo, Next.js 16 + React 18 (web), Express + SQLite/better-sqlite3 (daemon), Electron (desktop), Node ~24, pnpm 10.33.2。

**核心原则：**
- **胶水编程（Glue Programming）**：最大化复用 Open Design 现有基础设施（SSE、Chat/Run、Skills 注册表、MCP 连接器、design-templates），最小化新造。
- **深度集成（Deep Integration）**：foxpre 不是 Open Design 的"外挂"，而是 Open Design 的一个使用场景。投标项目就是 OD 项目，原型/架构图/PPT 都是 OD 项目成果。
- **TDD 强制**：每个 `.ts` 源文件必须有对应的 `.test.ts`（测试在 `tests/` 目录，与 `src/` 同级）。
- **中文优先**：用户可见的 UI 文本、错误信息、注释均用中文。
- **技术负责人立场**：有自己的技术原则，不附和用户，给最优技术路线。

## Common Commands

```bash
# 启动开发环境（daemon + web，唯一入口）
pnpm tools-dev run web
# foxpre 访问方式：通过 Open Design 的 NewProjectPanel "标书制作" Tab 创建项目

# 验证（提交前必跑）
pnpm guard
pnpm typecheck
pnpm i18n:check

# 包级命令（不要用根级 pnpm build/test）
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon test tests/foxpre/doc-parser.test.ts   # 运行单个测试文件
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web build
pnpm --filter @open-design/contracts typecheck

# 安装依赖（改过 package.json 后必跑）
pnpm install
```

## Architecture

### foxpre 与 Open Design 集成架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Open Design Web UI (apps/web/)                                  │
│                                                                   │
│  NewProjectPanel                                                 │
│  ├── prototype / live-artifact / deck / template / media / other │
│  └── 标书制作 (ProjectKind='bid')  ← foxpre 入口                 │
│       └── 4步流程：上传→关联投标人→样式→引用项目                    │
│                                                                   │
│  ProjectView                                                     │
│  ├── [Files] [Preview] [Chat] ...  ← 标准 OD Tab                 │
│  └── [标书]                        ← foxpre 工作区 (kind=bid)     │
│       └── 三栏：看板 + 文档预览 + 智能体对话                       │
│                                                                   │
│  /foxpre/settings                 ← 投标人信息库 + 门禁规则设置     │
│  /foxpre/styles                  ← 样式设计器                     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼─────────────────────────────────────────┐
│  foxpre Daemon (apps/daemon/src/foxpre/)                         │
│  ├── bid-routes.ts         — 项目 CRUD + 工作流控制 API          │
│  ├── bidder-routes.ts      — 投标人信息库 CRUD + 加密存储        │
│  ├── style-routes.ts       — 样式模板 CRUD API                   │
│  ├── db.ts                 — 11 张 SQLite 表 + 迁移 + 种子数据   │
│  ├── doc-parser.ts         — PDF/DOCX 文本提取与分块              │
│  ├── template-builder.ts   — 格式规范书 → 空白 DOCX 模板        │
│  ├── md-to-docx.ts         — Markdown → DOCX（Pandoc 管道）     │
│  ├── image-describer.ts     — 图片描述引擎（三级降级）            │
│  ├── field-crypto.ts       — 敏感字段 AES-256-GCM 加密/脱敏      │
│  ├── harness-engine.ts     — 双层门禁审核引擎                    │
│  └── solo-coder.ts         — [待实现] 智能体调度引擎/任务状态机  │
│       ↓ spawn                                                   │
│  Agent CLI 运行时（复用 Open Design Chat/Run 系统）              │
└─────────────────────────────────────────────────────────────────┘
```

### 9 个智能体（Skills）

SOLO Coder（主控调度）编排以下 8 个子智能体，定义在 `skills/foxpre-*/SKILL.md`：

| 代号 | 角色 | 执行顺序 |
|------|------|----------|
| Analyzer | 解析招标文件，输出需求报告+格式规范书+废标点清单 | 1 |
| Researcher | 搜集行业案例、技术资料 | 2（与 Prototyper 并行） |
| Prototyper | 生成原型截图、架构图（调用 design-templates + MCP） | 2（与 Researcher 并行） |
| Architect | 设计技术方案大纲，标注评分项 | 3 |
| TechWriter | 撰写技术方案章节 | 4（三 Writer 并行） |
| BusinessWriter | 编制商务标书 | 4 |
| PMWriter | 撰写项目管理方案 | 4 |
| Reviewer | 双层门禁审核 + 格式一致性检查 | 5 |

### 共享契约层

`packages/contracts/src/foxpre/` 存放所有 foxpre 共享类型和常量：
- `constants.ts` — 智能体代号、项目状态、项目类型、任务状态、看板列等常量
- `api.ts` — API DTO 类型（foxpre项目、智能体任务、审核报告、样式模板、投标人信息、资质证书、业绩案例、项目引用关系、章节映射、图片描述结果等）
- `index.ts` — 统一导出

**契约纯度规则**：`packages/contracts` 不得依赖 Next.js、Express、Node fs/process、浏览器 API、SQLite、daemon 内部模块或 sidecar 协议。

### 数据库模型（11 张表）

| 表名 | 用途 | v1.1 状态 |
|------|------|-----------|
| `foxpre_projects` | 投标项目元数据（含关联投标人ID、引用项目JSON） | 更新 |
| `agent_tasks` | 智能体任务生命周期 | 不变 |
| `document_fragments` | 文档片段追踪 | 不变 |
| `review_history` | 审核审计记录 | 不变 |
| `bidders` | 投标人信息库（含加密字段） | v1.1 新增 |
| `bidder_qualifications` | 投标人资质证书 | v1.1 新增 |
| `bidder_projects` | 投标人业绩案例 | v1.1 新增 |
| `project_references` | 项目引用关系（投标项目↔OD项目） | v1.1 新增 |
| `style_templates` | 样式模板存储 | 不变 |
| `universal_harness_rules` | 通用门禁规则 | 不变 |
| `foxpre_migrations` | 迁移版本追踪 | 不变 |

### 数据流

```
招标文件上传 → doc-parser 解析 → Analyzer 智能体分析
  → template-builder 生成空白模板 → 用户确认（复杂格式时）
  → solo-coder 调度 Researcher/Prototyper（并行）→ Architect → 三 Writer（并行）
  → Reviewer 门禁审核 → 通过则 docx-assembler 组装最终 DOCX
  → 不通过则派发修改任务给对应 Writer，循环迭代
```

**引用已有项目数据流：**
```
用户在 NewProjectPanel 选择引用项目 → ProjectReferencePicker
  → image-describer 分析截图（Vision → HTML分析 → 手动标注 三级降级）
  → 章节映射结果写入 project_references 表
  → TechWriter 撰写时引用描述文本和截图路径
```

### Web UI 结构

**集成到 Open Design 的方式：**

| 入口 | 文件 | 状态 |
|------|------|------|
| NewProjectPanel "标书制作" Tab | `apps/web/src/components/NewProjectPanel.tsx` | 待实现 |
| ProjectView "标书" Tab | `apps/web/src/components/ProjectView.tsx` | 待实现 |
| `ProjectKind = 'bid'` | `packages/contracts/src/api/projects.ts` | 待实现 |

**foxpre 独立页面（辅助配置）：**

| 路由 | 文件 | 状态 |
|------|------|------|
| `/foxpre/settings` | `apps/web/app/foxpre/settings/page.tsx` | 待实现 |
| `/foxpre/styles` | `apps/web/app/foxpre/styles/page.tsx` | 待实现 |

foxpre 组件目录：`apps/web/src/components/foxpre/`。

### Daemon 路由注册

foxpre 路由在 `apps/daemon/src/server.ts` 中注册（遵循项目英文命名约定）：
```typescript
import { registerFoxpreBidRoutes } from './foxpre/bid-routes';
import { registerFoxpreStyleRoutes } from './foxpre/style-routes';
import { registerFoxpreBidderRoutes } from './foxpre/bidder-routes';
registerFoxpreBidRoutes(app, { db, http: httpDeps, ... });
registerFoxpreStyleRoutes(app, { db, http: httpDeps, ... });
registerFoxpreBidderRoutes(app, { db, http: httpDeps, ... });
```

## Development Conventions

### 代码命名

- 函数和变量使用中文命名（如 `解析文档`、`项目ID`、`创建项目请求`）。
- 文件路径、Git 分支名、npm 包名保持英文。
- 常量使用中文键名的 Record（参见 `constants.ts`）。

### 前端 UI 开发流程

1. 每个页面完成后**立即截图**给用户审查，不要批量做完多个页面。
2. 前端组件使用内联样式（CSSProperties）或 CSS 变量（`var(--bg-panel)` 等），与 Open Design 主题系统集成。
3. 复用 Open Design 的 CSS 变量和动画规范（ease-out: `cubic-bezier(0.23, 1, 0.32, 1)`，enter ~200ms，exit ~140ms）。

### 后端开发

- 所有 foxpre daemon 模块放在 `apps/daemon/src/foxpre/` 下。
- 测试放在 `apps/daemon/tests/foxpre/` 下，与 `src/` 同级。
- 数据库操作使用 `better-sqlite3` 同步 API，不使用 ORM。
- API 路由文件以 `*-routes.ts` 命名，SSE 流以 `*-sse.ts` 命名。
- 敏感字段（法人身份证号、银行账号、统一社会信用代码）必须通过 `field-crypto.ts` 加密后存储，UI 层脱敏显示。

### i18n

添加新的 i18n 键时，先在 `apps/web/src/i18n/types.ts` 定义类型，然后在全部 18 个 locale 文件（`apps/web/src/i18n/locales/*.ts`）中添加翻译。缺失翻译会导致 typecheck 失败。

### Git

- 提交信息格式：`feat: ...` / `fix: ...` / `test: ...` / `chore: ...`
- **禁止**包含 `Co-authored-by` 或其他 co-author 元数据。
- foxpre 智能体的 Git 提交格式：`[<智能体代号>] <动作>: <简述>`（如 `[TechWriter] add: 3.2 系统架构设计`）。

### 测试

- 测试框架：Vitest。
- 运行所有 foxpre 测试：`pnpm --filter @open-design/daemon test tests/foxpre/`
- 运行单个测试文件：`pnpm --filter @open-design/daemon test tests/foxpre/doc-parser.test.ts`

## Environment

| 项 | 值 |
|---|---|
| Node | ~24（`engines.node: "~24"`，不使用 Node 22） |
| pnpm | 10.33.2（`npm install -g pnpm@10.33.2`，不用 corepack） |
| OS | Windows（best-effort，主要支持 macOS/Linux） |
| Pandoc | 系统依赖，MD→DOCX 转换需要（`pandoc --version` 验证） |

## Known Issues

- **Hydration mismatch 控制台警告**：Chrome 扩展 + Open Design themeInitScript 导致，非 foxpre 问题，可忽略。
- **better-sqlite3 编译**：Windows 上无 Node 24 预构建二进制，`pnpm install` 会通过 node-gyp 从源码编译（~2 分钟），需要 Visual Studio Build Tools 2022+。

## Key Reference Documents

| 文档 | 路径 |
|------|------|
| 需求规格 v1.1 | `docs/foxpre/foxpre-requirements-spec.md`（含附录A/B/C） |
| 实施计划 | `docs/foxpre/implementation-plan.md` |
| 会话上下文 | `docs/foxpre/context/session-context-2026-06-10.md` |
| 上游 Open Design 规范 | `CLAUDE.md`（项目级） |

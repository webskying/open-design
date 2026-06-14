# foxpre 主开发计划

**日期**：2026-06-13
**更新**：2026-06-14（阶段六审查通过后刷新）
**状态**：执行中（阶段零-六已完成，阶段七-九待开发）
**前置文档**：`../architecture-analysis.md`、`../foxpre-requirements-spec.md`、`../foxpre__implementation-plan.md`、`../implementation-roadmap.md`

---

## 0. 环境基线

| 检查项 | 目标值 | 当前状态 |
|--------|--------|---------|
| Node | `~24` (engines.node) | ✅ v24.16.0 |
| pnpm | `10.33.2` | ✅ 10.33.2 |
| `pnpm typecheck` | 零错误 | ✅ 全绿 |
| `pnpm guard` | 零错误 | ✅ 54/54 pass |
| Pandoc | 系统依赖 | ⬜ 待安装 |
| VS Build Tools 2022+ | better-sqlite3 编译 | ⬜ 待安装 |

---

## 1. 九阶段实施计划

```
✅ 阶段零：Contract 类型验证     🟢 低风险  commit f29d293
✅ 阶段一：数据库层 (11张表)     🟢 低风险  commit f29d293
✅ 阶段二：文档处理管线          🟡 中风险  commit f29d293
✅ 阶段三：门禁审核引擎          🟢 低风险  commit f29d293
✅ 阶段四：Agent Skills (9个)    🟢 低风险  commit 218571a
✅ 阶段五：SOLO Coder 调度引擎   🔴 高风险  commit d221511
✅ 阶段六：Daemon API 路由       🟡 中风险  commit 09dd311（含 CLI） ← 已完成
⬜ 阶段七：Web UI               🔴 高风险  ← 下一阶段
⬜ 阶段八：DOCX 组装输出         🟢 低风险
⬜ 阶段九：集成测试 + i18n       🟡 中风险
```

---

## 2. 数据架构：foxpre 与 Open Design 知识库的关系

### 2.1 Open Design 知识库三层体系

foxpre **不修改** OD 现有的知识库系统，而是分层复用：

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: 文件系统 Memory Store                               │
│  .od/memory/*.md  —  Agent 知识的自然沉淀                     │
│  foxpre 策略：零修改，Agent session 自动产生 memory            │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Memory Extraction 引擎                              │
│  memory-extractions.ts / memory-llm.ts                        │
│  foxpre 策略：零修改，OD 自动从 foxpre 对话中提取知识          │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: Connectors 连接器层                                 │
│  Composio → Notion/飞书/GitHub 等外部数据源                    │
│  foxpre 策略：零修改 OD connector 基础设施，                    │
│             只新增 foxpre 侧导入 handler                        │
└──────────────────────────────────────────────────────────────┘
```

**核心原则**：foxpre 在 OD 知识库体系之上构建，不修改任何 OD 现有文件。

### 2.2 foxpre 数据层全景

```
┌── OD 核心（不动）─────────────────────────────────────────────┐
│   db.ts (better-sqlite3)  ← foxpre 复用同一实例                │
│   memory.ts               ← foxpre 不修改                      │
│   connectors/catalog.ts   ← foxpre 不修改                      │
│   connectors/service.ts   ← foxpre 通过 API 消费               │
└───────────────────────────────────────────────────────────────┘
                              │
┌── foxpre 本地 SQLite（11 张表，foxpre_ 前缀）─────────────────┐
│                                                                │
│   结构化业务数据                                               │
│   ├── bidders                    ← 投标人信息（加密字段）       │
│   ├── bidder_qualifications      ← 资质证书                    │
│   ├── bidder_projects            ← 业绩案例                    │
│   ├── project_references         ← 投标↔OD项目引用关系          │
│   ├── style_templates            ← 样式模板                    │
│   └── universal_harness_rules    ← 门禁规则                    │
│                                                                │
│   运行时状态                                                   │
│   ├── foxpre_projects            ← 投标项目元数据              │
│   ├── agent_tasks                ← 智能体任务生命周期           │
│   ├── document_fragments         ← 文档片段追踪                │
│   ├── review_history             ← 审核审计记录                │
│   └── foxpre_migrations          ← 迁移版本追踪                │
└──────────────────────────────────────────────────────────────┘
                              │
┌── OD Memory（零修改复用）──────────────────────────────────────┐
│   .od/memory/                   ← Agent 知识的自然沉淀          │
│   ├── 中标策略偏好.md            ← foxpre-analyzer 提取         │
│   ├── 行业术语规范.md            ← foxpre-researcher 提取       │
│   └── ...                       ← 由 OD 自动提取引擎管理       │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 外部数据源导入（飞书/Notion → foxpre）

用户已在飞书、Notion 中维护投标人信息、资质证书、业绩案例等数据。foxpre 通过以下架构复用这些数据：

```
                      Composio API
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Notion             飞书/Lark         Google Drive
   (OD 已有)         (需添加定义)         (OD 已有)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
              OD connectors/service.ts  ← 零修改
                           │
              foxpre Import Handler  ← 新增
                           │
              ┌────────────┼────────────┐
              │            │            │
          bidders   qualifications  projects
         (加密存储)  (资质证书)    (业绩案例)
```

**导入策略：快照模式（Build-time Read）**

每次创建投标项目时，用户选择从 Notion/飞书导入数据，一次性写入本地 SQLite 表。后续标书生成完全使用本地快照，不依赖外部服务状态。

**选择快照模式的理由**：

| 考量 | 快照模式 | 实时查询模式 |
|------|---------|------------|
| 合规要求 | ✅ 投标数据版本固化，符合法律材料要求 | ❌ 生成过程中源数据可能被修改 |
| 网络依赖 | ✅ 仅导入时需要 | ❌ 每次生成都需连接 |
| 离线生成 | ✅ 完全支持 | ❌ 不可用 |
| 数据一致性 | ✅ 标书内容对应明确版本 | ❌ 无法确定引用版本 |
| 实现复杂度 | 🟢 复用现有 connector 框架 | 🟡 需处理超时/重试/缓存 |

**分阶段导入支持**：

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P1（MVP） | 手动录入 + SQLite 加密存储 | 无外部依赖 |
| P2（增强） | Notion 一键导入（OD 已有 connector） | Composio API Key + Notion OAuth |
| P3（长远） | 飞书/Lark 导入（需添加 connector 定义） | Composio 是否支持飞书 |

### 2.4 对 OD 升级的兼容性分析

| OD 升级影响 | foxpre 风险 | 原因 |
|------------|-----------|------|
| `memory.ts` 重构 | 🟢 零风险 | foxpre 不修改此文件 |
| `db.ts` 迁移逻辑变更 | 🟢 零风险 | `foxpre_` 表前缀不被 OD 迁移触碰 |
| `better-sqlite3` 版本升级 | 🟢 低风险 | 复用同一 `db` 实例，API 稳定 |
| `connectors/` 目录重构 | 🟢 低风险 | 仅通过 HTTP API 消费，无源码依赖 |
| Composio API 变化 | 🟢 零风险 | 非 foxpre 硬依赖，导入失败时降级为手动录入 |
| Composio SDK 升级 | 🟢 零风险 | foxpre 不直接依赖 Composio SDK |

### 2.5 OD 版本升级操作手册

当 Open Design 发布新版本时，按以下三步操作将 foxpre 集成到新版。

#### 第一步：git rebase（< 30 分钟）

```
git fetch upstream
git rebase upstream/main
```

冲突面：**最多 6 个文件**。逐个处理：

| 冲突文件 | 冲突原因 | 解决策略 |
|---------|---------|---------|
| `packages/contracts/src/api/projects.ts` | `ProjectKind` 联合类型追加 `'bid'` | 在新版 OD 的类型末尾追加 `\| 'bid'` |
| `packages/contracts/src/plugins/scenario-defaults.ts` | Record 追加 `bid` 条目 | 在新版 OD 的 Record 中追加 `bid: 'od-new-generation'` |
| `packages/contracts/tests/scenario-defaults.test.ts` | 测试 expected 追加 `bid` | 在新版 OD 的测试用例中追加 `bid: 'od-new-generation'` |
| `apps/daemon/src/server.ts` | import 段 + 注册调用位置 | 在新版 OD 的 `registerMediaRoutes` 调用之后重新插入 foxpre import 和注册 |
| `apps/web/src/components/NewProjectPanel.tsx` | CreateTab + 条件渲染 | 在新版 OD 的 Tab 列表末尾追加 `'bid'` + `<CreateProjectForm />` |
| `apps/web/src/components/ProjectView.tsx` | kind 条件 Tab | 在新版 OD 的 Tab 系统中追加 `kind='bid'` 的分支 |

`skills/foxpre-*/`、`apps/daemon/src/foxpre/`、`apps/web/src/components/foxpre/`、`packages/contracts/src/foxpre/` 等 **~51 个 foxpre 自有文件零冲突**（OD 不会触碰这些目录）。

#### 第二步：编译验证

```bash
pnpm install
pnpm typecheck
```

TypeScript 编译器是 foxpre 的自动哨兵。如果 `pnpm typecheck` 不通过，以下场景对应排查：

| 报错模式 | 原因 | 操作 |
|---------|------|------|
| `Property 'bid' is missing in type...` | OD 新增了 Record<ProjectKind> 的穷举位置 | 在对应的 Record 中追加 `bid` 条目 |
| `Type '"bid"' is not assignable...` | OD 修改了 ProjectKind 联合类型的约束 | 检查新版 OD 的 ProjectKind 定义，调整 `bid` 的声明方式 |
| 路由注册函数签名不匹配 | OD 修改了 `register*Routes` 的 deps 类型 | 对照新版 OD 的 `registerMediaRoutes` 调用参数，同步调整 foxpre 路由注册 |
| 新文件引起的新增模块冲突 | 极低概率 | 联系 foxpre 架构师评估 |

#### 第三步：功能回归

```bash
pnpm guard
pnpm --filter @open-design/daemon test tests/foxpre/
pnpm --filter @open-design/daemon test   # 确认 OD 核心测试零回归
pnpm --filter @open-design/web typecheck
```

#### 为什么 foxpre 不会悄悄坏掉（三层防线）

| 防线 | 机制 | 触发条件 |
|------|------|---------|
| **第一层：编译期** | `ProjectKind` 是联合类型，`DEFAULT_SCENARIO_PLUGIN_BY_KIND` 是 `Record<ProjectKind, ...>`。任何类型签名的修改都会在 `pnpm typecheck` 阶段立即暴露 | OD 修改 ProjectKind 或相关 Record |
| **第二层：运行时** | `foxpre_` 表前缀物理隔离 — OD 的 `db.ts` migrate 函数只认识自己定义的表名（`projects`、`conversations`、`messages` 等），永远不会误操作 foxpre 表 | OD 修改 db.ts 迁移逻辑 |
| **第三层：进程级** | foxpre 模块不修改任何 OD 基础设施（memory、connectors、critique、plugins 全部零修改），仅通过 HTTP API 消费 | OD 重构内部模块 |

#### 最坏情况时间预算

假设 OD 在 `NewProjectPanel.tsx` 上做了大重构（最坏情况），影响评估：

| OD 改动类型 | 发生概率 | 修复时间 |
|------------|---------|---------|
| 新增 ProjectKind | 中 | 1 分钟 |
| 重命名 `DEFAULT_SCENARIO_PLUGIN_BY_KIND` | 极低 | 1 分钟 |
| `server.ts` 路由注册重构 | 低 | 5 分钟 |
| `NewProjectPanel.tsx` 拆分为子组件 | 中 | 15 分钟 |
| `ProjectView.tsx` Tab 系统重构 | 低 | 10 分钟 |
| `better-sqlite3` 版本大升级 | 低 | 0（表前缀隔离） |
| `connectors/` 目录整体重构 | 低 | 0（无源码依赖） |
| `memory.ts` 存储格式变更 | 低 | 0（无源码依赖） |

**合计：最坏情况下 < 30 分钟修复。**

#### 升级频率建议

| 策略 | 频率 | 说明 |
|------|------|------|
| **日常** | 每两周 `git fetch upstream` 观察 CHANGELOG | 无破坏性变更则跳过 rebase |
| **安全更新** | OD 发布 bugfix 后 3 天内 rebase | 只处理冲突，不验证功能（除非冲突面超出预期） |
| **功能更新** | OD 发布 feature release 后 1 周内 rebase | 完整走三步验证 |
| **大版本升级** | OD 发布 breaking change 时立即评估 | 先读 CHANGELOG，评估影响面后再 rebase |

**核心原则**：rebase 节奏不需要紧跟 OD 的每次 commit。od-new-generation 插件的行为变化不影响 foxpre（foxpre 的智能体通过 Skills + 独立 daemon 模块工作，不依赖插件 pipeline）。只有当 `ProjectKind` 相关类型、`server.ts` 路由注册模式、或 `NewProjectPanel.tsx` 组件结构发生变化时才需要立即升级。

---

## 3. 修改面总览

### 3.1 修改策略

foxpre 代码分为两层：

| 层 | 文件数 | 策略 | 与 OD 关系 |
|-----|-------|------|-----------|
| **OD 修改面**（5 个文件，1 个待定） | 5+1 | 最小修改，源码仓库内或 patch-package 补丁 | 编译时交叉，升级时需关注 |
| **foxpre 自有代码**（~55 个文件） | ~55 | 全新文件，位于 foxpre 命名空间下 | 零冲突，OD 不会触碰 |

### 3.2 必须修改的 OD 文件（6 个）

| # | 文件 | 修改量 | 风险 | 类型检测 |
|---|------|--------|------|---------|
| 1 | `packages/contracts/src/api/projects.ts` | +1 行 | 🟢 | ✅ 已完成 |
| 2 | `packages/contracts/src/plugins/scenario-defaults.ts` | +1 行 | 🟢 | ✅ 已完成 |
| 3 | `packages/contracts/tests/scenario-defaults.test.ts` | +1 行 | 🟢 | ⬜ 待执行 |
| 4 | `apps/web/src/components/NewProjectPanel.tsx` | +15~20 行 | 🟡 | ⬜ 阶段七 |
| 5 | `apps/web/src/components/ProjectView.tsx` | +10~15 行 | 🟢 | ⬜ 阶段七 |
| 6 | `apps/daemon/src/server.ts` | +8 行 | 🟢 | ⬜ 阶段六 |

**数据架构的修改面结论**：上述 6 个文件中，**没有一个涉及 OD 的 memory/connectors 系统**。foxpre 的知识库策略是纯粹的新增代码。

### 3.3 两种交付模式

| 维度 | 源码仓库内开发（当前） | 独立包 + patch-package（§19） |
|------|----------------------|------------------------------|
| OD 修改面 | 直接编辑 6 个文件 | ~40 行 .patch 文件，自动应用 |
| foxpre 自有代码 | `apps/daemon/src/foxpre/` 等 | `@foxpre/bid-maker/src/` 独立仓库 |
| 安装方式 | 包含在同一 Git 仓库 | `pnpm add @foxpre/bid-maker` |
| OD 升级策略 | §2.5 三步 rebase | 升级 `@foxpre/bid-maker` 版本 |
| 适用场景 | foxpre 与 OD 同团队维护 | foxpre 独立团队，分发给已安装 OD 的用户 |

修改面（6 个文件）在两种模式下完全相同，差异仅在交付形式（源码编辑 vs patch 文件）。

---

## 4. 阶段零：Contract 类型验证

**详细计划**：见 `0613_phase-zero-contract.md`

### 4.1 目标

修改 1 行 `ProjectKind` 联合类型，利用 TypeScript 编译器自动枚举所有需要修改的位置，确认实际修改面。

### 4.2 步骤

| 步骤 | 文件 | 动作 | 验证 |
|------|------|------|------|
| 0.1 | `packages/contracts/src/api/projects.ts:8` | `ProjectKind` 追加 `\| 'bid'` | `pnpm typecheck` 产生预期错误 |
| 0.2 | 全项目 | 收集类型错误 → 确认修改点 | 记录所有报错位置 |
| 0.3 | `scenario-defaults.ts` | Record 补 `bid` 条目 | 该文件报错消失 |
| 0.4 | `packages/contracts/src/foxpre/` | 创建 constants.ts, api.ts, index.ts | 类型检查通过 |
| 0.5 | — | `pnpm typecheck` 零错误 | 全绿 |

### 4.3 预期产出

- [ ] 确认实际需要修改的文件和行号（可能与文档分析有差异）
- [ ] `packages/contracts/src/foxpre/constants.ts` — 智能体代号、状态常量
- [ ] `packages/contracts/src/foxpre/api.ts` — API DTO 类型定义
- [ ] `packages/contracts/src/foxpre/index.ts` — 统一导出

### 4.4 提交

```
feat: 添加 foxpre Contract 层 — ProjectKind 追加 'bid' + API 类型定义
```

---

## 5. 阶段一：数据库层

### 5.1 目标

建立 foxpre 的 11 张独立 SQLite 表，每张表使用 `foxpre_` 前缀，与 OD 核心表完全隔离。通过模块化 `initFoxpreDatabase(db)` 函数挂载到 OD 的 `better-sqlite3` 实例上。

### 5.2 设计约束

| 约束 | 说明 |
|------|------|
| 复用实例 | 接收 OD 的 `SqliteDb` 实例，不新建连接 |
| 表前缀 | 全部 11 张表统一使用 `foxpre_` 前缀 |
| 迁移模式 | 通过 `foxpre_migrations` 表追踪版本，与 OD 迁移完全解耦 |
| 同步 API | 使用 `better-sqlite3` 同步 API，与 OD `db.ts` 风格一致 |
| 加密字段 | `bidders` 表敏感字段在应用层 AES-256-GCM 加密（阶段六实现），数据库层存储 `TEXT` |
| 测试隔离 | 使用 `openDatabase(tempDir)` 模式创建独立测试库 |

### 5.3 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/db.ts` | 11 张表 DDL + 迁移框架 + 种子数据 |
| `apps/daemon/tests/foxpre/db.test.ts` | 表创建、迁移、种子数据验证 |

### 5.4 集成点

**文件**：`apps/daemon/src/server.ts`

在 `openDatabase()` 调用之后立即初始化 foxpre 表：

```typescript
// server.ts 第 4997 行之后
const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });

// foxpre 数据库初始化（紧接其后）
import { initFoxpreDatabase } from './foxpre/db.js';
initFoxpreDatabase(db);
```

### 5.5 11 张表 DDL 规格

```sql
-- 1. 投标项目元数据
CREATE TABLE IF NOT EXISTS foxpre_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  招标编号 TEXT DEFAULT '',
  投标人ID TEXT DEFAULT '',
  样式模板ID TEXT DEFAULT '',
  引用项目ID列表_json TEXT DEFAULT '[]',
  状态 TEXT NOT NULL DEFAULT '待启动',
  当前审核轮次 INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. 智能体任务
CREATE TABLE IF NOT EXISTS foxpre_agent_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '排队中',
  depends_on_json TEXT DEFAULT '[]',
  commit_sha TEXT DEFAULT '',
  output_path TEXT DEFAULT '',
  error_log TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_project ON foxpre_agent_tasks(project_id);

-- 3. 文档片段
CREATE TABLE IF NOT EXISTS foxpre_document_fragments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT DEFAULT '',
  fragment_type TEXT NOT NULL DEFAULT 'section',
  content_md TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
);
CREATE INDEX IF NOT EXISTS idx_doc_fragments_project ON foxpre_document_fragments(project_id);

-- 4. 审核记录
CREATE TABLE IF NOT EXISTS foxpre_review_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT DEFAULT '',
  round INTEGER NOT NULL DEFAULT 1,
  passed INTEGER NOT NULL DEFAULT 0,
  comments_json TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
);

-- 5. 投标人信息库（含加密字段）
CREATE TABLE IF NOT EXISTS foxpre_bidders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  统一社会信用代码_enc TEXT DEFAULT '',
  法人代表_enc TEXT DEFAULT '',
  联系人 TEXT DEFAULT '',
  联系电话_enc TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 6. 投标人资质证书
CREATE TABLE IF NOT EXISTS foxpre_bidder_qualifications (
  id TEXT PRIMARY KEY,
  bidder_id TEXT NOT NULL,
  cert_name TEXT NOT NULL,
  cert_number TEXT DEFAULT '',
  issue_date TEXT DEFAULT '',
  expiry_date TEXT DEFAULT '',
  attachment_path TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (bidder_id) REFERENCES foxpre_bidders(id)
);
CREATE INDEX IF NOT EXISTS idx_qualifications_bidder ON foxpre_bidder_qualifications(bidder_id);

-- 7. 投标人业绩案例
CREATE TABLE IF NOT EXISTS foxpre_bidder_projects (
  id TEXT PRIMARY KEY,
  bidder_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  amount TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (bidder_id) REFERENCES foxpre_bidders(id)
);
CREATE INDEX IF NOT EXISTS idx_bidder_projects_bidder ON foxpre_bidder_projects(bidder_id);

-- 8. 项目引用关系
CREATE TABLE IF NOT EXISTS foxpre_project_references (
  id TEXT PRIMARY KEY,
  bid_project_id TEXT NOT NULL,
  od_project_id TEXT NOT NULL,
  reference_type TEXT NOT NULL DEFAULT 'prototype',
  description_md TEXT DEFAULT '',
  image_paths_json TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (bid_project_id) REFERENCES foxpre_projects(id)
);
CREATE INDEX IF NOT EXISTS idx_refs_bid_project ON foxpre_project_references(bid_project_id);

-- 9. 样式模板
CREATE TABLE IF NOT EXISTS foxpre_style_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  template_path TEXT DEFAULT '',
  format_spec_json TEXT DEFAULT '{}',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 10. 通用门禁规则
CREATE TABLE IF NOT EXISTS foxpre_universal_harness_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT DEFAULT '',
  check_fn_hint TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 11. 迁移版本追踪
CREATE TABLE IF NOT EXISTS foxpre_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

### 5.6 种子数据

**通用门禁规则（12 条）**：

| 类别 | 规则 | 优先级 |
|------|------|--------|
| 格式一致性 | 封面信息与正文一致 | 10 |
| 格式一致性 | 目录页码与正文对应 | 10 |
| 格式一致性 | 页边距/页眉页脚/字体统一 | 8 |
| 内容完整性 | 所有必填章节齐全 | 10 |
| 内容完整性 | 评分项逐条响应 | 10 |
| 内容完整性 | 附件/证明文件引用无遗漏 | 9 |
| 废标规避 | 无过期资质证书 | 10 |
| 废标规避 | 报价无计算错误 | 10 |
| 废标规避 | 无实名/敏感信息泄露 | 8 |
| 合规性 | 投标有效期覆盖要求 | 9 |
| 合规性 | 保证金/保函信息正确 | 9 |
| 质量 | 无错别字/病句/格式错乱 | 7 |

**内置样式模板（4 套）**：

| 模板名 | 说明 |
|--------|------|
| 标准政府标书 | 宋体正文/黑体标题/1.5倍行距 |
| 简化商务标书 | 微软雅黑/1.2倍行距/蓝色主题色 |
| 技术方案重 | 等宽正文/代码块/图表留白 |
| 综合标书 | 多级目录/页眉页脚/封面页 |

### 5.7 迁移框架

```typescript
// apps/daemon/src/foxpre/db.ts 导出签名
export function initFoxpreDatabase(db: SqliteDb): void;

// 内部实现要求
// 1. 执行所有 CREATE TABLE IF NOT EXISTS 语句
// 2. 从 foxpre_migrations 读取当前版本
// 3. 按版本顺序执行未应用的迁移
// 4. 写入 foxpre_migrations 记录
// 5. 首次运行时插入种子数据（检查表为空才插入）
```

### 5.8 验证

```bash
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test tests/foxpre/db.test.ts
pnpm --filter @open-design/daemon test  # 确认现有测试不受影响
```

**测试要求**（`db.test.ts`）：
- 所有 11 张表创建成功
- 每张表的列名和类型正确
- 外键约束生效
- 索引已创建
- 种子数据正确插入（12 条规则 + 4 套模板）
- 迁移版本记录正确
- 重复调用 initFoxpreDatabase 不产生错误（幂等）

### 5.9 提交

```
feat: 添加 foxpre 数据库模块 — 11张表 + 迁移框架 + 种子数据
```

---

## 6. 阶段二：文档处理管线

### 6.1 目标

实现 PDF/DOCX 解析 + DOCX 模板构建 + Markdown→DOCX 转换 + 图片描述引擎。

### 6.2 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/doc-parser.ts` | PDF/DOCX 文本提取与分块 |
| `apps/daemon/tests/foxpre/doc-parser.test.ts` | 单元测试 |
| `apps/daemon/src/foxpre/template-builder.ts` | 格式规范书 → 空白 DOCX 模板 |
| `apps/daemon/src/foxpre/md-to-docx.ts` | Pandoc 管道 MD→DOCX |
| `apps/daemon/src/foxpre/image-describer.ts` | 三级降级图片描述引擎 |
| `apps/daemon/tests/foxpre/image-describer.test.ts` | 单元测试 |

### 6.3 验证

```bash
pnpm --filter @open-design/daemon test tests/foxpre/doc-parser.test.ts
pnpm --filter @open-design/daemon test tests/foxpre/image-describer.test.ts
```

---

## 7. 阶段三：门禁系统

### 7.1 目标

实现双层 Harness 门禁审核引擎（通用规则 + 项目自定义规则）。

### 7.2 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/harness-engine.ts` | 五步审核流程 |

### 7.3 五步审核流程

1. 格式一致性检查
2. 内容完整性检查
3. 评分项覆盖检查
4. 废标点规避检查
5. 综合评分

---

## 8. 阶段四：Agent Skills 定义

### 8.1 目标

创建 9 个 foxpre 智能体的 SKILL.md 文件，验证 Skills 注册机制。

### 8.2 智能体列表

| 标识 | 文件 | 核心职责 | DAG 位置 |
|------|------|---------|---------|
| foxpre-analyzer | `skills/foxpre-analyzer/SKILL.md` | 招标文件解析 | Step 1 |
| foxpre-tech-writer | `skills/foxpre-tech-writer/SKILL.md` | 技术方案撰写 | Step 2（并行） |
| foxpre-biz-writer | `skills/foxpre-biz-writer/SKILL.md` | 商务方案撰写 | Step 2（并行） |
| foxpre-qual-writer | `skills/foxpre-qual-writer/SKILL.md` | 资质文件编写 | Step 2（并行） |
| foxpre-harness-runner | `skills/foxpre-harness-runner/SKILL.md` | 门禁审核执行 | Step 3（Gate） |
| foxpre-style-checker | `skills/foxpre-style-checker/SKILL.md` | 样式合规检查 | Step 4 |
| foxpre-docx-assembler | `skills/foxpre-docx-assembler/SKILL.md` | DOCX 组装输出 | Step 5（终步） |
| foxpre-orchestrator | `skills/foxpre-orchestrator/SKILL.md` | 编排调度 | 驱动层 |
| foxpre-bidder-manager | `skills/foxpre-bidder-manager/SKILL.md` | 投标人管理 | 支撑服务 |

---

## 9. 阶段五：SOLO Coder 调度引擎

### 9.1 目标

实现投标工作流的主控调度逻辑。**foxpre 的核心模块。**

### 9.2 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/solo-coder.ts` | 状态机 + 6 个核心函数 |
| `apps/daemon/tests/foxpre/solo-coder.test.ts` | 12 个测试用例 |
| `packages/contracts/src/foxpre/constants.ts` | **修改**：AGENT_CODES 对齐实际 9 Agent |

### 9.3 核心函数

- `createWorkflow(db, projectId)` — 按 DAG 创建 7 条任务（原子事务、幂等）
- `advanceWorkflow(db, projectId)` — 检查依赖，推进满足条件的任务
- `completeTask(db, projectId, taskId, outputPath?)` — 标记任务完成
- `failTask(db, projectId, taskId, errorLog)` — 标记失败 + 项目状态流转
- `triggerHarness(db, projectId)` — 收集片段 → 调用 `runFullHarness` → 流转状态
- `getWorkflowState(db, projectId)` — 返回完整工作流状态（供看板消费）

### 9.4 设计决策

- 本阶段实现纯状态机逻辑，不依赖 HTTP API。进程派遣（`dispatchAgent`）由阶段六完成。
- DAG 硬编码（非通用工作流引擎），依赖图固定 5 步 9 Agent。
- 状态值与 `BID_PROJECT_STATUS` 常量对齐。

---

## 10. 阶段六：Daemon API 路由

### 10.1 目标

注册 foxpre 的 HTTP API 端点，修改 server.ts。

### 10.2 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/bid-routes.ts` | 项目 CRUD + 工作流控制 |
| `apps/daemon/src/foxpre/style-routes.ts` | 样式模板 CRUD |
| `apps/daemon/src/foxpre/bidder-routes.ts` | 投标人信息库 CRUD |
| `apps/daemon/src/foxpre/field-crypto.ts` | AES-256-GCM 加密工具 |
| `apps/daemon/src/foxpre/kanban-sse.ts` | 看板 SSE 推送流 |
| `apps/daemon/src/server.ts` | **修改**：import + 注册调用 |

### 10.3 server.ts 修改位置

在 `registerMediaRoutes` 调用之后、`registerRoutineRoutes` 调用之前插入（实际行号 ~6291 之后）。

**命名规范**：遵循项目现有的英文命名约定（`registerProjectRoutes`、`registerMediaRoutes`），不使用中文函数名。

```typescript
// import 段（在 registerMediaRoutes 的 import 附近）
import { registerFoxpreBidRoutes } from './foxpre/bid-routes.js';
import { registerFoxpreStyleRoutes } from './foxpre/style-routes.js';
import { registerFoxpreBidderRoutes } from './foxpre/bidder-routes.js';

// 注册段（在 registerMediaRoutes 调用之后）
registerFoxpreBidRoutes(app, { db, http: httpDeps, ... });
registerFoxpreStyleRoutes(app, { db, http: httpDeps, ... });
registerFoxpreBidderRoutes(app, { db, http: httpDeps, ... });
```

**设计约束**：
- foxpre 路由注册函数签名必须与项目现有的 `register*Routes(app, deps)` 模式一致
- 函数名使用英文 `registerFoxpre*` 前缀，确保 `pnpm guard` 零错误
- 注册位置固定在 `registerMediaRoutes` 和 `registerRoutineRoutes` 之间，减少 rebase 冲突

---

## 11. 阶段七：Web 用户界面

### 11.1 目标

实现 foxpre 的全部 Web UI。**工作量最大的阶段。**

### 11.2 修改现有文件

| 文件 | 修改内容 | 行数 |
|------|---------|------|
| `apps/web/src/components/NewProjectPanel.tsx` | CreateTab 追加 `'bid'` + 条件渲染委托给独立组件 | +15~20 |
| `apps/web/src/components/ProjectView.tsx` | kind='bid' 时显示"标书" Tab | +10~15 |

### 11.3 新增 UI 组件（18 个）

| 组件 | 文件 |
|------|------|
| CreateProjectForm | `apps/web/src/components/foxpre/CreateProjectForm.tsx` |
| BidWarRoom | `apps/web/src/components/foxpre/BidWarRoom.tsx` |
| KanbanBoard | `apps/web/src/components/foxpre/KanbanBoard.tsx` |
| DocumentPreview | `apps/web/src/components/foxpre/DocumentPreview.tsx` |
| AgentChatPanel | `apps/web/src/components/foxpre/AgentChatPanel.tsx` |
| + 其他 | 选择器、表单、卡片等 ~12 个 |

### 11.4 新增页面（4 个）

| 路由 | 文件 |
|------|------|
| `/foxpre/settings` | `apps/web/app/foxpre/settings/page.tsx` |
| `/foxpre/styles` | `apps/web/app/foxpre/styles/page.tsx` |

### 11.5 验证

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
# 手动：创建 bid 项目 → UI 加载 → Tab 切换
```

---

## 12. 阶段八：DOCX 组装与输出

### 12.1 目标

实现最终 DOCX 文件的合并组装。

### 12.2 文件

| 文件 | 说明 |
|------|------|
| `apps/daemon/src/foxpre/docx-assembler.ts` | 6 步组装管线 |

---

## 13. 阶段九：集成测试与打磨

### 13.1 目标

全量验证 + i18n + guard。

### 13.2 任务

| 任务 | 说明 |
|------|------|
| 9.1 | 集成测试（5 个场景） |
| 9.2 | i18n 词条（18 种语言） |
| 9.3 | `pnpm guard && pnpm typecheck` 全量通过 |

---

## 14. CLI 表面规划（UI/CLI 双轨）

**依据**：`AGENTS.md` 规定每个用户能力必须同时通过 Web UI **和** `od` CLI 可达。

### 14.1 设计模式

遵循现有参考实现（`od automation`、`od plugin`、`od research`）：

```
HTTP endpoint (daemon/src/foxpre/*-routes.ts)
    → CLI subcommand (daemon/src/cli.ts, SUBCOMMAND_MAP)
    → contracts type (packages/contracts/src/foxpre/api.ts)
```

### 14.2 子命令规划

| 子命令 | 对应 API | 说明 | --json 支持 |
|--------|---------|------|------------|
| `od bid create` | `POST /api/foxpre/bid` | 创建投标项目 | ✅ |
| `od bid list` | `GET /api/foxpre/bid` | 列出投标项目 | ✅ |
| `od bid status <id>` | `GET /api/foxpre/bid/:id/status` | 查看项目状态 | ✅ |
| `od bid start <id>` | `POST /api/foxpre/bid/:id/start` | 启动工作流 | ✅ |
| `od bid pause <id>` | `POST /api/foxpre/bid/:id/pause` | 暂停工作流 | ✅ |
| `od bid review <id>` | `GET /api/foxpre/bid/:id/review` | 查看审核报告 | ✅ |
| `od bid output <id>` | `GET /api/foxpre/bid/:id/output` | 下载最终 DOCX | — |
| `od bidder add` | `POST /api/foxpre/bidder` | 添加投标人 | ✅ |
| `od bidder list` | `GET /api/foxpre/bidder` | 列出投标人 | ✅ |
| `od style list` | `GET /api/foxpre/style` | 列出样式模板 | ✅ |
| `od style create` | `POST /api/foxpre/style` | 创建样式模板 | ✅ |

### 14.3 CLI 注册要点

**文件**：`apps/daemon/src/cli.ts`

```typescript
// 在 SUBCOMMAND_MAP 中追加
import {
  bidCreateCommand,
  bidListCommand,
  bidStatusCommand,
  bidStartCommand,
  bidPauseCommand,
  bidReviewCommand,
  bidOutputCommand,
} from './commands/bid.js';
import {
  bidderAddCommand,
  bidderListCommand,
} from './commands/bidder.js';
import {
  styleListCommand,
  styleCreateCommand,
} from './commands/style.js';

// SUBCOMMAND_MAP 追加条目（按字母序，bid 在 automation 之前）
bid: {
  create: bidCreateCommand,
  list: bidListCommand,
  status: bidStatusCommand,
  start: bidStartCommand,
  pause: bidPauseCommand,
  review: bidReviewCommand,
  output: bidOutputCommand,
},
bidder: {
  add: bidderAddCommand,
  list: bidderListCommand,
},
style: {
  list: styleListCommand,
  create: styleCreateCommand,
},
```

### 14.4 CLI 实现节奏

CLI 子命令与对应 API 路由同期交付，不跨阶段拆分。即：

| 阶段 | API 路由 | CLI 子命令 | 交付物 |
|------|---------|-----------|--------|
| 阶段六 ✅ | `bid-routes.ts` | `od bid {create,list,status,start,harness,review}` | `cli.ts` 内联 `runBid` |
| 阶段六 ✅ | `bidder-routes.ts` | `od bidder {add,list,get,delete}` | `cli.ts` 内联 `runBidder` |
| 阶段六 ✅ | `style-routes.ts` | `od style {create,list,get,delete}` | `cli.ts` 内联 `runStyle` |

**原则**：不允许 "CLI 稍后补"——CLI 与 API 路由在同一阶段交付，与 UI 同为完成标准。

---

## 15. 文档层级关系

```
0613_master-plan.md              ← 唯一主索引（修改面、九阶段、风险、CLI）
  ├── 0613_phase-zero-contract.md ← 阶段零详细步骤
  ├── 0613_phase-one-database.md  ← 待创建
  ├── ...                          ← 后续阶段计划
  └── （不再复制其他文档内容）

../architecture-analysis.md       ← 架构分析（参考）
../foxpre-requirements-spec.md    ← 需求规格（参考）
../foxpre__implementation-plan.md ← 原始实施计划（历史参考，v1.2）
../implementation-roadmap.md      ← 实施路线图（历史参考，v1.0）
```

**规则**：
- `plan/` 目录下的文档是**唯一执行依据**
- 其他文档是**参考背景**，不重复其内容
- 每个阶段一个独立 `0613_phase-*` 文件，主计划只保留摘要

---

## 16. 风险矩阵

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| NewProjectPanel.tsx 上游重构冲突 | 🔴 高 | Tab body 委托给独立组件，改面最小化 |
| Windows better-sqlite3 编译 | 🟡 中 | VS Build Tools 2022+ |
| Pandoc 系统依赖 | 🟡 中 | 文档明确 + 启动检测 |
| Windows DPAPI 原生依赖 | 🟡 中 | MVP 用内置 crypto，Phase2 集成 node-dpapi |
| 上游 rebase 维护 | 🟡 中 | 每两周 rebase，修改面仅 6 个文件 |
| scenario-defaults.test.ts 静默跳过 | 🟡 中 | 步骤 0.4 手动追加用例 + 后续升级类型为 Record<ProjectKind> |
| OD minor 版本 patch 失效 | 🟡 中 | CI 兼容矩阵自动检测；每 OD 版本发布后 48h 内验证（仅独立包模式） |
| 用户 OD 源码有本地修改导致 patch 冲突 | 🟢 低 | postinstall 明确报错 + 提示手动解决（仅独立包模式） |

---

## 17. 每次提交前验证关口

```bash
pnpm guard          # 代码规范
pnpm typecheck      # 类型检查
# 阶段相关测试       # 功能验证
```

---

## 18. 子计划索引

| 计划文档 | 内容 | 状态 |
|---------|------|------|
| `0613_phase-zero-contract.md` | 阶段零详细执行步骤 | ✅ 已完成 |
| `0614_phase-four-agent-skills.md` | 阶段四开发提示词 | ✅ 已完成 |
| `0614_phase-five-solo-coder.md` | 阶段五开发提示词 | ✅ 已完成 |
| `0614_phase-six-api-routes.md` | 阶段六开发提示词 | ✅ 已完成（5 新增 + 3 修改，18 端点） |
| `0614_phase-six-merge-report.md` | 阶段六审查报告 | ✅ 已完成 |

---

## 19. 独立包发布策略

### 19.1 问题

foxpre 当前架构修改 OD 源码中 ~6 个文件。能否作为独立 npm 包发布，为**已安装 Open Design 的用户**提供标书制作能力，而不要求他们维护 foxpre 分支？

### 19.2 根因

`ProjectKind` 是 OD 的编译时硬编码联合类型，OD 没有 `projectKind` 插件注册扩展点：

```typescript
// packages/contracts/src/api/projects.ts — 必须编辑
export type ProjectKind =
  | 'prototype' | 'deck' | 'template' | 'other'
  | 'image' | 'video' | 'audio'
  | 'bid';  // ← foxpre 依赖此行
```

这触发了连锁扩散。~22 个 OD 文件消费 `ProjectKind`，其中 6 个需要最小修改。

### 19.3 三条路径

#### 路径 A：patch-package 独立包（推荐，立即可行）

```
用户操作：
  1. pnpm add @foxpre/bid-maker        # 安装 foxpre 独立包
  2. npx patch-package @foxpre/bid-maker  # 自动向 OD 注入最小补丁
  3. pnpm tools-dev                     # 正常启动，bid 选项卡可用
```

**架构**：

```
@foxpre/bid-maker/                    ← 独立 Git 仓库，独立 npm 发布
├── package.json
├── patches/                          ← patch-package 补丁文件
│   └── open-design+<version>.patch   ← 含 6 个文件的 ~40 行修改
├── src/
│   ├── contracts/                    ← 等价于 packages/contracts/src/foxpre/
│   ├── daemon/                       ← 等价于 apps/daemon/src/foxpre/
│   ├── web/                          ← 等价于 apps/web/src/components/foxpre/
│   └── skills/                       ← 等价于 skills/foxpre-*/
├── scripts/
│   ├── install.js                    ← npm postinstall 钩子，执行 patch-package
│   └── doctor.js                     ← 兼容性检查
└── README.md
```

**补丁内容**（~40 行，可审计）：

| # | OD 文件 | 修改 |
|---|---------|------|
| 1 | `packages/contracts/src/api/projects.ts` | 向 `ProjectKind` 追加 `\| 'bid'` |
| 2 | `packages/contracts/src/plugins/scenario-defaults.ts` | Record 追加 `bid: 'od-new-generation'` |
| 3 | `packages/contracts/tests/scenario-defaults.test.ts` | expected 追加 `bid: 'od-new-generation'` |
| 4 | `apps/daemon/src/server.ts` | import + 调用 `initFoxpreDatabase(db)` + 路由注册 |
| 5 | `apps/web/src/components/NewProjectPanel.tsx` | 追加 `'bid'` Tab + `<CreateProjectForm />` |
| 6 | `apps/web/src/components/ProjectView.tsx` | 追加 `kind='bid'` 分支 |

**版本兼容策略**：

```
@foxpre/bid-maker@1.0.0  →  兼容 OD >= 0.4.0, < 0.5.0
@foxpre/bid-maker@1.1.0  →  兼容 OD >= 0.5.0, < 0.6.0
@foxpre/bid-maker@2.0.0  →  兼容 OD >= 0.6.0, < 1.0.0
```

每个 OD minor 版本发布后，foxpre 维护者验证补丁 → 必要时更新 patches → 发布新的 `@foxpre/bid-maker` 小版本。用户升级 OD 后同步升级 foxpre 包版本。

| 维度 | 评估 |
|------|------|
| 用户安装复杂度 | 🟢 两个命令（add + patch-package） |
| foxpre 代码独立性 | 🟢 100% 独立仓库，100% 独立 npm 发布 |
| OD 升级兼容 | 🟡 patches 文件按 OD semver 范围维护 |
| OD 维护者负担 | 🟢 零上游负担 |
| 补丁审计性 | 🟢 ~40 行纯文本 diff，可开箱阅读 |
| 即战力 | 🟢 立即可行，不依赖 OD 上游变更 |

#### 路径 B：OD 原生插件扩展点（长远理想方案）

向 OD 贡献一个 `projectKind` 扩展点：

```json
// plugins/_official/scenarios/od-foxpro-bid/open-design.json
{
  "od": {
    "kind": "scenario",
    "projectKind": {
      "kind": "bid",
      "label": "投标标书",
      "icon": "file-text",
      "defaultScenarioPlugin": "od-foxpro-bid"
    }
  }
}
```

OD 框架变更：
- 扫描所有插件的 `projectKind` → 动态构建联合类型
- `DEFAULT_SCENARIO_PLUGIN_BY_KIND` 从编译时常量变为启动时注册表
- `NewProjectPanel` Tab 列表从静态 switch/case 变为动态注册
- `ProjectView` kind 分支从静态 switch/case 变为插件提供的组件

| 维度 | 评估 |
|------|------|
| 用户体验 | 🟢 即插即用，零 OD 修改 |
| OD 源码变更 | 🔴 需上游重大架构变更（~500+ 行重构） |
| 时间线 | OD 核心团队参与，月级别 |
| foxpre 受益 | 🟢 零侵入，零维护**

#### 路径 C：独立 Electron 应用（最大隔离，最高成本）

foxpre 作为独立桌面应用，通过 OD 的 HTTP API（`/api/chat`、`/api/projects`）调用 OD 生成能力。自带 UI、agent skills、SQLite 数据库。

| 维度 | 评估 |
|------|------|
| OD 源码侵入 | 🟢 零 |
| 用户体验 | 🔴 两个应用 + 上下文切换 |
| 维护成本 | 🔴 完整独立应用生命周期（Electron 版本、签名、分发） |
| 开发量 | 🔴 全套 UI + agent 调度 + 文档管线重建 |

### 19.4 推荐路线图

```
阶段 1（当前）  →  路径 A：patch-package 独立包
                        ↓
                    用户反馈 + OD 版本适配
                        ↓
阶段 2（6-12 月）→  向 OD 上游提出 projectKind 扩展点 RFC
                        ↓
                    OD 核心团队评审 + 实现
                        ↓
阶段 3（OD 支持后）→  迁移到路径 B：零侵入 plugin
                        ↓
                    废弃 patches/，保留纯 foxpre 代码
```

**路径 A → B 的迁移成本**：
- foxes 自有代码（daemon/foxpre/、web/components/foxpre/、skills/foxpre-*/、contracts/foxpre/）无需修改
- 仅删除 `patches/` 目录和 `scripts/install.js`
- 新增 `open-design.json` 插件清单

### 19.5 独立包仓库结构

```
foxpro-bid-maker/                         ← GitHub: foxpre/bid-maker
├── .github/
│   └── workflows/
│       ├── ci.yml                        ← pnpm test + typecheck
│       ├── compat-matrix.yml             ← 多 OD 版本兼容性测试
│       └── publish.yml                   ← npm publish
├── patches/
│   ├── open-design+0.4.0.patch
│   └── open-design+0.5.0.patch
├── src/
│   ├── contracts/
│   │   ├── constants.ts                  ← 智能体代号、状态常量
│   │   ├── api.ts                        ← BidDocumentRef、DTO 类型
│   │   └── index.ts
│   ├── daemon/
│   │   ├── db.ts                         ← 11 张表 DDL + 迁移 + 种子
│   │   ├── bid-routes.ts                 ← /api/foxpre/bid
│   │   ├── bidder-routes.ts              ← /api/foxpre/bidder
│   │   ├── style-routes.ts               ← /api/foxpre/style
│   │   ├── docx-assembler.ts             ← DOCX 组装管线
│   │   ├── document-pipeline.ts          ← 文档处理管线
│   │   ├── harness-engine.ts             ← 门禁审核引擎
│   │   ├── solo-coder.ts                 ← SOLO Coder 调度引擎
│   │   └── commands/
│   │       ├── bid.ts                    ← od bid 子命令
│   │       ├── bidder.ts                 ← od bidder 子命令
│   │       └── style.ts                  ← od style 子命令
│   ├── web/
│   │   ├── CreateProjectForm.tsx         ← 创建投标项目表单
│   │   ├── BidWarRoom.tsx               ← 投标作战室
│   │   ├── KanbanBoard.tsx               ← 看板
│   │   ├── DocumentPreview.tsx           ← 文档预览
│   │   └── ...                           ← ~12 个组件
│   └── skills/
│       ├── foxpre-analyzer/SKILL.md      ← 招标文件分析器
│       ├── foxpre-writer/SKILL.md        ← 技术方案编写器
│       └── ...                           ← 7 个其它 skill
├── scripts/
│   ├── postinstall.js                    ← npm postinstall: 应用 patches
│   └── doctor.js                         ← 兼容性检查（OD 版本、Node、pnpm）
├── package.json
├── AGENTS.md
└── README.md
```

### 19.6 postinstall 脚本设计

```javascript
// scripts/postinstall.js — npm postinstall 钩子
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. 定位宿主 OD 仓库根目录
const odRoot = findODRoot(process.cwd());
if (!odRoot) {
  console.warn('[foxpre] Open Design not found — patches skipped.');
  console.warn('[foxpre] Run "npx patch-package" in your OD root after install.');
  process.exit(0);
}

// 2. 检测 OD 版本（从 package.json 或 od --version）
const odVersion = getODVersion(odRoot);
const patchFile = path.join(__dirname, '..', 'patches', `open-design+${odVersion}.patch`);

if (!fs.existsSync(patchFile)) {
  console.error(`[foxpre] No patch for Open Design ${odVersion}.`);
  console.error(`[foxpre] Supported versions: ${listPatches()}`);
  process.exit(1);
}

// 3. 应用补丁
execSync(`npx patch-package --patch-dir ${path.dirname(patchFile)}`, {
  cwd: odRoot,
  stdio: 'inherit',
});
console.log(`[foxpre] Patch applied for Open Design ${odVersion}.`);
```

### 19.7 CI 兼容矩阵

```yaml
# .github/workflows/compat-matrix.yml
strategy:
  matrix:
    od-version: ['0.4.0', '0.5.0', '0.6.0']  # 当前支持的 OD 版本
steps:
  - uses: actions/checkout@v4
  - run: pnpm install
  - run: pnpm test:compat --od-version ${{ matrix.od-version }}
```

### 19.8 风险更新

独立包发布引入以下新风险：

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| OD minor 版本补丁失效 | 🟡 中 | CI 兼容矩阵自动检测；每 OD 版本发布后 48h 内验证 |
| pnpm workspace 中 patch-package 行为差异 | 🟡 中 | 支持两种模式：workspace 内（开发者）和独立包（用户） |
| 用户 OD 源码有本地修改导致 patch 冲突 | 🟢 低 | postinstall 明确报错 + 提示手动解决 |
| npm registry 分发品与 OD 版本不对齐 | 🟡 中 | `package.json` 的 `engines` 字段声明 OD 版本约束 | |

# foxpre 项目上下文移交

**移交日期**：2026-06-14
**移交原因**：新会话启动，需要完整项目上下文

---

## 1. 你的角色：架构师

你是 foxpre 项目的**架构师**，不是开发工程师。你的职责：

1. 制定架构方案和开发计划
2. 审查 atomcode（开发工程师）的开发成果
3. 管理 git 分支、版本跟踪、上游同步
4. 回答技术决策问题

**你不会**：直接写业务代码（那是 atomcode 的工作）。但你会写计划文档、提示词文档、上下文移交文档。

### 核心约束

- **最小化修改 Open Design 源码**（目前 4 个文件，未来最多 6 个）
- 所有 foxpre 代码在 `foxpre` 命名空间下（新目录，不会与 OD 升级冲突）
- 数据库表使用 `foxpre_` 前缀，物理隔离 OD 核心表

---

## 2. foxpre 是什么

foxpre（投标标书制作）是基于 Open Design 的**信息化类 IT 项目投标文件多智能体协作系统**。

- **产品形态**：Open Design 的 ProjectKind 扩展（`'bid'`），不是独立应用
- **核心创新**：模拟真实投标团队分工，9 个专业 Agent 由 Orchestrator 编排协作
- **架构定位**：ProjectKind 扩展，不是 OD Plugin。复用 OD 的 Agent 运行时、HTTP API、SQLite、Web UI 框架。

相关快速入口：

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求规格 | `docs/foxpre/foxpre-requirements-spec.md` | 产品定义、架构总览 |
| 架构分析 | `docs/foxpre/architecture-analysis.md` | 技术决策理由 |
| 主开发计划 | `docs/foxpre/plan/0613_master-plan.md` | 9 阶段计划 + 修改面 + 升级策略 |
| Phase 0 合同 | `docs/foxpre/plan/0613_phase-zero-contract.md` | 阶段零设计规格 |
| Phase 4 提示词 | `docs/foxpre/plan/0614_phase-four-agent-skills.md` | 发给 atomcode 的阶段四开发任务 |

---

## 3. 当前项目状态

### 3.1 阶段进度

| 阶段 | 名称 | 状态 | 产出 |
|------|------|------|------|
| 阶段零 | Contract 类型验证 | ✅ 完成 | `packages/contracts/src/foxpre/api.ts`, `constants.ts`, `index.ts` |
| 阶段一 | 数据库层 (11张表) | ✅ 完成 | `apps/daemon/src/foxpre/db.ts` (306行) |
| 阶段二 | 文档处理管线 | ✅ 完成 | `apps/daemon/src/foxpre/document-pipeline.ts` (199行) |
| 阶段三 | 门禁审核引擎 | ✅ 完成 | `apps/daemon/src/foxpre/harness-engine.ts` (530行) |
| **阶段四** | **Agent Skills (9个)** | **🔄 atomcode 已开始** | `skills/foxpre-*/SKILL.md` (9 个文件已修改) |
| 阶段五 | SOLO Coder 调度引擎 | ⬜ 待开发 | `apps/daemon/src/foxpre/solo-coder.ts` |
| 阶段六 | Daemon API 路由 | ⬜ 待开发 | 5 个路由文件 + `field-crypto.ts` |
| 阶段七 | Web UI | ⬜ 待开发 | 18 个组件 + 4 个页面 |
| 阶段八 | DOCX 组装输出 | ⬜ 待开发 | |
| 阶段九 | 集成测试 + i18n | ⬜ 待开发 | |

### 3.2 阶段四当前状态

atomcode 已开始编辑 9 个 SKILL.md 文件。工作区当前有修改：

```
M  skills/foxpre-analyzer/SKILL.md
M  skills/foxpre-bidder-manager/SKILL.md
M  skills/foxpre-biz-writer/SKILL.md
M  skills/foxpre-docx-assembler/SKILL.md
M  skills/foxpre-harness-runner/SKILL.md
M  skills/foxpre-orchestrator/SKILL.md
M  skills/foxpre-qual-writer/SKILL.md
M  skills/foxpre-style-checker/SKILL.md
M  skills/foxpre-tech-writer/SKILL.md
```

**未提交**。atomcode 完成后需审查（参照 `docs/foxpre/plan/0614_phase-four-agent-skills.md` 验收标准）。

---

## 4. Git 配置

### 4.1 远程仓库

```
origin    https://github.com/webskying/open-design.git  (你的 fork，public)
upstream  https://github.com/nexu-io/open-design.git    (官方仓库)
```

### 4.2 分支结构

```
foxpre/v0.10/dev  ← 当前开发分支
  ├── da5d893  foxpre: wire foxpre into OD contracts and daemon startup  (4 OD 文件, +5 行)
  ├── f29d293  foxpre: add all foxpre-owned files                        (25 个新文件)
  └── 3c3d45a  v0.10.0 tag ← 与 upstream 共享的 git 祖先 ✅
```

### 4.3 关键信息

- GitHub 用户：`webskying`
- Classic token：`REDACTED_TOKEN`（repo + workflow 权限）
- Fork：`https://github.com/webskying/open-design`（public fork，不可改 private）
- 均已推送并同步

### 4.4 日常操作

```bash
# 同步上游最新代码
git fetch upstream

# 合并上游最新 main（测试用，不实际 merge）
git merge --no-commit --no-ff upstream/main && git merge --abort

# 推送开发分支
git push origin foxpre/v0.10/dev

# 查看状态
git status
git log --oneline -5 --decorate
```

### 4.5 合并能力验证

| 目标 | merge-base 存在? | 自动合并? |
|------|-----------------|----------|
| v0.10.1 | ✅ `3c3d45aa` | ✅ 通过 |
| upstream/main (最新) | ✅ `3c3d45aa` | ✅ 通过 |

核心能力：`git merge upstream/v0.12.0` 将正常工作 —— 4 个 OD 文件自动合并，25 个 foxpre 文件零冲突。

---

## 5. 修改面总览

### 5.1 已修改的 OD 文件（阶段零-三）

| # | 文件 | 修改量 | 说明 |
|---|------|--------|------|
| 1 | `packages/contracts/src/index.ts` | +1 行 | `export * from './foxpre/index.js';` |
| 2 | `packages/contracts/src/api/projects.ts` | +1 类型 | `ProjectKind` 联合追加 `\| 'bid'` |
| 3 | `apps/daemon/src/server.ts` | +2 行 | `import { initFoxpreDatabase }` + 调用 |

### 5.2 后续需修改的 OD 文件（阶段六-七）

| # | 文件 | 预计修改量 |
|---|------|-----------|
| 4 | `apps/web/src/components/NewProjectPanel.tsx` | +15~20 行 |
| 5 | `apps/web/src/components/ProjectView.tsx` | +10~15 行 |
| 6 | `apps/daemon/src/server.ts` (追加) | +5 行（路由注册） |

### 5.3 foxpre 自有文件（零冲突）

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `packages/contracts/src/foxpre/` | 3 | api.ts, constants.ts, index.ts |
| `apps/daemon/src/foxpre/` | 3 | db.ts, document-pipeline.ts, harness-engine.ts |
| `apps/daemon/tests/foxpre/` | 3 | db.test.ts (23), document-pipeline.test.ts (7), harness-engine.test.ts (11) |
| `skills/foxpre-*/` | 9 | 每个 agent 一个 SKILL.md |
| `docs/foxpre/` | 7 | AGENTS.md + 需求/架构/计划文档 |

**总计 ~28 个文件**，全部在 foxpre 命名空间下。OD 升级不会触碰这些目录。

---

## 6. 关键架构决策

### 6.1 三层防御（防止 OD 升级悄悄破坏 foxpre）

| 层 | 机制 |
|----|------|
| 编译期 | `ProjectKind` 是 TypeScript 联合类型，任何变更在 `pnpm typecheck` 阶段暴露 |
| 运行时 | `foxpre_` 表前缀物理隔离，OD migrate 不认识 foxpre 表 |
| 进程级 | foxpre 零修改 OD 基础设施（memory、connectors、plugins），仅通过 HTTP API 消费 |

### 6.2 数据架构

- foxpre 不修改 OD 知识库系统（memory、connectors）
- 4 张业务表（bidders, qualifications, bidder_projects, project_references）+ 3 张系统表（projects, tasks, fragments）+ 2 张规则/模板表（style_templates, harness_rules）+ 1 张审核表（review_history）+ 1 张迁移表（migrations）= **11 张表**
- 快照模式：创建项目时一次性导入投标人数据到本地 SQLite，不依赖外部服务

### 6.3 Agent 工作流 DAG

```
           Analyzer
          /    |    \
   TechWriter  BizWriter  QualWriter
          \    |    /
         HarnessRunner    ← 门禁门
              |
        StyleChecker
              |
       DocxAssembler      ← 最终输出
```

BidderManager 是支撑服务，不参与主 DAG，按需被 QualWriter/BizWriter 查询。

### 6.4 9 个 Agent 角色

| Agent | 职责 | DAG 位置 |
|-------|------|---------|
| foxpre-analyzer | 招标文件解析 | Step 1 |
| foxpre-tech-writer | 技术方案撰写 | Step 2（并行） |
| foxpre-biz-writer | 商务方案撰写 | Step 2（并行） |
| foxpre-qual-writer | 资质文件编写 | Step 2（并行） |
| foxpre-harness-runner | 门禁审核执行 | Step 3（Gate） |
| foxpre-style-checker | 样式合规检查 | Step 4 |
| foxpre-docx-assembler | DOCX 组装输出 | Step 5（终步） |
| foxpre-orchestrator | 编排调度 | 驱动层 |
| foxpre-bidder-manager | 投标人管理 | 支撑服务 |

---

## 7. 核心代码速查

### 7.1 数据库初始化 (`apps/daemon/src/foxpre/db.ts`)

- `initFoxpreDatabase(db: SqliteDb): void` — 幂等初始化
- Seed 数据：4 个样式模板（template-gov/biz/tech/comprehensive）+ 12 条门禁规则（5 类别）
- 使用 `db.transaction()` 原子操作
- 迁移框架：`foxpre_migrations` 表独立追踪版本

### 7.2 文档管线 (`apps/daemon/src/foxpre/document-pipeline.ts`)

- `parseDocument(filePath): Fragment[]` — Pandoc DOCX/PDF → Markdown → `##` 标题分节
- `importDocument(db, projectId, fragments): void` — 原子批量插入

### 7.3 门禁引擎 (`apps/daemon/src/foxpre/harness-engine.ts`)

- `loadActiveRules(db): HarnessRule[]` — 从种子数据读取规则
- `checkFragment(fragment, rule): RuleResult` — 单条检查（策略模式分发 5 类别）
- `runFullHarness(db, projectId, fragments): HarnessSummary` — 便捷全流程

### 7.4 合同类型 (`packages/contracts/src/foxpre/api.ts`)

关键类型：`BidProjectMetadata`, `AgentTask`, `ReviewReport`, `RuleResult`, `StyleTemplate`, `Bidder`, `CreateBidProjectRequest`

### 7.5 常量 (`packages/contracts/src/foxpre/constants.ts`)

```typescript
KANBAN_COLUMNS = { TODO: '待启动', IN_PROGRESS: '进行中', REVIEW: '等待审核', NEEDS_REVISION: '需修改', DONE: '已完成' }
FoxpreTaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
BidProjectStatus = 'draft' | 'analyzing' | 'writing' | 'reviewing' | 'completed' | 'failed'
```

---

## 8. 审查规则

当 atomcode 提交阶段成果时，作为架构师必须进行审查。审查维度：

### 必须检查的项

1. **OD 修改面**：是否超过 6 个文件？是否触碰了 OD 基础设施？
2. **表前缀**：所有新 SQL 表名是否以 `foxpre_` 开头？
3. **类型合同**：是否从 `@open-design/contracts` 导出，而非直接引用？
4. **测试覆盖**：是否有对应的 test 文件？测试是否与规格对齐？
5. **git 状态**：提交是否在 `foxpre/v0.10/dev` 分支？commit message 格式是否正确？
6. **guard + typecheck**：`pnpm guard` 和 `pnpm typecheck` 是否通过？

### 审查流程

1. 读 atomcode 的提交 → `git diff origin/foxpre/v0.10/dev`
2. 对照对应阶段的计划文档（`docs/foxpre/plan/0614_phase-four-agent-skills.md` 等）
3. 逐条检查验收标准
4. 总结：通过/需修改/阻塞，附具体问题列表

---

## 9. 常用命令

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm typecheck

# 代码规范
pnpm guard

# foxpre 测试
pnpm --filter @open-design/daemon test tests/foxpre/

# 类型检查（web）
pnpm --filter @open-design/web typecheck

# 查看 git 状态
git status
git log --oneline -5 --decorate
git diff --stat origin/foxpre/v0.10/dev

# 推送
git push origin foxpre/v0.10/dev
```

---

## 10. 待处理事项

| # | 事项 | 状态 |
|---|------|------|
| 1 | atomcode 阶段四成果审查 | 🔄 SKILL.md 已修改，未提交，待审查 |
| 2 | `docs/foxpre/plan/0614_phase-four-agent-skills.md` 提交 | ⬜ 未提交（新文件） |
| 3 | 阶段五 atomcode 提示词准备 | ⬜ 待准备 |
| 4 | `docs/foxpre/plan/0613_master-plan.md` 阶段零状态更新 | ⬜ 主计划仍显示"待执行" |

---

**本文件是权威的上下文入口。新会话 agent 读完此行后，应能回答：foxpre 是什么、当前在哪、下一步做什么、怎么审查。**

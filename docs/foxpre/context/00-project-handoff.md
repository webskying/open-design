# foxpre 项目上下文移交

**移交日期**：2026-06-14（更新）
**移交原因**：阶段六审查通过并合入，更新状态

---

## 1. 你的角色：架构师

你是 foxpre 项目的**架构师**，不是开发工程师。你的职责：

1. 制定架构方案和开发计划
2. 审查 atomcode（开发工程师）的开发成果
3. 管理 git 分支、版本跟踪、上游同步
4. 回答技术决策问题

**你不会**：直接写业务代码（那是 atomcode 的工作）。但你会写计划文档、提示词文档、上下文移交文档。

### 核心约束

- **最小化修改 Open Design 源码**（目前 3 个文件已改，总上限 6 个）
- 所有 foxpre 代码在 `foxpre` 命名空间下（新目录，不会与 OD 升级冲突）
- 数据库表使用 `foxpre_` 前缀，物理隔离 OD 核心表
- **atomcode 必须在新分支开发**，审查通过后由架构师合入主分支

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
| 主开发计划 | `docs/foxpre/plan/0613_master-plan.md` | 9 阶段计划 + 修改面 + 升级策略（已刷新） |
| Phase 0 合同 | `docs/foxpre/plan/0613_phase-zero-contract.md` | 阶段零设计规格 |
| Phase 4 提示词 | `docs/foxpre/plan/0614_phase-four-agent-skills.md` | 阶段四（SKILL.md） |
| Phase 5 提示词 | `docs/foxpre/plan/0614_phase-five-solo-coder.md` | 阶段五（solo-coder） |
| Phase 6 提示词 | `docs/foxpre/plan/0614_phase-six-api-routes.md` | 阶段六（API + CLI） ← 下一步 |

---

## 3. 当前项目状态

### 3.1 阶段进度

| 阶段 | 名称 | 状态 | 产出 |
|------|------|------|------|
| ✅ 阶段零 | Contract 类型验证 | 完成 | `packages/contracts/src/foxpre/` (3 文件) |
| ✅ 阶段一 | 数据库层 (11张表) | 完成 | `apps/daemon/src/foxpre/db.ts` |
| ✅ 阶段二 | 文档处理管线 | 完成 | `apps/daemon/src/foxpre/document-pipeline.ts` |
| ✅ 阶段三 | 门禁审核引擎 | 完成 | `apps/daemon/src/foxpre/harness-engine.ts` |
| ✅ 阶段四 | Agent Skills (9个) | 完成 | `skills/foxpre-*/SKILL.md` (9 文件) |
| ✅ 阶段五 | SOLO Coder 调度引擎 | 完成 | `apps/daemon/src/foxpre/solo-coder.ts` + 测试 |
| ✅ 阶段六 | Daemon API 路由 + CLI | 完成 | 5 路由文件 + field-crypto + server.ts + cli.ts |
| **⬜ 阶段七** | **Web UI** | **待开发** | 18 个组件 + 4 个页面 |
| ⬜ 阶段八 | DOCX 组装输出 | 待开发 | |
| ⬜ 阶段九 | 集成测试 + i18n | 待开发 | |

### 3.2 下一阶段：阶段七（Web UI）

**提示词文档**：`docs/foxpre/plan/0614_phase-seven-web-ui.md`（待编写）

**产出**：
| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `apps/web/src/components/foxpre/` | 18 个 UI 组件 |
| 新增 | `apps/web/src/app/foxpre/` | 4 个页面路由 |
| 修改 | `apps/web/src/components/NewProjectPanel.tsx` | +15~20 行（projectKind 追加 'bid'） |
| 修改 | `apps/web/src/components/ProjectView.tsx` | +10~15 行（bid 项目视图） |

**分支**：atomcode 需从 `foxpre/v0.10/dev` 切出 `foxpre/v0.10/phase-seven` 进行开发。

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
  ├── a8f6a2914 foxpre: merge phase-six API routes + CLI ← 当前 HEAD
  ├── 09dd31192 foxpre: add daemon API routes + CLI commands
  ├── 4b2e7a0  foxpre: add phase-six API routes development plan
  ├── dceed21  foxpre: refresh master plan
  ├── d221511  foxpre: add SOLO Coder scheduling engine
  ├── 80500d29 foxpre: add context docs, phase-four plan, gitignore
  ├── 218571a  foxpre: upgrade agent skill definitions
  ├── da5d893  foxpre: wire foxpre into OD contracts and daemon startup
  ├── f29d293  foxpre: add all foxpre-owned files
  └── 3c3d45a  v0.10.0 tag ← 与 upstream 共享的 git 祖先 ✅
```

### 4.3 关键信息

- GitHub 用户：`webskying`
- Classic token：`REDACTED_TOKEN`（repo + workflow 权限）
- Fork：`https://github.com/webskying/open-design`（public fork，不可改 private）

### 4.4 日常操作

```bash
# 同步上游最新代码
git fetch upstream

# 推送开发分支
git push origin foxpre/v0.10/dev

# 查看状态
git status
git log --oneline -8 --decorate
```

### 4.5 合并能力验证

| 目标 | merge-base 存在? | 自动合并? |
|------|-----------------|----------|
| v0.10.1 | ✅ `3c3d45aa` | ✅ 通过 |
| upstream/main (最新) | ✅ `3c3d45aa` | ✅ 通过 |

核心能力：`git merge upstream/v0.12.0` 将正常工作 —— OD 文件自动合并，foxpre 文件零冲突。

---

## 5. 修改面总览

### 5.1 已修改的 OD 文件

| # | 文件 | 修改量 | 状态 |
|---|------|--------|------|
| 1 | `packages/contracts/src/index.ts` | +1 行 | ✅ 已完成 |
| 2 | `packages/contracts/src/api/projects.ts` | +1 行（`ProjectKind` 追加 `'bid'`） | ✅ 已完成 |
| 3 | `packages/contracts/src/plugins/scenario-defaults.ts` | +1 行（`Record<ProjectKind>` 补 `bid`） | ✅ 已完成（阶段五） |
| 4 | `apps/daemon/src/server.ts` | +10 行（initFoxpreDatabase + registerFoxpreRoutes） | ✅ 已完成（阶段六） |
| 5 | `apps/daemon/src/cli.ts` | +243 行（3 命令函数 + SUBCOMMAND_MAP） | ✅ 已完成（阶段六） |
| 6 | `apps/web/src/components/PluginLoopHome.tsx` | +1/-1 行（projectKind union 追加 'bid'） | ✅ 已完成（阶段六附带修复） |
| 7 | `apps/web/src/components/NewProjectPanel.tsx` | ⬜ 阶段七 | 待开发 |
| 8 | `apps/web/src/components/ProjectView.tsx` | ⬜ 阶段七 | 待开发 |

### 5.2 foxpre 自有文件（零冲突）

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `packages/contracts/src/foxpre/` | 3 | api.ts, constants.ts, index.ts |
| `apps/daemon/src/foxpre/` | 9 | db.ts, document-pipeline.ts, harness-engine.ts, solo-coder.ts + field-crypto.ts, bid-routes.ts, bidder-routes.ts, style-routes.ts, foxpre-routes.ts |
| `apps/daemon/tests/foxpre/` | 4 | db, document-pipeline, harness-engine, solo-coder（共 53 用例） |
| `skills/foxpre-*/` | 9 | 每个 agent 一个 SKILL.md |
| `docs/foxpre/` | ~12 | AGENTS.md + 需求/架构/计划文档 + context/ |

**总计 ~35 个文件**，全部在 foxpre 命名空间下。

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
- 4 张业务表 + 3 张系统表 + 2 张规则/模板表 + 1 张审核表 + 1 张迁移表 = **11 张表**
- 快照模式：创建项目时一次性导入投标人数据到本地 SQLite

### 6.3 Agent 工作流 DAG

```
           Analyzer (Step 1)
          /    |    \
   TechWriter  BizWriter  QualWriter  (Step 2, 并行)
          \    |    /
         HarnessRunner  ← 门禁门 (Step 3)
              |
        StyleChecker (Step 4)
              |
       DocxAssembler ← 最终输出 (Step 5)
```

BidderManager 是支撑服务，Orchestrator 是驱动层。

### 6.4 阶段六 design decisions（已确认）

1. **CLI 命令内联**：在 `cli.ts` 内定义（不创建 commands/ 目录）
2. **路由聚合**：`foxpre-routes.ts` 统一注册，server.ts 仅 1 行 import + 1 行调用
3. **敏感字段加密**：AES-256-GCM，密钥来自 `FOXPRE_ENCRYPTION_KEY` 环境变量
4. **Kanban SSE**：MVP 轮询模式（每 2 秒查询 getWorkflowState）
5. **分支工作流**：atomcode 在 `foxpre/v0.10/phase-six` 开发，审查通过后合入

---

## 7. 核心代码速查

### 7.1 数据库层 (`apps/daemon/src/foxpre/db.ts`)

- `initFoxpreDatabase(db: SqliteDb): void` — 幂等初始化
- 11 张表 + 4 样式模板 + 12 条门禁规则（种子数据）

### 7.2 文档管线 (`apps/daemon/src/foxpre/document-pipeline.ts`)

- `parseDocument(filePath): Fragment[]` — Pandoc DOCX/PDF → Markdown → `##` 分节
- `importDocument(db, projectId, fragments): void` — 原子批量插入
- `Fragment` 类型：`{ id, sectionTitle, contentMd, orderIndex }`

### 7.3 门禁引擎 (`apps/daemon/src/foxpre/harness-engine.ts`)

- `loadActiveRules(db): HarnessRule[]`
- `runFullHarness(db, projectId, fragments): HarnessSummary`
- `HarnessSummary`：`{ totalRules, passedRules, failedRules, detail }`
- 5 类别策略分发（内容完整性/废标规避/格式一致性/合规性/质量）

### 7.4 调度引擎 (`apps/daemon/src/foxpre/solo-coder.ts`)

- `createWorkflow(db, projectId)` — 按 DAG 创建 7 条任务（原子、幂等）
- `advanceWorkflow(db, projectId)` — 检查依赖并推进
- `completeTask(db, projectId, taskId, outputPath?)` — 标记完成
- `failTask(db, projectId, taskId, errorLog)` — 标记失败 + 项目状态流转
- `triggerHarness(db, projectId)` — 收集片段 → runFullHarness → 状态流转
- `getWorkflowState(db, projectId): WorkflowState` — 看板状态

### 7.5 合同类型 (`packages/contracts/src/foxpre/api.ts`)

关键类型：`BidProjectMetadata`, `AgentTask`, `ReviewReport`, `RuleResult`, `StyleTemplate`, `Bidder`, `CreateBidProjectRequest`, `WorkflowState`（在 solo-coder.ts 中）

### 7.6 常量 (`packages/contracts/src/foxpre/constants.ts`)

```typescript
AGENT_CODES = { ANALYZER, TECH_WRITER, BIZ_WRITER, QUAL_WRITER, HARNESS_RUNNER, STYLE_CHECKER, DOCX_ASSEMBLER, ORCHESTRATOR, BIDDER_MANAGER }
BID_PROJECT_STATUS = { PENDING: '待启动', IN_PROGRESS: '进行中', REVIEW: '审核中', REJECTED: '已驳回', COMPLETED: '已完成' }
TASK_STATUS = { QUEUED: '排队中', RUNNING: '执行中', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消' }
KANBAN_COLUMNS = { TODO: '待启动', IN_PROGRESS: '进行中', REVIEW: '等待审核', NEEDS_REVISION: '需修改', DONE: '已完成' }
```

---

## 8. 审查规则

当 atomcode 提交阶段成果时，作为架构师必须进行审查。审查维度：

### 必须检查的项

1. **OD 修改面**：是否超出计划文件数？是否触碰了 OD 基础设施？
2. **表前缀**：所有新 SQL 表名是否以 `foxpre_` 开头？
3. **类型合同**：是否从 `@open-design/contracts` 导出，而非直接引用？
4. **测试覆盖**：是否有对应的 test 文件？测试是否与规格对齐？
5. **git 状态**：提交是否在正确的分支？commit message 格式是否正确？
6. **guard + typecheck**：`pnpm guard` 和 `pnpm typecheck` 是否通过？

### 审查流程

1. 读 atomcode 的提交 → `git diff foxpre/v0.10/dev`
2. 对照对应阶段的计划文档（`docs/foxpre/plan/0614_phase-*.md`）
3. 逐条检查验收标准
4. 总结：通过/需修改/阻塞，附具体问题列表
5. 通过后执行 `git merge --no-ff` 合入主分支

### 预存问题（已知，非 atomcode 引入）

- `pnpm typecheck` 在 `apps/web` 有 1 个预存错误：`HomeView.tsx:1541` 窄联合类型未包含 `'bid'`，属于阶段七修改范围
- `scenario-defaults.test.ts` 测试用例未追加 `bid` 条目（阶段零遗留，非阻塞）

---

## 9. 常用命令

```bash
# 安装依赖
pnpm install

# 类型检查（contracts + daemon 必须零错误）
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/daemon typecheck

# 代码规范
pnpm guard

# foxpre 测试
pnpm --filter @open-design/daemon test tests/foxpre/

# 查看 git 状态
git status
git log --oneline -8 --decorate
git diff --stat foxpre/v0.10/dev

# 推送
git push origin foxpre/v0.10/dev

# atomcode 阶段六开发分支
git checkout -b foxpre/v0.10/phase-six foxpre/v0.10/dev
```

---

## 10. 待处理事项

| # | 事项 | 状态 |
|---|------|------|
| 1 | atomcode 阶段七开发（Web UI） | ⬜ 待准备提示词 |
| 2 | 阶段七 Web UI 提示词准备 | ⬜ 待架构师编写 |
| 3 | `scenario-defaults.test.ts` 补 `bid` 用例 | ⬜ 阶段零遗留 |
| 4 | `HomeView.tsx:1541` 类型错误修复 | ⬜ 阶段七范围 |
| 5 | `PluginLoopHome.tsx` 已追加 'bid'（阶段六附带） | ✅ 已完成 |

---

**本文件是权威的上下文入口。新会话 agent 读完此行后，应能回答：foxpre 是什么、当前在哪、下一步做什么、怎么审查。**

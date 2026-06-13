# foxpre 架构分析报告

**日期**：2026-06-12
**分析范围**：Open Design Project 子系统完整架构链 + foxpre 扩展可行性

---

## 1. Open Design Project 子系统架构链

### 1.1 四层扩展模型

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Contracts (packages/contracts/)                     │
│  ├── ProjectKind 联合类型（7 种，追加 'bid'）                  │
│  ├── ProjectMetadata（可选字段扩展，零破坏）                   │
│  └── DEFAULT_SCENARIO_PLUGIN_BY_KIND（Record<ProjectKind>）   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Web UI (apps/web/)                                  │
│  ├── NewProjectPanel.tsx（CreateTab + buildMetadata 映射）    │
│  ├── ProjectView.tsx（动态 Tab 系统，kind 条件渲染）            │
│  └── FileWorkspace.tsx（Tab 内容优先级链）                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Daemon (apps/daemon/)                               │
│  ├── server.ts（模块化路由注册 register*Routes）              │
│  ├── project-routes.ts（POST /api/projects，无 kind 白名单）  │
│  ├── chat-routes.ts（POST /api/runs，Agent 调度入口）          │
│  └── runtimes/（RuntimeAgentDef，Agent 运行时抽象）            │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Skills & Templates (skills/, design-templates/)     │
│  ├── skills/<name>/SKILL.md（功能型技能，od.mode: utility）    │
│  └── design-templates/<name>/SKILL.md（渲染型模板）            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 关键发现：类型安全的扩展触发机制

新增 `'bid'` 到 `ProjectKind` 后，TypeScript 编译器会**自动标记**所有需要更新的位置：

| 触发位置 | 文件 | 错误类型 | 强制操作 |
|---------|------|---------|---------|
| Record 穷举 | `scenario-defaults.ts:54` | TS2741: Property 'bid' is missing | 必须为 `bid` 指定默认插件 |
| switch/case | `NewProjectPanel.tsx` | TS7030: Not all paths return | 必须在 buildMetadata 中处理 `bid` |
| 联合类型使用 | 全局 | 无 | `ProjectKind` 是纯数据，无 switch 穷举要求 |

**结论：架构通过 TypeScript 类型系统实现了自动化的扩展检查清单，不会遗漏修改点。**

### 1.3 现有 7 种 ProjectKind 的差异化字段

```
prototype: intent?, fidelity?, platform?, platformTargets?
deck:      speakerNotes?, slideCount?, animations?
template:  templateId?, templateLabel?, animations?
image:     imageModel?, imageAspect?, imageStyle?, promptTemplate?
video:     videoModel?, videoAspect?, videoLength?, promptTemplate?
audio:     audioKind?, audioModel?, audioDuration?, voice?
other:     platform?
```

**foxpre (bid) 的 ProjectMetadata 扩展**：

```typescript
// 建议在 ProjectMetadata 中新增的可选字段
interface BidProjectMetadata extends ProjectMetadata {
  kind: 'bid';
  招标文件名?: string;
  招标编号?: string;
  投标人ID?: string;
  样式模板ID?: string;
  引用项目ID列表?: string[];
  当前审核轮次?: number;
  MCP配置?: Record<string, unknown>;
}
```

### 1.4 路由注册模式分析

server.ts 使用纯函数注册模式，foxpre 注册位置建议：

```typescript
// 当前注册顺序（server.ts:6112-15452）
// registerMcpRoutes
// registerXaiRoutes
// ...
// registerProjectRoutes       ← 项目 CRUD
// registerLiveArtifactRoutes  ← Live Artifact
// registerDesignSystemToolRoutes
// registerMediaRoutes         ← 媒体
// registerRoutineRoutes       ← 自动化
// registerChatRoutes          ← Chat/Run
//
// 建议 foxpre 注册位置：在 registerMediaRoutes 之后，registerRoutineRoutes 之前
// 理由：foxpre 依赖 Project 和 Chat/Run 基础设施，但不被 Routine 依赖
```

### 1.5 Agent 调度链路

```
POST /api/runs (chat-routes.ts)
  → createRun()
    → RuntimeAgentDef (runtimes/types.ts)
      → promptInputFormat: 'text' | 'stream-json'
      → spawn 子进程
    → ChatRun 状态机 (queued → running → succeeded/failed/canceled)
  → SSE 流式推送 (复用现有 SSE 基础设施)
```

foxpre 的 SOLO Coder 通过同一套 `/api/runs` 机制调度 9 个子智能体，无需自建调度引擎。

---

## 2. foxpre 扩展所需修改的文件清单

### 2.1 必须修改的现有文件（6 个）

| 文件 | 修改类型 | 行数估计 | 冲突风险 |
|------|---------|---------|---------|
| `packages/contracts/src/api/projects.ts` | `ProjectKind` 追加 `'bid'` | +1 | 🟢 极低 |
| `packages/contracts/src/plugins/scenario-defaults.ts` | Record 追加条目 | +1 | 🟢 极低 |
| `packages/contracts/tests/scenario-defaults.test.ts` | 测试用例追加 `'bid'` 映射 | +1 | 🟢 极低 |
| `apps/web/src/components/NewProjectPanel.tsx` | CreateTab + 一行条件渲染委托给独立组件 | +15~20 | 🟡 中（已最小化） |
| `apps/web/src/components/ProjectView.tsx` | kind='bid' 时显示"标书" Tab | +10~15 | 🟢 低 |
| `apps/daemon/src/server.ts` | import + 注册调用 | +8 | 🟢 低 |

### 2.2 新增文件汇总（~51 个）

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `packages/contracts/src/foxpre/` | 3 | constants, api, index |
| `apps/daemon/src/foxpre/` | 13 | db, routes, engines, crypto |
| `apps/daemon/tests/foxpre/` | 3 | 单元测试 + 集成测试 |
| `apps/web/app/foxpre/` | 4 | 页面路由 |
| `apps/web/src/components/foxpre/` | 18 | UI 组件 |
| `skills/foxpre-*/` | 9 | Agent Skill 定义 |
| **合计** | **~51** | |

---

## 3. 兼容性风险评估

### 3.1 Node.js 版本兼容性

| 版本 | Open Design 支持 | foxpre 建议 | 说明 |
|------|-----------------|------------|------|
| Node 24 | ✅ `engines.node: "~24"` | ✅ 首选 | 官方支持版本 |
| Node 26 | ❌ 未测试 | ⚠️ 已验证可运行 | better-sqlite3 需源码编译，行为未验证 |

**风险点**：
- `better-sqlite3` 是 C++ 原生模块，依赖 Node ABI
- Windows 上从源码编译需要 Visual Studio Build Tools 2022+

### 3.2 上游升级兼容性矩阵

| Open Design 组件 | 升级后 foxpre 受影响概率 | 缓解措施 |
|-----------------|---------------------|---------|
| ProjectKind 类型 | 低 — 联合类型追加向后兼容 | 类型系统自动检测 |
| NewProjectPanel.tsx | 🔴 高 — 重构/拆分时冲突 | 一行条件渲染委托给独立组件 `<CreateProjectForm />`，冲突面最小化 |
| server.ts 路由注册 | 低 — 新增路由位置冲突 | 固定注册顺序，预留注释标记 |
| ProjectView.tsx | 低 — Tab 逻辑重构 | kind 条件判断简单，新增一个 Tab 字面量 |
| Skills 扫描机制 | 极低 — 基于文件系统 | 独立目录天然隔离 |
| Chat/Run 系统 | 低 — 核心 API 稳定 | 通过 HTTP API 调用，无源码依赖 |
| scenario-defaults.ts | 低 — Record 追加 | 编译期类型错误可即时发现 |

### 3.3 Windows 开发环境风险

- **better-sqlite3 编译**：无预编译二进制，需 VS Build Tools + ~2 分钟编译
- **Pandoc 系统依赖**：MD→DOCX 转换需 Pandoc，开发者需手动安装
- **Windows DPAPI**：`field-crypto.ts` MVP 阶段使用 Node.js 内置 `crypto` + 文件密钥，Phase 2 再集成 `node-dpapi`
- `corepack enable` EPERM 错误（需用 `npm install -g pnpm` 替代）

---

## 4. 推荐实施策略

### 4.1 开发环境

1. **降级到 Node 24**：使用 `nvm install 24` 或 `fnm install 24`
2. **安装 VS Build Tools 2022+**：用于 better-sqlite3 编译
3. **pnpm 10.33.2**：`npm install -g pnpm@10.33.2`

### 4.2 最小可行性验证（MVP Checkpoint）

在完整实施前，建议先完成 **架构验证**：

1. 修改 `ProjectKind` 添加 `'bid'` → 观察类型错误 → 确认所有需要修改的位置
2. 修改 `NewProjectPanel.tsx` 添加 "标书制作" Tab → 验证 UI 流程
3. 创建 `apps/daemon/src/foxpre/db.ts` → 验证数据库迁移
4. 创建第一个 Skill (`foxpre-analyzer/SKILL.md`) → 验证 Skills 注册

这 4 步通过后，剩余实施风险显著降低。

### 4.3 上游同步策略

- foxpre 作为 Open Design 的 **fork + 持续 rebase** 维护
- 每次 Open Design 发布新版本后，在 foxpre 分支上 rebase
- 配置 GitHub Actions 在 OD main 更新时自动触发 foxpre 构建
- 优先向上游提交无争议的改进（如 `ProjectKind` 扩展点抽象）

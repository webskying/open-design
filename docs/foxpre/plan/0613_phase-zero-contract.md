# 阶段零：Contract 类型验证

**日期**：2026-06-13
**状态**：待执行
**预计耗时**：15-30 分钟
**风险等级**：🟢 低
**所属主计划**：`0613_master-plan.md`

---

## 0. 目标

修改 `ProjectKind` 联合类型追加 `'bid'`，利用 TypeScript 编译器自动枚举所有需要修改的位置，确认实际修改面与文档分析一致。

---

## 1. 执行步骤

### 步骤 0.1：修改 ProjectKind

**文件**：`packages/contracts/src/api/projects.ts`

```typescript
// 修改前（第 8-15 行）
export type ProjectKind =
  | 'prototype'
  | 'deck'
  | 'template'
  | 'other'
  | 'image'
  | 'video'
  | 'audio';

// 修改后
export type ProjectKind =
  | 'prototype'
  | 'deck'
  | 'template'
  | 'other'
  | 'image'
  | 'video'
  | 'audio'
  | 'bid';
```

**验证**：`pnpm typecheck` — 预期产生多处类型错误

---

### 步骤 0.2：收集类型错误

执行 `pnpm typecheck`，记录所有报错文件和行号。预期至少包括：

| 预期报错文件 | 错误类型 | 原因 |
|-------------|---------|------|
| `scenario-defaults.ts` | TS2741: Property 'bid' is missing | Record<ProjectKind> 穷举要求 |
| `NewProjectPanel.tsx` | 待验证 | switch/case 未穷举（需实际确认） |
| 可能其他文件 | 取决于上游变更 | 需实际验证 |

**注意**：`scenario-defaults.test.ts` 不会报错——其 `expected` 类型是 `Record<string, string>`，不是 `Record<ProjectKind, string>`。需在步骤 0.4 手动处理。

**如果报错文件数与预期不符，更新主计划中的修改文件清单。**

同时记录实际输出，作为验证证据。

---

### 步骤 0.3：修复 scenario-defaults.ts

**文件**：`packages/contracts/src/plugins/scenario-defaults.ts`

```typescript
// 在 DEFAULT_SCENARIO_PLUGIN_BY_KIND 中追加
bid: 'od-new-generation',
```

**验证**：该文件报错消失

---

### 步骤 0.4：修复 scenario-defaults.test.ts

**文件**：`packages/contracts/tests/scenario-defaults.test.ts`

**⚠️ 关键发现**（来自架构审核）：测试中 `expected` 的类型是 `Record<string, string>`（第 18 行），**不是** `Record<ProjectKind, string>`。因此追加 `'bid'` 到 `ProjectKind` 后，这个测试文件**不会产生编译错误**——它会静默跳过 bid 的测试覆盖。

**两阶段修复策略**：

**第一阶段（阶段零立即执行）**——手动追加测试用例：
```typescript
// 在 expected Record 中追加（第 28 行之后）
bid: 'od-new-generation',
```

**第二阶段（后续 PR）**——升级类型实现穷举检查：
```typescript
// 建议将第 18 行的类型从 Record<string, string>
// 改为 Record<ProjectKind, DefaultScenarioPluginId>
// 以实现编译期自动穷举检查
import type { DefaultScenarioPluginId } from '../src/plugins/scenario-defaults.js';
import type { ProjectKind } from '../src/api/projects.js';
const expected: Record<ProjectKind, DefaultScenarioPluginId> = { ... };
```

**验证**：手动运行测试确认 `bid` 映射被覆盖：
```bash
pnpm --filter @open-design/contracts test tests/scenario-defaults.test.ts
```

---

### 步骤 0.5：创建 contracts foxpre 子包

**目录**：`packages/contracts/src/foxpre/`

#### constants.ts

```typescript
/** foxpre 智能体代号 */
export const AGENT_CODES = {
  ANALYZER: 'Analyzer',
  RESEARCHER: 'Researcher',
  PROTOTYPER: 'Prototyper',
  ARCHITECT: 'Architect',
  TECH_WRITER: 'TechWriter',
  BUSINESS_WRITER: 'BusinessWriter',
  PM_WRITER: 'PMWriter',
  REVIEWER: 'Reviewer',
  SOLO_CODER: 'SoloCoder',
} as const;

export type AgentCode = (typeof AGENT_CODES)[keyof typeof AGENT_CODES];

/** 投标项目状态 */
export const BID_PROJECT_STATUS = {
  PENDING: '待启动',
  IN_PROGRESS: '进行中',
  REVIEW: '审核中',
  REJECTED: '已驳回',
  COMPLETED: '已完成',
} as const;

export type BidProjectStatus = (typeof BID_PROJECT_STATUS)[keyof typeof BID_PROJECT_STATUS];

/** 智能体任务状态 */
export const TASK_STATUS = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** 看板列 */
export const KANBAN_COLUMNS = {
  TODO: '待处理',
  IN_PROGRESS: '进行中',
  REVIEW: '审核中',
  DONE: '已完成',
} as const;

export type KanbanColumn = (typeof KANBAN_COLUMNS)[keyof typeof KANBAN_COLUMNS];
```

#### api.ts

```typescript
import type { ProjectMetadata } from '../api/projects.js';
import type { BidProjectStatus, TaskStatus } from './constants.js';

/** bid 类项目的扩展元数据 */
export interface BidProjectMetadata extends ProjectMetadata {
  kind: 'bid';
  /** 招标文件名 */
  招标文件名?: string;
  /** 招标编号 */
  招标编号?: string;
  /** 关联投标人 ID */
  投标人ID?: string;
  /** 样式模板 ID */
  样式模板ID?: string;
  /** 引用项目 ID 列表 */
  引用项目ID列表?: string[];
  /** 当前审核轮次 */
  当前审核轮次?: number;
}

/** 智能体任务 */
export interface AgentTask {
  id: string;
  projectId: string;
  agentCode: string;
  status: TaskStatus;
  /** Git commit SHA */
  commitSha?: string;
  /** 输出文件路径 */
  outputPath?: string;
  /** 依赖任务 ID 列表 */
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

/** 审核报告 */
export interface ReviewReport {
  id: string;
  projectId: string;
  taskId: string;
  round: number;
  passed: boolean;
  /** 审核意见 */
  comments: ReviewComment[];
  createdAt: string;
}

export interface ReviewComment {
  rule: string;
  passed: boolean;
  detail: string;
  suggestion?: string;
}

/** 样式模板 */
export interface StyleTemplate {
  id: string;
  name: string;
  description?: string;
  /** 模板文件路径（空白 DOCX） */
  templatePath: string;
  /** 格式规范 JSON */
  formatSpec: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: string;
}

/** 投标人信息 */
export interface Bidder {
  id: string;
  name: string;
  /** 统一社会信用代码（加密存储） */
  统一社会信用代码?: string;
  /** 法人代表（加密存储） */
  法人代表?: string;
  createdAt: string;
}

/** 招标文件引用（纯数据 DTO，不含浏览器 API） */
export interface BidDocumentRef {
  name: string;
  size: number;
  type: string;
}

/** API 请求/响应类型 */
export interface CreateBidProjectRequest {
  name: string;
  description?: string;
  /** 招标文件引用（纯数据 DTO，非浏览器 File） */
  招标文件?: BidDocumentRef;
  招标编号?: string;
  投标人ID?: string;
  样式模板ID?: string;
  引用项目ID列表?: string[];
}

export interface CreateBidProjectResponse {
  projectId: string;
  status: BidProjectStatus;
}
```

#### index.ts

```typescript
export * from './constants.js';
export * from './api.js';
```

**验证**：`pnpm --filter @open-design/contracts typecheck` 通过

---

### 步骤 0.6：最终验证

```bash
pnpm typecheck  # 必须零错误
pnpm guard      # 必须零错误
```

---

## 2. 完成标准

- [ ] `ProjectKind` 包含 `'bid'`
- [ ] `DEFAULT_SCENARIO_PLUGIN_BY_KIND` 包含 `bid` 映射
- [ ] `scenario-defaults.test.ts` 包含 `bid` 测试用例
- [ ] `packages/contracts/src/foxpre/` 三个文件就绪
- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm guard` 零错误
- [ ] 确认实际修改面与主计划一致（如有差异，更新主计划）

---

## 3. 归档提交

```
feat: 添加 foxpre Contract 层 — ProjectKind 追加 'bid' + 共享类型定义

- ProjectKind 联合类型追加 'bid'
- DEFAULT_SCENARIO_PLUGIN_BY_KIND 追加 bid → od-new-generation
- 新增 packages/contracts/src/foxpre/: constants, api, index
- scenario-defaults 测试追加 bid 映射用例
```

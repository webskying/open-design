# foxpre 阶段七开发提示词：Web UI

**日期**：2026-06-14
**状态**：下发给 atomcode
**分支**：`foxpre/v0.10/phase-seven`（从 `foxpre/v0.10/dev` 切出）
**基线**：`a8f6a2914`（阶段六合入 dev）

---

## 0. 前置状态（请勿修改）

| 名称 | 状态 |
|------|------|
| OD 基线 | v0.10.0 tag `3c3d45a` |
| foxpre 分支 | `foxpre/v0.10/dev` @ `a8f6a2914` |
| contracts/foxpre/api.ts | ✅ BidProjectMetadata, AgentTask, ReviewReport, StyleTemplate, Bidder 等 |
| contracts/foxpre/constants.ts | ✅ AGENT_CODES, BID_PROJECT_STATUS, TASK_STATUS, KANBAN_COLUMNS |
| foxpre/db.ts | ✅ 11 张表 + 种子数据 |
| foxpre/field-crypto.ts | ✅ encrypt / decrypt / getEncryptionKey |
| foxpre/bid-routes.ts | ✅ 8 个端点（含 Kanban SSE） |
| foxpre/bidder-routes.ts | ✅ 5 个端点（加密存储） |
| foxpre/style-routes.ts | ✅ 5 个端点（内置模板保护） |
| foxpre/foxpre-routes.ts | ✅ 聚合注册入口 |
| server.ts | ✅ initFoxpreDatabase + registerFoxpreRoutes |
| cli.ts | ✅ od bid / od bidder / od style |
| PluginLoopHome.tsx | ✅ projectKind union 已追加 'bid' |

---

## 1. 目标与范围

实现 foxpre 的全部 Web UI。**这是工作量最大的阶段**——涉及 2 个现有文件的修改 + 约 12 个新组件。

### 分支工作流

```bash
# atomcode 执行：
git checkout foxpre/v0.10/dev
git checkout -b foxpre/v0.10/phase-seven
# 开发 ...
git add ...
git commit -m "foxpre: add phase-seven Web UI components and pages"
git push origin foxpre/v0.10/phase-seven

# 架构师审查通过后，由架构师执行：
git checkout foxpre/v0.10/dev
git merge --no-ff foxpre/v0.10/phase-seven
```

### 产出清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `apps/web/src/components/NewProjectPanel.tsx` | CreateTab 追加 'bid' + buildMetadata 追加 bid 分支 |
| 修改 | `apps/web/src/components/ProjectView.tsx` | kind='bid' 时显示"标书" Tab |
| 新增 | `apps/web/src/components/foxpre/BidWarRoom.tsx` | 三栏核心工作区（看板+预览+对话） |
| 新增 | `apps/web/src/components/foxpre/KanbanBoard.tsx` | 看板列 + 卡片渲染 |
| 新增 | `apps/web/src/components/foxpre/KanbanCard.tsx` | 单张看板卡片 |
| 新增 | `apps/web/src/components/foxpre/DocumentPreview.tsx` | 文档预览区（Markdown/DOCX HTML） |
| 新增 | `apps/web/src/components/foxpre/AgentChatDrawer.tsx` | Agent 侧边对话面板 |
| 新增 | `apps/web/src/components/foxpre/CreateBidForm.tsx` | 创建投标项目表单 |
| 新增 | `apps/web/src/components/foxpre/BidderList.tsx` | 投标人列表组件 |
| 新增 | `apps/web/src/components/foxpre/BidderForm.tsx` | 投标人创建/编辑表单 |
| 新增 | `apps/web/src/components/foxpre/StyleTemplateList.tsx` | 样式模板列表组件 |
| 新增 | `apps/web/src/components/foxpre/StyleTemplateForm.tsx` | 样式模板创建/编辑表单 |
| 新增 | `apps/web/src/components/foxpre/BidSettingsPanel.tsx` | 投标项目设置面板 |
| 新增 | `apps/web/src/components/foxpre/index.ts` | barrel export |
| 修改 | `apps/web/src/i18n/types.ts` | Dict 追加 foxpre.* 翻译键 |
| 修改 | `apps/web/src/i18n/locales/*.ts` (18 个文件) | 每个 locale 追加 foxpre 翻译条目 |

**不改动任何其他文件。**

---

## 2. 改动清单

### 2.1 NewProjectPanel.tsx（修改）

**文件**：`apps/web/src/components/NewProjectPanel.tsx`

#### 2.1.1 CreateTab 追加 'bid'

当前 `CreateTab` 类型定义（约 line 112）：

```typescript
export type CreateTab = 'prototype' | 'live-artifact' | 'deck' | 'template' | 'media' | 'other';
```

追加 `'bid'`：

```typescript
export type CreateTab = 'prototype' | 'live-artifact' | 'deck' | 'template' | 'media' | 'bid' | 'other';
```

#### 2.1.2 TAB_LABEL_KEYS 追加

在 `TAB_LABEL_KEYS` 对象中追加：

```typescript
bid: 'foxpre.newBidProject',
```

#### 2.1.3 tabToKind 映射

在 `tabToKind()` 函数中追加 case（约 line 170）：

```typescript
case 'bid':
  return 'bid';
```

#### 2.1.4 buildMetadata() 追加 bid 分支

在 `buildMetadata()` 函数中（约 line 2780），按现有模式追加：

```typescript
if (input.tab === 'bid') {
  return {
    kind: 'bid',
    ...base,
  };
}
```

**注意**：bid 项目的详细元数据（招标编号、投标人ID、样式模板ID）通过专门的创建表单设置，不在 NewProjectPanel 的 buildMetadata 中处理。NewProjectPanel 只负责创建 `{ kind: 'bid' }` 的基础元数据然后将用户导航到 foxpre 创建表单。

#### 2.1.5 UI 渲染条件

在 `NewProjectPanel` 的渲染部分，`tab === 'bid'` 显示简化的创建表单（项目名称输入 + 跳转到 BidWarRoom 的按钮）。不要在 NewProjectPanel 内嵌复杂表单——委托给 `CreateBidForm` 组件。

```tsx
{tab === 'bid' ? (
  <CreateBidForm
    projectName={...}
    onCreated={(projectId) => { /* navigate */ }}
  />
) : null}
```

#### 2.1.6 不在 TAB_LABEL_KEYS 循环中渲染 bid

`bid` tab 有自己的创建表单流，不参与现有 tabs 的循环渲染。在 `Object.keys(TAB_LABEL_KEYS)` 映射中跳过 `'bid'`：

```typescript
{(Object.keys(TAB_LABEL_KEYS) as CreateTab[])
  .filter(k => k !== 'bid')
  .map((entry) => (...))}
```

---

### 2.2 ProjectView.tsx（修改）

**文件**：`apps/web/src/components/ProjectView.tsx`

当 `metadata.kind === 'bid'` 时，在 tab 列表中添加固定的"标书" tab。该 tab 的 tabId 固定为 `'foxpre-bid'`。

在 tab 渲染处（约 line 2024 附近 `openTabsState.active` 使用处），当 `kind === 'bid'` 且 `active === 'foxpre-bid'` 时渲染 `<BidWarRoom>` 组件。

**最小化修改**：在 ProjectView 的 tab 内容区域（FileViewer 渲染附近），条件判断：

```tsx
{metadata?.kind === 'bid' && openTabsState.active === 'foxpre-bid' && (
  <BidWarRoom projectId={project.id} metadata={metadata as BidProjectMetadata} />
)}
```

并在 TabBar 中追加"标书" tab 条目（当 `kind === 'bid'` 时）。

**注意**：不要重构 ProjectView 的现有逻辑，仅追加条件分支。

---

### 2.3 BidWarRoom.tsx（新增）

**文件**：`apps/web/src/components/foxpre/BidWarRoom.tsx`

foxpre 的核心工作界面——三栏布局：

```
┌─────────────────────────────────────────────────────────┐
│  foxpre Logo  │  项目：{name}  │  [设置] [启动工作流]   │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│  KanbanBoard │  DocumentPreview     │  AgentChatDrawer  │
│  (看板列)    │  (文档预览区)         │  (Agent 对话)     │
│              │                      │                   │
└──────────────┴──────────────────────┴───────────────────┘
```

#### 2.3.1 状态管理

```typescript
interface BidWarRoomProps {
  projectId: string;
}

interface BidWarRoomState {
  kanbanState: WorkflowState | null;
  activeAgent: string | null;       // 当前对话的 Agent
  selectedFragment: string | null;   // 当前预览的文档片段
  review: ReviewReport | null;
  loading: boolean;
  error: string | null;
}
```

#### 2.3.2 数据加载

`useEffect` 在挂载时：
1. `GET /api/foxpre/bid/{id}` — 获取项目详情
2. `GET /api/foxpre/bid/{id}/status` — 获取初始工作流状态
3. `GET /api/foxpre/bid/{id}/review` — 获取最新审核报告

#### 2.3.3 SSE 实时连接

使用 `EventSource` 连接 `/api/foxpre/bid/{id}/events`，接收到 `state` 事件时更新 `kanbanState`。

```typescript
useEffect(() => {
  const es = new EventSource(`/api/foxpre/bid/${projectId}/events`);
  es.addEventListener('state', (e) => {
    setKanbanState(JSON.parse(e.data));
  });
  return () => es.close();
}, [projectId]);
```

#### 2.3.4 布局

使用 Tailwind grid 三栏布局。左右两栏可折叠（宽度通过 CSS transition）：

```tsx
<div className="flex h-full">
  <div className="w-80 flex-shrink-0 border-r">{/* Kanban */}</div>
  <div className="flex-1">{/* Document Preview */}</div>
  <div className="w-96 flex-shrink-0 border-l">{/* Agent Chat */}</div>
</div>
```

#### 2.3.5 用户操作

- **启动工作流**按钮：`POST /api/foxpre/bid/{id}/start`
- **触发门禁**按钮：`POST /api/foxpre/bid/{id}/harness`
- **项目设置**按钮：打开 `BidSettingsPanel`

---

### 2.4 KanbanBoard.tsx（新增）

**文件**：`apps/web/src/components/foxpre/KanbanBoard.tsx`

#### 2.4.1 列定义

按 `KANBAN_COLUMNS` 常量定义 5 列：

```typescript
const COLUMNS: KanbanColumn[] = ['待启动', '进行中', '等待审核', '需修改', '已完成'];
```

#### 2.4.2 任务分组

从 `WorkflowState` 中取 `tasks`，按 `status` 分组到 5 列。

#### 2.4.3 渲染

每列垂直排列，卡片通过 `KanbanCard` 组件渲染。使用 Tailwind flex-col + gap。

```tsx
{COLUMNS.map(col => {
  const cards = tasks.filter(t => mapStatusToKanbanColumn(t.status) === col);
  return (
    <div key={col} className="flex flex-col gap-2 min-w-[200px]">
      <h3 className="text-sm font-semibold px-2 py-1">
        {col} ({cards.length})
      </h3>
      {cards.map(task => (
        <KanbanCard key={task.id} task={task} onSelect={onSelectAgent} />
      ))}
    </div>
  );
})}
```

#### 2.4.4 映射函数

```typescript
function mapStatusToKanbanColumn(taskStatus: FoxpreTaskStatus): KanbanColumn {
  switch (taskStatus) {
    case '排队中': return '待启动';
    case '执行中': return '进行中';
    case '已完成': return '等待审核';
    case '失败': return '需修改';
    case '已取消': return '已完成';
    default: return '待启动';
  }
}
```

---

### 2.5 KanbanCard.tsx（新增）

**文件**：`apps/web/src/components/foxpre/KanbanCard.tsx`

单张看板卡片，展示 Agent 任务信息：

```tsx
interface KanbanCardProps {
  task: AgentTask;
  onSelect: (agentCode: string) => void;
}
```

卡片内容：
- Agent emoji + 名称（从 `AGENT_CODES` 映射显示名称）
- 任务摘要（agent_code → 中文标签）
- 状态指示器（颜色圆点）
- 最近更新时间
- [对话] 按钮 → 打开 AgentChatDrawer

```tsx
const AGENT_LABELS: Record<string, string> = {
  analyzer: '招标分析',
  'tech-writer': '技术方案撰写',
  'biz-writer': '商务方案撰写',
  'qual-writer': '资质文件整理',
  'harness-runner': '门禁审核',
  'style-checker': '样式检查',
  'docx-assembler': '文档组装',
  orchestrator: '调度器',
  'bidder-manager': '投标人管理',
};
```

使用 Tailwind card 样式 + hover 效果。状态色：
- 排队中 → `bg-gray-200`
- 执行中 → `bg-yellow-400` + pulse 动画
- 已完成 → `bg-green-500`
- 失败 → `bg-red-500`
- 已取消 → `bg-gray-500`

---

### 2.6 DocumentPreview.tsx（新增）

**文件**：`apps/web/src/components/foxpre/DocumentPreview.tsx`

文档预览区，显示选中 Agent 的输出内容或已完成的文档片段。

```tsx
interface DocumentPreviewProps {
  projectId: string;
  selectedAgent: string | null;
}
```

#### 2.6.1 预览内容

- 无选中 Agent：显示项目概览（名称、招标编号、描述、审核轮次）
- 选中 Agent 且有 outputPath：加载 Markdown 文件内容并渲染
- 选中 Agent 但无输出：显示"正在生成..."占位

#### 2.6.2 渲染

使用简易 Markdown 渲染（基于 `marked` 或已有的 Markdown 渲染组件），或纯 `<pre>` 展示源码。

如果 Open Design 已有 Markdown 渲染组件（检查 `apps/web/src/components/`），直接复用。

---

### 2.7 AgentChatDrawer.tsx（新增）

**文件**：`apps/web/src/components/foxpre/AgentChatDrawer.tsx`

Agent 侧边对话面板，用户向指定 Agent 发送指令。

```tsx
interface AgentChatDrawerProps {
  projectId: string;
  agentCode: string | null;  // null 时隐藏
  onClose: () => void;
}
```

#### 2.7.1 功能

- 显示当前对话的 Agent 名称
- 文本输入框 + 发送按钮
- 发送的消息保存到项目对话中（复用 Open Design 的 `/api/runs` 机制或 foxpre 独立消息表）
- MVP 阶段：简化为文本输入 + 提示"消息已发送至 {agentName}"的确认反馈

#### 2.7.2 打开/关闭

从右侧滑入（CSS transition translateX），宽度 400px，覆盖在文档预览上方。关闭按钮 + 遮罩层。

---

### 2.8 CreateBidForm.tsx（新增）

**文件**：`apps/web/src/components/foxpre/CreateBidForm.tsx`

投标项目创建表单，在 NewProjectPanel 的 bid tab 中选择后显示。

```tsx
interface CreateBidFormProps {
  projectName: string;           // 从 NewProjectPanel 传入
  onCreated: (projectId: string) => void;
}
```

#### 2.8.1 表单字段

| 字段 | 控件 | 说明 |
|------|------|------|
| 项目名称 | `<input>` | 从 props 预填 |
| 项目描述 | `<textarea>` | — |
| 招标编号 | `<input>` | — |
| 投标人 | `<select>` | 从 `GET /api/foxpre/bidder` 加载选项 |
| 样式模板 | `<select>` | 从 `GET /api/foxpre/style` 加载选项 |

#### 2.8.2 提交

`POST /api/foxpre/bid` → 成功后调用 `onCreated(projectId)`。

#### 2.8.3 样式

使用 CSS Module（`CreateBidForm.module.css`）。

---

### 2.9 BidderList.tsx + BidderForm.tsx（新增）

**文件**：
- `apps/web/src/components/foxpre/BidderList.tsx`
- `apps/web/src/components/foxpre/BidderForm.tsx`

投标人管理界面，在项目设置面板中使用。

#### BidderList

```tsx
interface BidderListProps {
  onSelect: (bidderId: string) => void;
  onAdd: () => void;
}
```

- 从 `GET /api/foxpre/bidder` 加载列表
- 表格：名称、联系人、更新时间
- [编辑] / [删除] 操作按钮
- [新增] 按钮

#### BidderForm

```tsx
interface BidderFormProps {
  bidderId?: string;     // 编辑模式传 id，创建模式 null
  onSaved: () => void;
  onCancel: () => void;
}
```

- 创建模式：`POST /api/foxpre/bidder`
- 编辑模式：`PATCH /api/foxpre/bidder/{id}`
- 字段：name（必填）、统一社会信用代码、法人代表、联系人、联系电话

---

### 2.10 StyleTemplateList.tsx + StyleTemplateForm.tsx（新增）

**文件**：
- `apps/web/src/components/foxpre/StyleTemplateList.tsx`
- `apps/web/src/components/foxpre/StyleTemplateForm.tsx`

#### StyleTemplateList

```tsx
interface StyleTemplateListProps {
  onSelect: (templateId: string) => void;
}
```

- 从 `GET /api/foxpre/style` 加载
- 表格：名称、是否内置、description
- 内置模板显示 🔒 锁图标，不可删除
- [新增自定义模板] 按钮

#### StyleTemplateForm

```tsx
interface StyleTemplateFormProps {
  templateId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}
```

- 字段：name（必填）、description、templatePath、formatSpec（JSON 对象）
- formatSpec 字段使用 JSON 编辑器（简易 `<textarea>` + `JSON.parse` 校验）
- 内置模板不可编辑

---

### 2.11 BidSettingsPanel.tsx（新增）

**文件**：`apps/web/src/components/foxpre/BidSettingsPanel.tsx`

项目设置侧边面板，管理投标人、样式模板关联。

```tsx
interface BidSettingsPanelProps {
  projectId: string;
  onClose: () => void;
}
```

包含两个 Section：
1. **投标人管理**：内嵌 `BidderList` + `BidderForm`，选择后 PATCH 项目关联
2. **样式模板**：内嵌 `StyleTemplateList`，选择后 PATCH 项目关联

---

### 2.12 index.ts（新增）

**文件**：`apps/web/src/components/foxpre/index.ts`

```typescript
export { BidWarRoom } from './BidWarRoom';
export { KanbanBoard } from './KanbanBoard';
export { KanbanCard } from './KanbanCard';
export { DocumentPreview } from './DocumentPreview';
export { AgentChatDrawer } from './AgentChatDrawer';
export { CreateBidForm } from './CreateBidForm';
export { BidderList } from './BidderList';
export { BidderForm } from './BidderForm';
export { StyleTemplateList } from './StyleTemplateList';
export { StyleTemplateForm } from './StyleTemplateForm';
export { BidSettingsPanel } from './BidSettingsPanel';
```

---

### 2.13 i18n 修改（Dict + 18 locales）

#### 2.13.1 types.ts

在 `Dict` 接口中追加以下 foxpre 键：

```typescript
// foxpre
'foxpre.newBidProject': string;
'foxpre.bidWarRoom': string;
'foxpre.kanban': string;
'foxpre.documentPreview': string;
'foxpre.agentChat': string;
'foxpre.createBid': string;
'foxpre.startWorkflow': string;
'foxpre.triggerHarness': string;
'foxpre.projectSettings': string;
'foxpro.bidderManagement': string;
'foxpre.styleTemplate': string;
'foxpre.todo': string;
'foxpre.inProgress': string;
'foxpre.review': string;
'foxpre.needsRevision': string;
'foxpre.done': string;
'foxpre.noAgentSelected': string;
'foxpre.generating': string;
'foxpre.builtin': string;
'foxpre.custom': string;
'foxpre.bidderName': string;
'foxpre.contactPerson': string;
'foxpre.phone': string;
'foxpre.creditCode': string;
'foxpre.legalRep': string;
'foxpre.templateName': string;
'foxpre.templatePath': string;
'foxpre.formatSpec': string;
'foxpre.bidNumber': string;
'foxpre.description': string;
'foxpre.selectBidder': string;
'foxpre.selectTemplate': string;
'foxpre.save': string;
'foxpre.cancel': string;
'foxpre.delete': string;
'foxpre.edit': string;
```

#### 2.13.2 locales/*.ts（18 个文件）

每个 locale 文件追加对应的翻译条目。**中文（zh-CN）直接使用上面的中文值**，其他语言使用对应的翻译。

atomcode 需要为所有 18 个 locale 文件提供翻译（可使用 AI 辅助翻译），必须保证 `pnpm typecheck` 零错误（TypeScript 会检查 Dict 类型完整性）。

---

## 3. 通用规则

1. **文件约束**：仅修改以上列出的文件，不得触碰其他文件
2. **类型约束**：所有 foxpre 类型从 `@open-design/contracts` 导入（通过 `apps/web/src/types.ts` 的 re-export 链）
3. **CSS 约束**：新组件默认使用 CSS Modules（`ComponentName.module.css`）；使用 Tailwind utility class 辅助
4. **组件约束**：优先使用 `@open-design/components` 中的共享原语（Button、VisuallyHidden 等）
5. **动画约束**：UI 过渡使用 `cubic-bezier(0.23, 1, 0.32, 1)`；进入 ~200ms，退出 ~140ms；不做 `scale(0)` 动画
6. **i18n 约束**：所有用户可见文本使用 `useT()` 翻译；新 key 全部以 `foxpre.` 为前缀
7. **OD 修改面**：不触及 `apps/daemon/`、`packages/contracts/` 的现有代码
8. **SSE 约束**：使用浏览器原生 `EventSource` API 接收 Kanban 推送
9. **状态管理**：使用 React `useState` / `useEffect`，不引入新的状态管理库
10. **错误处理**：API 调用失败显示 Toast（复用 `./Toast` 组件）或内联错误信息

---

## 4. 验证关口（逐项检查）

| # | 检查项 | 方法 |
|---|--------|------|
| 1 | `pnpm guard` 零错误 | `pnpm guard` |
| 2 | `pnpm typecheck` 零错误（全 workspace） | `pnpm typecheck` |
| 3 | `pnpm --filter @open-design/web typecheck` 零错误 | filter 到 web |
| 4 | `pnpm --filter @open-design/web test` 全部通过 | web test |
| 5 | `pnpm --filter @open-design/daemon test tests/foxpre/` 53 用例通过 | daemon test |
| 6 | NewProjectPanel 显示"标书制作" Tab | 浏览器验证 |
| 7 | 创建 bid 项目 → 导航到 BidWarRoom | 手动端到端 |
| 8 | Kanban SSE 实时推送看板更新 | 启动工作流后观察 |
| 9 | 3 个 bid/bidder/style CLI 命令正常 | `od bid list` |
| 10 | 仅修改指定文件 | `git diff --stat foxpre/v0.10/dev` |
| 11 | 分支 `foxpre/v0.10/phase-seven` | `git branch --show-current` |
| 12 | 未修改 daemon 侧文件 | `git diff` 确认 |

---

## 5. 操作指南

```bash
# 第零步：切出阶段七开发分支
git checkout foxpre/v0.10/dev
git checkout -b foxpre/v0.10/phase-seven

# 第一步：i18n 词条准备（Dict + 18 locale 文件）
#   在 types.ts 中追加 foxpre.* 键
#   在 locales/zh-CN.ts 中追加中文值
#   其他 17 个 locale 文件追加对应翻译

# 第二步：NewProjectPanel.tsx 修改
#   CreateTab 追加 'bid'
#   TAB_LABEL_KEYS 追加
#   tabToKind 追加
#   buildMetadata 追加
#   渲染条件分支

# 第三步：ProjectView.tsx 修改
#   kind='bid' 时追加"标书" Tab + 渲染 BidWarRoom

# 第四步：核心组件开发
#   BidWarRoom.tsx（布局 + 状态管理 + SSE）
#   KanbanBoard.tsx（5 列 + 任务分组）
#   KanbanCard.tsx（单张卡片渲染）

# 第五步：辅助组件开发
#   DocumentPreview.tsx
#   AgentChatDrawer.tsx
#   CreateBidForm.tsx

# 第六步：管理组件开发
#   BidderList.tsx + BidderForm.tsx
#   StyleTemplateList.tsx + StyleTemplateForm.tsx
#   BidSettingsPanel.tsx
#   index.ts

# 第七步：自检
pnpm install
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon test tests/foxpre/

# 第八步：提交推送
git add ...
git commit -m "foxpre: add phase-seven Web UI components and i18n"
git push origin foxpre/v0.10/phase-seven
```

---

## 6. 架构师备注（供审查用）

1. **Kanban SSE 模式**：前端使用浏览器原生 `EventSource`，后端 SSE 端点已在阶段六实现（`/api/foxpre/bid/:id/events`，2s 轮询 + 25s keepalive）。EventSource 自动重连，无需手动处理。

2. **AgentChatDrawer MVP 范围**：阶段七的对话面板为简化版——文本输入 + 确认反馈。完整的 Agent 对话（`/api/runs` 集成）在阶段九（集成测试）中实现。

3. **DocumentPreview MVP 范围**：预览区展示 Markdown 源文本（`<pre>` 格式），不做完整的 DOCX 预览渲染。阶段八（DOCX 组装）完成后再做渲染增强。

4. **BidWarRoom 是唯一新增的"页面级"组件**，不新增独立路由页面（`apps/web/app/foxpre/`）。所有 foxpre UI 通过现有 `[[...slug]]` catch-all 路由承载，BidWarRoom 作为 ProjectView 的 Tab 内容嵌入。

5. **NewProjectPanel 修改策略**：`bid` tab 独立于现有 Tabs 循环渲染，有自己的创建表单流。这样避免与 prototype/deck/template/media 的复杂条件渲染冲突。

6. **i18n 翻译**：atomcode 可使用 Claude 辅助完成 17 个非中文 locale 的翻译。翻译质量不需要完美（阶段九可修正），但类型必须完整（TS 编译检查强制）。

7. **CSS 约定**：遵循 AGENTS.md 中的 CSS 约定——新组件默认 CSS Modules（`ComponentName.module.css`），全局样式只能用 Tailwind utility class。

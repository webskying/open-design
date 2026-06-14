# Phase Seven Web UI — 修复规格

**文档类型**：atomcode 修复提示词
**日期**：2026-06-14
**审查者**：架构师
**前置条件**：已在 `foxpre/v0.10/phase-seven` 分支完成阶段七初版开发

---

## 背景

阶段七初版代码审查发现 **1 个致命 BUG + 3 个高严重度问题**。本文件是 atomcode 的修复指南。

架构师已修复问题 #1（`buildMetadata` bid 分支缺失），其余问题由 atomcode 修复。

---

## 修复 #1（架构师已完成）：buildMetadata bid 分支缺失 ✅

**文件**：`apps/web/src/components/NewProjectPanel.tsx`

**问题**：`buildMetadata()` 函数（line 2817-2903）缺少 `bid` 分支。所有 tab 为 `'bid'` 的项目经过 switch/if chain 后落入 line 2902 的 `return { kind: 'other', ...base, ...inspirations }`，导致项目 kind 被覆盖为 `'other'`，`ProjectView.tsx` 中的 `kind === 'bid'` 条件永远不匹配，BidWarRoom 永远无法通过 UI 到达。

**修复**：在 `return { kind: 'other', ...base, ...inspirations }` 之前插入 bid 分支：

```typescript
if (input.tab === 'bid') {
  return { kind: 'bid', ...inspirations };
}
```

**修改位置**：line 2902（旧行号），在那行 `return { kind: 'other'...}` 之前插入以上 3 行。

**验证**：`pnpm --filter @open-design/web typecheck` 通过。

---

## 修复 #2：DocumentPreview 加载真实 Agent 输出而非硬编码占位符

**文件**：`apps/web/src/components/foxpre/DocumentPreview.tsx`

### 问题

当用户选中 Agent 后（`selectedAgent !== null`），组件渲染硬编码文本：

```tsx
<p>正在生成...</p>
<pre>
  {`Agent: ${selectedAgent}\nProject: ${projectId}\nStatus: Generating...`}
</pre>
```

这永远不会加载真实的 Agent 输出文件。中心预览区（占据屏幕最多空间）是一个假视图。

### 修复方案

1. **新增 `AgentOutput` 接口**，从项目详情 API 或独立 endpoint 获取 Agent 输出内容：

```typescript
interface AgentOutput {
  taskId: string;
  agentCode: string;
  status: string;
  contentMd: string | null;
  errorLog: string | null;
}
```

2. **新增 `useEffect`**：当 `selectedAgent` 变化时，从 `/api/foxpre/bid/:projectId/status` 返回的 tasks 数组中查找对应 agent 的任务，然后通过 `outputPath` 获取内容。由于当前 API 可能没有直接的"获取单个任务输出"端点，采用以下策略：

   - 从 BidWarRoom 传入 `kanbanState.tasks`（已有 SSE 数据），在 tasks 中找到 `selectedAgent` 对应的任务
   - 如果任务有 `outputPath`，则 fetch 该路径获取 Markdown 内容
   - 如果任务没有 outputPath 且状态为 '执行中'，显示"正在生成..."
   - 如果任务失败，显示 `errorLog`

3. **修改 Props**：新增 `tasks` 参数

```typescript
interface DocumentPreviewProps {
  projectId: string;
  selectedAgent: string | null;
  tasks: WorkflowTask[];  // 新增
}
```

4. **agent 无输出时**，从 tasks 中查找状态：

| 任务状态 | 显示内容 |
|---------|---------|
| `执行中` | "正在生成..." + loading spinner |
| `排队中` | "等待调度..." |
| `已完成` 且有 outputPath | fetch 并渲染 Markdown 内容 |
| `已完成` 无 outputPath | "输出文件暂未生成" |
| `失败` | 显示 errorLog（红色文本） |
| 未找到任务 | "未找到此 Agent 的任务" |

5. **Markdown 渲染**：由于 apps/web 可能没有现成的 Markdown 渲染组件，降级方案：

```tsx
<pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded border overflow-auto max-h-[60vh]">
  {agentOutput.contentMd || '（空）'}
</pre>
```

未来阶段可迁移到完整的 Markdown 渲染器。

### 完整修改后的 DocumentPreview.tsx

```typescript
import React, { useEffect, useState } from 'react';

interface WorkflowTask {
  id: string;
  agentCode: string;
  status: string;
  dependsOn: string[];
  outputPath: string | null;
  errorLog: string | null;
  updatedAt?: number | string;
}

interface DocumentPreviewProps {
  projectId: string;
  selectedAgent: string | null;
  tasks: WorkflowTask[];
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  '招标编号'?: string;
  '状态'?: string;
  fragmentCount?: number;
}

const AGENT_LABELS: Record<string, string> = {
  Analyzer: '📊 招标分析',
  TechWriter: '📝 技术方案撰写',
  BizWriter: '💼 商务方案撰写',
  QualWriter: '📋 资质文件整理',
  HarnessRunner: '🔍 门禁审核',
  StyleChecker: '🎨 样式检查',
  DocxAssembler: '📄 文档组装',
  Orchestrator: '⚙️ 调度器',
  BidderManager: '👤 投标人管理',
};

export function DocumentPreview({ projectId, selectedAgent, tasks }: DocumentPreviewProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [agentContent, setAgentContent] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load project overview
  useEffect(() => {
    if (!selectedAgent) {
      fetch(`/api/foxpre/bid/${projectId}`)
        .then((r) => r.json())
        .then((data) => setProject(data as ProjectDetail))
        .catch(() => {});
    }
  }, [projectId, selectedAgent]);

  // Load agent output when agent selected
  useEffect(() => {
    if (!selectedAgent || tasks.length === 0) return;

    const task = tasks.find((t) => t.agentCode === selectedAgent);
    if (!task) {
      setAgentStatus(null);
      setAgentError('未找到此 Agent 的任务');
      setAgentContent(null);
      return;
    }

    setAgentStatus(task.status);
    setAgentError(task.errorLog);

    if (task.status === '执行中' || task.status === '排队中') {
      setAgentContent(null);
      return;
    }

    if (task.status === '失败') {
      setAgentContent(null);
      return;
    }

    if (task.status === '已完成' || task.status === '已取消') {
      if (task.outputPath) {
        setLoading(true);
        fetch(`/api/foxpre/bid/${encodeURIComponent(projectId)}/output?taskId=${encodeURIComponent(task.id)}`)
          .then((r) => r.text())
          .then((text) => {
            setAgentContent(text);
          })
          .catch(() => {
            setAgentContent(null);
            setAgentError('加载输出失败');
          })
          .finally(() => setLoading(false));
      }
    }
  }, [selectedAgent, projectId, tasks]);

  // Project overview (no agent selected)
  if (!selectedAgent) {
    return (
      <div className="p-6">
        {project ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">{project.name}</h2>
            {project['招标编号'] && (
              <p className="text-sm text-gray-600 mb-2">招标编号: {project['招标编号']}</p>
            )}
            {project.description && (
              <p className="text-sm text-gray-600 mb-2">{project.description}</p>
            )}
            <p className="text-sm text-gray-500 mb-2">状态: {project['状态'] ?? '未知'}</p>
            {project.fragmentCount !== undefined && (
              <p className="text-sm text-gray-500">文档片段: {project.fragmentCount}</p>
            )}
          </div>
        ) : (
          <div className="text-gray-400">加载中...</div>
        )}
      </div>
    );
  }

  // Agent-specific preview
  const agentLabel = AGENT_LABELS[selectedAgent] ?? selectedAgent;

  return (
    <div className="p-6">
      <h3 className="text-lg font-medium mb-4">{agentLabel} 输出</h3>

      {/* Error state */}
      {agentError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4">
          {agentError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-sm text-gray-400">加载输出中...</div>
      )}

      {/* Running/pending state */}
      {!agentError && !loading && !agentContent && agentStatus === '执行中' && (
        <div className="text-sm text-gray-500">
          <span className="inline-block w-3 h-3 bg-yellow-400 rounded-full animate-pulse mr-2" />
          正在生成...
        </div>
      )}

      {!agentError && !loading && !agentContent && agentStatus === '排队中' && (
        <div className="text-sm text-gray-400">等待调度...</div>
      )}

      {/* Content */}
      {!loading && agentContent && (
        <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded border overflow-auto max-h-[60vh]">
          {agentContent}
        </pre>
      )}

      {/* Completed but no output */}
      {!loading && !agentContent && !agentError && agentStatus === '已完成' && (
        <div className="text-sm text-gray-400">输出文件暂未生成</div>
      )}
    </div>
  );
}
```

---

## 修复 #3：接入 i18n — 所有组件使用 useT() 替代硬编码中文

### 问题

11 个 foxpre 组件中 **零使用 `useT()`**。所有用户可见文本硬编码为中文。`Dict` 接口定义了 38 个 `foxpre.*` key，18 个 locale 文件已有翻译，但完全未被使用。

### 需要补充的 i18n keys

当前 types.ts 已有 36 个 foxpre key，仍需补充 6 个：

在 `apps/web/src/i18n/types.ts` 中追加以下 key：

```typescript
'foxpre.projectName': string;
'foxpre.loading': string;
'foxpre.noTasks': string;
'foxpre.pendingDispatch': string;
'foxpre.noAgentFound': string;
'foxpre.loadOutputFailed': string;
'foxpre.outputNotReady': string;
'foxpre.noBidders': string;
'foxpre.noTemplates': string;
'foxpre.companyName': string;
'foxpre.jsonInvalid': string;
'foxpre.operationFailed': string;
'foxpre.saving': string;
'foxpre.creating': string;
'foxpre.sentConfirm': string;
'foxpre.inputPlaceholder': string;
'foxpre.send': string;
'foxpre.bidderList': string;
'foxpre.add': string;
'foxpre.name': string;
```

### 每个组件需要修改的地方

#### 1. BidWarRoom.tsx

| 行号 | 硬编码文本 | 替换为 |
|------|-----------|--------|
| 117 | `加载投标工作区...` | `t('foxpre.loading')` |
| 150 | `设置` | `t('foxpre.projectSettings')` |
| 157-158 | `启动工作流` / `启动中...` | `t('foxpre.startWorkflow')` / `t('foxpre.startWorkflow') + '...'` |
| 164-165 | `触发门禁` / `审核中...` | `t('foxpre.triggerHarness')` / `t('foxpre.triggerHarness') + '...'` |
| 175 | `看板` | `t('foxpre.kanban')` |

导入：`import { useT } from '../../i18n';`
使用：`const t = useT();`

#### 2. KanbanBoard.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 18 | `const COLUMNS = ['待启动', '进行中', '等待审核', '需修改', '已完成']` | 使用 `useT()` 动态生成 `COLUMNS` |

由于 COLUMNS 是常量，需要改为在组件内部根据 i18n 动态构建：

```typescript
const COLUMN_KEYS: (keyof Dict)[] = [
  'foxpre.todo',
  'foxpre.inProgress',
  'foxpre.review',
  'foxpre.needsRevision',
  'foxpre.done',
];
// 在组件内: const columns = COLUMN_KEYS.map(k => t(k));
```

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 45-46 | `无任务` | `t('foxpre.noTasks')` |

#### 3. KanbanCard.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 69 | `状态: ${task.status}` | i18n 化状态文本 |
| 76 | `对话` | `t('foxpre.agentChat')` |

**注意**：AGENT_LABELS 和 STATUS_COLORS 中的中文也需 i18n 化。由于 agent code 是固定的，可保留中/英文标签映射，但状态文本应通过 `useT()` 翻译。

#### 4. DocumentPreview.tsx

（已在修复 #2 中重写，所有硬编码文本替换为 i18n key）

#### 5. AgentChatDrawer.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 31 | `` 对话 - ${agentCode} `` | `t('foxpre.agentChat') + ' - ' + agentCode` |
| 44 | `消息已发送至 ${agentCode}` | `t('foxpre.sentConfirm', { agent: agentCode })` |
| 48 | `向 ${agentCode} 发送指令` | `t('foxpre.noAgentSelected')` |
| 58 | `输入消息...` | `t('foxpre.inputPlaceholder')` |
| 67 | `发送` | `t('foxpre.send')` |

#### 6. CreateBidForm.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 72 | `项目名称` | `t('foxpre.projectName')` |
| 80 | `项目描述` | `t('foxpre.description')` |
| 89 | `招标编号` | `t('foxpre.bidNumber')` |
| 97 | `投标人` | `t('foxpre.selectBidder')` |
| 103 | `请选择投标人` | `t('foxpre.selectBidder')` (或新增 key) |
| 110 | `样式模板` | `t('foxpre.selectTemplate')` |
| 116 | `请选择模板` | `t('foxpre.selectTemplate')` (或新增 key) |
| 122 | 错误文本 | 保持，非用户可见文案 |
| 128 | `创建投标项目` | `t('foxpre.createBid')` |
| 128 | `创建中...` | 新增 `foxpre.creating` |

#### 7. BidderList.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 39 | `加载中...` | `t('foxpre.loading')` |
| 44 | `投标人列表` | `t('foxpre.bidderList')` |
| 49 | `新增` | `t('foxpre.add')` |
| 53 | `暂无投标人` | `t('foxpre.noBidders')` |
| 57 | `名称` | `t('foxpre.name')` |
| 58 | `联系人` | `t('foxpre.contactPerson')` |
| 59 | `操作` | `t('foxpre.edit')` (或 actions key) |
| 73 | `编辑` | `t('foxpre.edit')` |
| 79 | `删除` | `t('foxpre.delete')` |

#### 8. BidderForm.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 54 | `公司名称 *` | `t('foxpre.bidderName')` |
| 62 | `统一社会信用代码` | `t('foxpre.creditCode')` |
| 70 | `法人代表` | `t('foxpre.legalRep')` |
| 78 | `联系人` | `t('foxpre.contactPerson')` |
| 86 | `联系电话` | `t('foxpre.phone')` |
| 100 | `保存中...` / `保存` | `t('foxpre.saving')` / `t('foxpre.save')` |
| 106 | `取消` | `t('foxpre.cancel')` |

#### 9. StyleTemplateList.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 28 | `加载中...` | `t('foxpre.loading')` |
| 32 | `样式模板` | `t('foxpre.styleTemplate')` |
| 34 | `暂无模板` | `t('foxpre.noTemplates')` |
| 51 | `内置` | `t('foxpre.builtin')` |

#### 10. StyleTemplateForm.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 24 | `'JSON 格式无效'` | `t('foxpre.jsonInvalid')` |
| 66 | `模板名称 *` | `t('foxpre.templateName')` |
| 74 | `描述` | `t('foxpre.description')` |
| 83 | `模板路径` | `t('foxpre.templatePath')` |
| 92 | `格式规范 (JSON)` | `t('foxpre.formatSpec')` |
| 110 | `保存中...` / `保存` | `t('foxpre.saving')` / `t('foxpre.save')` |
| 116 | `取消` | `t('foxpre.cancel')` |

#### 11. BidSettingsPanel.tsx

| 行号 | 硬编码 | 替换 |
|------|--------|------|
| 21 | `项目设置` | `t('foxpre.projectSettings')` |
| 34 | `投标人管理` | `t('foxpre.bidderManagement')` |
| 52 | `样式模板` | `t('foxpre.styleTemplate')` |

### i18n 接入步骤

**Step 1**：在 `apps/web/src/i18n/types.ts` 中追加新的 key。

**Step 2**：在 `apps/web/src/i18n/locales/zh-CN.ts`（所有 19 个 locale 文件）中添加翻译。以 zh-CN 为例：

```typescript
'foxpre.projectName': '项目名称',
'foxpre.loading': '加载中...',
'foxpre.noTasks': '无任务',
'foxpre.pendingDispatch': '等待调度...',
'foxpre.noAgentFound': '未找到此 Agent 的任务',
'foxpre.loadOutputFailed': '加载输出失败',
'foxpre.outputNotReady': '输出文件暂未生成',
'foxpre.noBidders': '暂无投标人',
'foxpre.noTemplates': '暂无模板',
'foxpre.companyName': '公司名称',
'foxpre.jsonInvalid': 'JSON 格式无效',
'foxpre.operationFailed': '操作失败',
'foxpre.saving': '保存中...',
'foxpre.creating': '创建中...',
'foxpre.sentConfirm': '消息已发送至 {agent}',
'foxpre.inputPlaceholder': '输入消息...',
'foxpre.send': '发送',
'foxpre.bidderList': '投标人列表',
'foxpre.add': '新增',
'foxpre.name': '名称',
```

**Step 3**：在每个组件中导入 `useT` 并替换硬编码文本。

**Step 4**：运行 `pnpm --filter @open-design/web typecheck` 确认所有 key 在所有 locale 中都存在。

---

## 修复 #4：AgentChatDrawer 消息发送到后端 API

**文件**：`apps/web/src/components/foxpre/AgentChatDrawer.tsx`

### 问题

当前 `handleSend()` 只设置本地 `sent` 状态并清理消息框，没有任何后端 API 调用。用户输入的消息凭空消失（只有本地确认 toast），Agent 收不到任何指令。

### 修复方案

后端需要有一个端点接收 Agent 指令。检查已有 API 路由 — 如果有 `POST /api/foxpre/bid/:id/chat` 或类似端点，则调用它；如果没有，MVP 方案使用已有的 SSE 通道或直接 POST 到 bid start/advance。

**MVP 实现**：由于 Agent 通信通道在阶段八才完整实现，当前修复最少要做到：

1. POST 消息到 `/api/foxpre/bid/${projectId}/chat`（未来端点，当前后端可返回 501 Not Implemented 但前端已准备好）
2. 或者，如果后端有 `/api/chat` 端点，复用那个

如果后端当前无此端点，最低限度改动：

```tsx
const handleSend = async () => {
  if (!message.trim()) return;
  try {
    const resp = await fetch(`/api/foxpre/bid/${encodeURIComponent(projectId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentCode,
        message: message.trim(),
      }),
    });
    if (!resp.ok) throw new Error('发送失败');
    setSent(true);
    setMessage('');
    setTimeout(() => setSent(false), 2000);
  } catch (err) {
    setError(String(err));
  }
};
```

同时新增 `error` 状态并在 UI 中渲染。

---

## 修复 #5：CreateBidForm 投标人下拉空值时提供引导入口

**文件**：`apps/web/src/components/foxpre/CreateBidForm.tsx`

### 问题

当投标人列表为空时（首次使用），下拉框只有"请选择投标人"placeholder，用户没有任何入口来创建投标人。

### 修复方案

当 `bidders.length === 0` 且加载完成时，在下拉框下方显示引导提示：

```tsx
{bidders.length === 0 && (
  <p className="text-xs text-amber-600 mt-1">
    暂无可选投标人，请在项目设置中先创建投标主体信息
  </p>
)}
```

（如果已接入 i18n，使用 `t('foxpre.noBiddersHint')`。

---

## 修复顺序

| 顺序 | 修复项 | 预计工作量 | 依赖 |
|------|--------|-----------|------|
| 1 | #1 buildMetadata bid 分支 | 已完成（架构师） | 无 |
| 2 | #2 DocumentPreview 加载真实数据 | 30 分钟 | 需传递 tasks prop |
| 3 | #3 接入 i18n (34 key 补充 + 11 组件修改) | 2 小时 | 需修改 types.ts + 19 locale 文件 |
| 4 | #4 AgentChatDrawer 发送到 API | 15 分钟 | 需确认后端端点 |
| 5 | #5 CreateBidForm 空投标人引导 | 10 分钟 | 无 |

---

## 验证清单

修复完成后，执行以下验证：

```bash
# 1. 类型检查
pnpm --filter @open-design/web typecheck

# 2. 代码规范
pnpm guard

# 3. 启动开发服务器验证
pnpm tools-dev run web --daemon-port 17456 --web-port 17573

# 4. 手动验证步骤
#    a. 打开 http://127.0.0.1:17573/
#    b. 新建项目 → 标书制作 Tab → 填写表单 → 创建
#    c. 确认能进入 BidWarRoom（非 OD 默认项目视图）
#    d. 切换浏览器语言为 en，确认界面显示英文翻译
#    e. 创建投标人（设置面板）
#    f. 选择 Agent → 查看 DocumentPreview 加载内容
```

---

## 提交规范

每个修复单独提交，commit message 格式：

```
foxpre: fix <简短描述>
```

示例：
```
foxpre: fix buildMetadata missing 'bid' branch
foxpre: load real agent output in DocumentPreview
foxpre: wire useT() i18n in all foxpre components
foxpre: send chat messages to backend API
foxpre: add empty bidder guidance in CreateBidForm
```

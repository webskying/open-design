# foxpre 实施路线图

**版本**：v1.0
**日期**：2026-06-12
**前置文档**：`architecture-analysis.md`（架构分析）、`foxpre-requirements-spec.md`（需求规格）、`foxpre__implementation-plan.md`（实施计划）

---

## 0. 环境准备（Pre-flight）⚠️ 必读

### 0.1 Node.js 版本

```
当前 Open Design 要求：Node ~24（engines.node: "~24"）
用户当前环境：      Node 26
```

**强烈建议降级到 Node 24。** Node 26 上 better-sqlite3 需要从源码编译且可能有未测试的兼容性问题。

```bash
# Windows（fnm）
fnm install 24
fnm use 24

# Windows（nvm-windows）
nvm install 24
nvm use 24

# 验证
node --version  # 必须输出 v24.x.x
```

如坚持使用 Node 26，需额外准备：
- Visual Studio Build Tools 2022+（`better-sqlite3` 编译）
- 预期 `pnpm install` 耗时增加 ~2 分钟（原生模块编译）
- 运行时行为可能未经 OD 官方验证

### 0.2 开发工具

```bash
# pnpm（Windows 上 corepack 可能 EPERM）
npm install -g pnpm@10.33.2

# Pandoc（MD→DOCX 转换依赖）
winget install JohnMacFarlane.Pandoc
pandoc --version  # 验证

# VS Build Tools 2022+（Windows 上 better-sqlite3 编译）
# 下载：https://visualstudio.microsoft.com/downloads/
# 安装时勾选 "Desktop development with C++"
```

### 0.3 验证基线

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
pnpm install
pnpm guard && pnpm typecheck
pnpm tools-dev run web  # 验证开发环境
```

---

## 1. 实施总览

### 1.1 修改现有文件（6 个）

| 文件 | 修改内容 | 风险等级 |
|------|---------|---------|
| `packages/contracts/src/api/projects.ts` | `ProjectKind` 追加 `'bid'` | 🟢 低 |
| `packages/contracts/src/plugins/scenario-defaults.ts` | `DEFAULT_SCENARIO_PLUGIN_BY_KIND` 追加 `bid` 条目 | 🟢 低 |
| `packages/contracts/tests/scenario-defaults.test.ts` | 测试用例追加 `bid` 映射 | 🟢 低 |
| `apps/web/src/components/NewProjectPanel.tsx` | `CreateTab` 追加 `'bid'`，Tab body 一行条件渲染委托给 `<CreateProjectForm />` | 🟡 中 |
| `apps/web/src/components/ProjectView.tsx` | `kind='bid'` 时新增"标书" Tab | 🟢 低 |
| `apps/daemon/src/server.ts` | 注册 foxpre 路由模块（4 个路由文件） | 🟢 低 |

### 1.2 新增文件（~51 个）

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `packages/contracts/src/foxpre/` | 3 | 常量、API 类型、导出 |
| `apps/daemon/src/foxpre/` | 11 | 数据库、路由、引擎 |
| `apps/daemon/tests/foxpre/` | 3 | 测试 |
| `apps/web/app/foxpre/` | 4 | 页面 |
| `apps/web/src/components/foxpre/` | 18 | UI 组件 |
| `skills/foxpre-*/` | 9 | Agent Skills |

### 1.3 验证关口

```
每个阶段完成后必须通过：
  pnpm guard          ← 代码规范
  pnpm typecheck      ← 类型检查
  阶段相关测试         ← 功能验证
```

---

## 2. 九阶段实施计划

### 阶段零：Contract 层 + 类型验证（🟢 低风险）

**目标**：确立 foxpre 的类型契约，利用 TypeScript 编译器确认所有扩展点。

| 任务 | 文件 | 说明 |
|------|------|------|
| 0.1 | `packages/contracts/src/api/projects.ts` | `ProjectKind` 追加 `'bid'` |
| 0.2 | `packages/contracts/src/plugins/scenario-defaults.ts` | 追加 `bid: 'od-new-generation'` |
| 0.3 | `packages/contracts/src/foxpre/constants.ts` | 智能体代号、状态常量 |
| 0.4 | `packages/contracts/src/foxpre/api.ts` | API DTO 类型（foxpre项目、任务、审核报告等） |
| 0.5 | `packages/contracts/src/foxpre/index.ts` | 统一导出 |

**验证**：
- `pnpm typecheck` 在 `ProjectKind` 添加后应产生可枚举的类型错误（指引后续修改点）
- 修复所有类型错误后，`pnpm typecheck` 必须通过

**提交**：
```
feat: 添加 foxpre Contract 层（ProjectKind + API 类型）
```

---

### 阶段一：数据库层（🟢 低风险）

**目标**：建立 foxpre 的 11 张独立 SQLite 表，通过迁移机制管理。

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `apps/daemon/src/foxpre/db.ts` | 11 张表 + 迁移 + 种子数据 |

**关键设计**：
- foxpre 表使用 `foxpre_` 前缀，与 OD 表完全隔离
- 迁移版本通过 `foxpre_migrations` 表追踪
- 种子数据：12 条通用门禁规则 + 4 套内置投标样式

**验证**：
- `pnpm --filter @open-design/daemon typecheck`
- `pnpm --filter @open-design/daemon test`（现有测试不受影响）

**提交**：
```
feat: 添加 foxpre 数据库模块（11张表 + 迁移 + 种子数据）
```

---

### 阶段二：文档处理管线（🟡 中风险）

**目标**：实现 PDF/DOCX 解析 + DOCX 模板构建 + Markdown→DOCX 转换。

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `apps/daemon/src/foxpre/doc-parser.ts` | PDF/DOCX 文本提取与分块 |
| 2.2 | `apps/daemon/tests/foxpre/doc-parser.test.ts` | 单元测试 |
| 2.3 | `apps/daemon/src/foxpre/template-builder.ts` | 格式规范书 → 空白 DOCX 模板 |
| 2.4 | `apps/daemon/src/foxpre/md-to-docx.ts` | Pandoc 管道（MD→DOCX） |
| 2.5 | `apps/daemon/src/foxpre/image-describer.ts` | 三级降级图片描述引擎 |
| 2.6 | `apps/daemon/tests/foxpre/image-describer.test.ts` | 单元测试 |

**验证**：
- `pnpm --filter @open-design/daemon test tests/foxpre/doc-parser.test.ts`
- `pnpm --filter @open-design/daemon test tests/foxpre/image-describer.test.ts`

**提交**：
```
feat: 添加文档解析器
feat: 添加 DOCX 模板构建器
feat: 添加 Markdown→DOCX 转换引擎
feat: 添加图片描述引擎
```

---

### 阶段三：门禁系统（🟢 低风险）

**目标**：实现双层 Harness 门禁审核引擎。

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `apps/daemon/src/foxpre/harness-engine.ts` | 五步审核流程 |

**验证**：
- `pnpm --filter @open-design/daemon typecheck`

---

### 阶段四：Agent Skills 定义（🟢 低风险）

**目标**：创建 9 个 foxpre 智能体的 SKILL.md 文件。

| 技能标识 | 文件路径 | 核心职责 |
|---------|---------|---------|
| foxpre-analyzer | `skills/foxpre-analyzer/SKILL.md` | 招标文件解析 |
| foxpre-researcher | `skills/foxpre-researcher/SKILL.md` | 资料搜集 |
| foxpre-prototyper | `skills/foxpre-prototyper/SKILL.md` | 原型/图表生成 |
| foxpre-architect | `skills/foxpre-architect/SKILL.md` | 大纲设计 |
| foxpre-tech-writer | `skills/foxpre-tech-writer/SKILL.md` | 技术方案撰写 |
| foxpre-business-writer | `skills/foxpre-business-writer/SKILL.md` | 商务标书 |
| foxpre-pm-writer | `skills/foxpre-pm-writer/SKILL.md` | 项目管理方案 |
| foxpre-reviewer | `skills/foxpre-reviewer/SKILL.md` | 质量审核 |
| foxpre-solo-coder | `skills/foxpre-solo-coder/SKILL.md` | 主控调度 |

**每个 SKILL.md 必须包含**：
- YAML 前置元数据：`name`, `description`, `triggers`, `od.mode: utility`
- 角色描述（中文）
- 职责清单
- 输出格式说明
- Git 提交规范：`[<智能体代号>] <动词>: <简述>`

---

### 阶段五：SOLO Coder 调度引擎（🔴 高风险）

**目标**：实现投标工作流的主控调度逻辑。**这是 foxpre 的核心。**

| 任务 | 文件 | 说明 |
|------|------|------|
| 5.1 | `apps/daemon/src/foxpre/solo-coder.ts` | 6 个核心函数 + 状态机 |

**关键函数**：
- `启动投标工作流()` — 总入口
- `派遣智能体()` — 通过现有 Chat/Run 系统创建 Agent 运行实例
- `监控智能体进度()` — 通过 Git commit 检测进度
- `处理用户介入()` — 暂停/恢复/重定向
- `触发审核()` — 调用门禁引擎
- `组装最终Docx()` — 合并输出

**验证**：
- 状态机必须完整处理：`待启动 → 进行中 → 已完成 → 审核 → 已驳回/通过`
- `pnpm --filter @open-design/daemon typecheck`

---

### 阶段六：Daemon API 路由（🟡 中风险）

**目标**：注册 foxpre 的 HTTP API 端点。

| 任务 | 文件 | 说明 |
|------|------|------|
| 6.1 | `apps/daemon/src/foxpre/bid-routes.ts` | 项目 CRUD + 工作流控制 |
| 6.2 | `apps/daemon/src/foxpre/style-routes.ts` | 样式模板 CRUD |
| 6.3 | `apps/daemon/src/foxpre/bidder-routes.ts` | 投标人信息库 CRUD |
| 6.4 | `apps/daemon/src/foxpre/field-crypto.ts` | AES-256-GCM 加密工具 |
| 6.5 | `apps/daemon/src/foxpre/kanban-sse.ts` | 看板 SSE 推送流 |
| 6.6 | `apps/daemon/src/server.ts` | **修改**：注册 foxpre 路由 |

**server.ts 修改**（在 registerMediaRoutes 之后）：
```typescript
import { registerFoxpreBidRoutes } from './foxpre/bid-routes.js';
import { registerFoxpreStyleRoutes } from './foxpre/style-routes.js';
import { registerFoxpreBidderRoutes } from './foxpre/bidder-routes.js';

// 在路由注册段（~6291 行之后）：
registerFoxpreBidRoutes(app, { db, http: httpDeps, ... });
registerFoxpreStyleRoutes(app, { db, http: httpDeps, ... });
registerFoxpreBidderRoutes(app, { db, http: httpDeps, ... });
```

**验证**：
- `pnpm --filter @open-design/daemon typecheck`
- `pnpm --filter @open-design/daemon test`（现有路由不受影响）

---

### 阶段七：Web 用户界面（🔴 高风险）

**目标**：实现 foxpre 的全部 Web UI。**这是工作量最大的阶段。**

| 任务 | 文件 | 说明 |
|------|------|------|
| 7.1 | `apps/web/src/components/NewProjectPanel.tsx` | **修改**：新增"标书制作" Tab |
| 7.2 | `apps/web/src/components/ProjectView.tsx` | **修改**：kind='bid' 时显示"标书" Tab |
| 7.3 | `apps/web/src/components/foxpre/CreateProjectForm.tsx` | 4 步创建流程 |
| 7.4 | `apps/web/src/components/foxpre/BidWarRoom.tsx` | 三栏作战室 |
| 7.5 | `apps/web/src/components/foxpre/KanbanBoard.tsx` | 看板（dnd-kit） |
| 7.6 | `apps/web/src/components/foxpre/DocumentPreview.tsx` | 文档预览 |
| 7.7 | `apps/web/src/components/foxpre/AgentChatPanel.tsx` | 智能体对话面板 |
| 7.8 | `apps/web/app/foxpre/settings/page.tsx` | 投标人信息库设置页 |
| 7.9 | `apps/web/app/foxpre/styles/page.tsx` | 样式设计器页 |
| 7.10 | 其他 UI 组件（~12 个） | 选择器、表单、卡片等 |

**NewProjectPanel.tsx 修改要点**：
```typescript
// 1. CreateTab 追加 'bid'
export type CreateTab = 'prototype' | 'live-artifact' | 'deck' | 'template' | 'media' | 'other' | 'bid';

// 2. TAB_LABEL_KEYS 追加
const TAB_LABEL_KEYS: Record<CreateTab, keyof Dict> = {
  // ...existing...
  bid: 'newproj.tabBid',
};

// 3. buildMetadata 中追加映射
// bid Tab → kind: 'bid'

// 4. Tab body 中追加 bid 专属面板（4 步流程）
```

**ProjectView.tsx 修改要点**：
```typescript
// kind === 'bid' 时在 Tab 列表中追加 "标书" Tab
// 选中时渲染 <BidWarRoom /> 三栏组件
```

**验证**：
- `pnpm --filter @open-design/web typecheck`
- `pnpm --filter @open-design/web test`
- 手动验证：创建 bid 项目 → UI 加载 → Tab 切换

---

### 阶段八：DOCX 组装与输出（🟢 低风险）

**目标**：实现最终 DOCX 文件的组装。

| 任务 | 文件 | 说明 |
|------|------|------|
| 8.1 | `apps/daemon/src/foxpre/docx-assembler.ts` | 6 步组装管线 |

---

### 阶段九：集成测试与打磨（🟡 中风险）

| 任务 | 说明 |
|------|------|
| 9.1 | 集成测试（5 个场景） |
| 9.2 | i18n 词条（18 语言） |
| 9.3 | `pnpm guard` + `pnpm typecheck` 全量 |

---

## 3. 关键风险与缓解措施

### 3.1 NewProjectPanel.tsx 修改冲突 🔴 高

**风险**：NewProjectPanel.tsx 是 3000+ 行的巨型组件，上游频繁修改时冲突概率最高。

**缓解**：
1. foxpre 的 Tab body 完全委托给独立组件 `<CreateProjectForm />`
2. NewProjectPanel 中只做最小化修改：
   - `CreateTab` 追加 `'bid'` 字面量
   - `TAB_LABEL_KEYS` 追加一条记录
   - `buildMetadata` 追加一个 case
   - 条件渲染：`tab === 'bid' && <CreateProjectForm ... />`
3. 关注上游是否重构 NewProjectPanel（拆分为子组件），如果有，foxpre 只需调整 `<CreateProjectForm />` 的挂载位置

### 3.2 Windows + better-sqlite3 编译 🟡 中

**风险**：OD 标记 Windows 为 best-effort，`better-sqlite3` 无预编译二进制，需从源码编译。

**缓解**：
- 安装 Visual Studio Build Tools 2022+（C++ 工作负载）
- 预期 `pnpm install` 额外耗时 ~2 分钟
- 如编译失败，检查 MSVC 工具链：`npm ls -g --depth=0 windows-build-tools`

### 3.3 Pandoc 系统依赖 🟡 中

**风险**：MD→DOCX 转换依赖 Pandoc 命令行工具，需确保开发和部署环境预装。

**缓解**：
- 开发环境：`winget install JohnMacFarlane.Pandoc` 或各平台包管理器
- 部署文档中明确列出系统依赖
- 启动时通过 `pandoc --version` 检测并给出友好提示

### 3.4 Windows DPAPI 原生依赖 🟡 中

**风险**：`field-crypto.ts` 密钥管理使用 OS Keychain（Windows DPAPI），Node.js 中的封装库可能引入额外的原生编译依赖。

**缓解**：
- MVP 阶段使用 Node.js 内置 `crypto` 模块 + 文件系统密钥存储
- 预留 OS Keychain 抽象接口，Phase 2 再集成 `node-dpapi` 或 `keytar`
- 密钥文件路径受限于 `.od/foxpre/` 目录，与 OD 数据目录权限一致

### 3.5 上游 rebase 维护 🟡 中

**风险**：foxpre 作为 fork 维护，需要定期从上游 rebase。

**缓解**：
- 每两周执行一次 `git rebase upstream/main`
- 修改面最小化（仅 6 个现有文件），rebase 冲突面可控
- 通过 `pnpm guard && pnpm typecheck` 快速验证 rebase 结果
- 关注 OD 的 CHANGELOG 和 release notes
- 向上游提交无争议的改进（如 ProjectKind 扩展点抽象），减少长期 fork 负担

### 3.6 scenario-defaults.test.ts 遗漏 🟢 低（已修复）

**说明**：`DEFAULT_SCENARIO_PLUGIN_BY_KIND` 追加 `'bid'` 条目后，对应测试文件 `packages/contracts/tests/scenario-defaults.test.ts` 的 `Record<string, string>` 需同步追加 `bid: 'od-new-generation'`。

**缓解**：已在修改文件清单中补全。

---

## 4. 实施检查清单

**推荐执行顺序**：先做低风险的验证层（阶段零→一→四），确认架构可行性后再推进 UI 和调度引擎（阶段七→五）。

每个阶段完成后打勾 ✅：

- [ ] **阶段零**：Contract 层 + 类型验证（`ProjectKind` 追加 + `pnpm typecheck` 确认所有修改点）
- [ ] **阶段一**：数据库层（11 张表创建，验证与 OD 现有表不冲突）
- [ ] **阶段四**：Agent Skills 定义（9 个 SKILL.md，验证 Skills 扫描机制正常识别）
- [ ] **阶段二**：文档处理管线（PDF/DOCX 解析 + MD→DOCX 转换）
- [ ] **阶段三**：门禁系统（双层 Harness 引擎）
- [ ] **阶段六**：Daemon API 路由（server.ts 修改 + 4 个路由模块）
- [ ] **阶段七**：Web 用户界面（NewProjectPanel + ProjectView 修改 + 全部 UI 组件）
- [ ] **阶段五**：SOLO Coder 调度引擎（依赖阶段六的 API 路由和阶段四的 Skills）
- [ ] **阶段八**：DOCX 组装与输出
- [ ] **阶段九**：集成测试与打磨（`pnpm guard && pnpm typecheck` 通过）

---

## 5. 参考链接

| 文档 | 内容 |
|------|------|
| `architecture-analysis.md` | Open Design 架构链分析 + 兼容性评估 |
| `foxpre-requirements-spec.md` | 需求规格说明书 v1.1-MVP |
| `foxpre__implementation-plan.md` | 原始实施计划（文件级细节） |
| `AGENTS.md` | foxpre 开发指南 |

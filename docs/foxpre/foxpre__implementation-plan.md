# foxpre MVP 技术实现计划

> **面向智能体执行者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 子技能，按任务逐步实现本计划。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 基于 Open Design 代码库分支，构建 foxpre 多智能体投标文件编制协作系统。

**架构策略：** foxpre 深度集成到 Open Design 中，在 New Project 面板新增"标书制作" Tab（`ProjectKind = 'bid'`），在 ProjectView 中新增"标书"工作区。新增 foxpre 守护进程模块（SOLO Coder 调度引擎、MD转DOCX引擎、Harness门禁引擎、图片描述引擎、投标人信息库）、foxpre Web 组件（投标作战室看板、样式设计器）以及 9 个投标专业 Skills。最大化代码复用：保持 Express/SQLite 守护进程、Next.js 前端、Chat/Run 系统、SSE 流、Skills 注册表、MCP 连接器和 design-templates 不变，仅做最小化修改。

**v1.1 更新要点（2026-06-10）：**
- 投标人信息库从单一 `enterprise_config` 表扩展为三表模型（投标人 + 资质证书 + 业绩案例），支持多投标人管理
- 新增项目引用关系表 `project_references`，支持引用已有 Open Design 项目
- 新增图片描述引擎 `image-describer.ts`，支持三级降级（Vision → HTML分析 → 手动标注）
- New Project 流程简化：上传招标文件 → 自动提取信息 → 关联投标人 → 引用已有项目
- 数据安全：敏感字段应用层 AES-256-GCM 加密，密钥存于 OS Keychain

**v1.2 架构分析更新（2026-06-12）：**
- 基于 Codegraph 知识图谱完成 Open Design Project 子系统完整架构链分析
- 确认：`ProjectKind` 联合类型 + `DEFAULT_SCENARIO_PLUGIN_BY_KIND` Record 以类型安全方式约束扩展
- 确认：4 个现有文件的修改面（contracts ×2, NewProjectPanel, server.ts）
- 确认：Node 24 为推荐版本；Node 26 有 better-sqlite3 兼容风险
- 详见：`docs/foxpre/architecture-analysis.md` 和 `docs/foxpre/implementation-roadmap.md`

**技术栈：** Next.js 16 + React 18、Express + SQLite（better-sqlite3）、Pandoc + docx.js（MD转DOCX）、simple-git（Git 工作流）、pdf-parse + mammoth.js（文档解析）、Puppeteer（截图）、MCP Client SDK（next-dwr-io）。

**相关文档：**
- 架构分析：`docs/foxpre/architecture-analysis.md`
- 实施路线图：`docs/foxpre/implementation-roadmap.md`
- 需求规格：`docs/foxpre/foxpre-requirements-spec.md`
- 开发指南：`docs/foxpre/AGENTS.md`

---

## 阶段零：项目初始化

### 任务 0.1：安装依赖包

- [ ] 守护进程新增依赖：`cd apps/daemon && pnpm add simple-git pdf-parse mammoth docx && pnpm add -D @types/pdf-parse`
- [ ] 前端新增依赖：`cd apps/web && pnpm add @dnd-kit/core @dnd-kit/sortable`
- [ ] 验证 Pandoc 可用：`pandoc --version`（如缺失，通过包管理器安装）
- [ ] 提交：`git commit -m "chore: 添加 foxpre 依赖包（simple-git, pdf-parse, mammoth, docx, dnd-kit）"`

### 任务 0.2：创建 foxpre 常量与共享类型

**涉及文件：**
- 新建：`packages/contracts/src/foxpre/constants.ts`
- 新建：`packages/contracts/src/foxpre/api.ts`
- 新建：`packages/contracts/src/foxpre/index.ts`

**`constants.ts` 导出：**
- `智能体代号`（9个）、`项目状态`（6个）、`项目类型`（4个）、`任务状态`（7个）、`任务类型`（5个）、`看板列`（5个）、`门禁严重度`

**`api.ts` 导出类型：**
- `foxpre项目`、`智能体任务`、`审核报告`（含通用门禁和特定门禁、格式一致性结果）、`样式模板`/`样式配置`、`投标人信息`/`资质证书`/`业绩案例`、`项目引用关系`/`章节映射`、`图片描述结果`、`文档片段`、`分析器输出`/`格式规范书`/`格式章节`/`门禁检查项`、`任务列表响应`、`智能体状态变更事件`、`项目进度事件`、`创建项目请求`、`上传招标文件响应`、`转换选项`、`解析结果`

- [ ] 运行：`pnpm --filter @open-design/contracts typecheck`
- [ ] 提交：`git commit -m "feat: 添加 foxpre 共享常量与 API 契约类型"`

---

## 阶段一：数据库与数据模型

### 任务 1.1：foxpre 数据库模块

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/db.ts`
- 修改：`apps/daemon/src/server.ts`（引入并调用 `initFoxpreDatabase()`）

**数据库表（共11张）：**

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `foxpre_projects` | 投标项目元数据 | 样式模板ID、关联投标人ID、引用项目JSON、MCP配置JSON |
| `agent_tasks` | 智能体任务生命周期 | 状态、分支、检查点SHA、审核轮次 |
| `document_fragments` | 文档片段追踪 | 目标章节、字数、Git提交SHA |
| `review_history` | 审核审计记录 | 审核报告JSON全文、判决结果 |
| `bidders` | 投标人信息库 | 投标主体名称、信用代码（加密）、法人身份证（加密）、银行账号（加密） |
| `bidder_qualifications` | 投标人资质证书 | 资质名称、证书编号、有效期至、扫描件路径 |
| `bidder_projects` | 投标人业绩案例 | 项目名称、客户名称、合同金额、完成时间 |
| `style_templates` | 样式模板存储 | 名称、分类、样式配置JSON、参考文档路径 |
| `universal_harness_rules` | 通用门禁规则 | 检查类别、检查项、严重度、启用状态 |
| `project_references` | 项目引用关系 | 投标项目ID、引用OD项目ID、引用来源、章节映射JSON |
| `foxpre_migrations` | 迁移版本追踪 | 版本号、执行时间 |

**种子数据函数（按顺序初始化时调用）：**
- `种子通用门禁规则()`：12条内置规则
  - 企业信息类：投标人名称一致性（致命）、统一社会信用代码必填（致命）
  - 联系方式类：联系人姓名/电话/邮箱完整（致命）、地址逻辑一致（警告）
  - 资质文件类：营业执照有效期（致命）、法人身份证明（致命）
  - 签章格式类：法定代表人签字/盖章（致命）、授权委托书格式（致命）
  - 保证金类：金额一致性（致命）、缴纳方式（警告）
  - 格式基础类：连续页码（警告）、目录章节匹配（警告）
- `种子样式模板()`：4套内置投标样式
  - 政府信息化投标标准样式、国企招投标规范样式、简洁商务样式、经典学术样式

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 运行：`pnpm --filter @open-design/daemon test`（验证现有测试仍通过）
- [ ] 提交：`git commit -m "feat: 添加 foxpre 数据库模块（11张表+迁移+种子数据）"`

---

## 阶段二：文档处理管线

### 任务 2.1：文档解析器

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/doc-parser.ts`

**核心函数：**
- `解析文档(文件路径)` → 返回 `解析结果 { 文件路径, 文件类型, 原始文本, 页数, 元数据 }`
  - PDF：`pdf-parse` 读取 Buffer → 提取文本
  - DOCX：`mammoth.extractRawText()` 提取纯文本
  - PDF 文本产出低于 50字符/页 → 标记为低质量扫描件警告
- `分块文本(原始文本, 最大字符数=80000)` → 字符串数组
  - 按段落边界切分，每块不超过 LLM 上下文窗口限制

**单元测试：** `apps/daemon/tests/foxpre/doc-parser.test.ts`
- 短文本分块（单块返回）
- 长文本分块（段落边界正确切分）
- 空文本边界条件

- [ ] 运行：`pnpm --filter @open-design/daemon test tests/foxpre/doc-parser.test.ts`
- [ ] 提交：`git commit -m "feat: 添加文档解析器（PDF/DOCX文本提取）"`

### 任务 2.2：DOCX 模板构建器

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/template-builder.ts`

**核心函数：**
- `构建Docx模板(格式规范书, 样式配置?)` → 空白 DOCX 文档对象
  - 生成目录占位符
  - 按格式规范递归创建标题，应用中文多级编号（一、/（一）/ 1.）
  - 填空区插入 `{{fill:标题}}` 占位符
  - 内容区插入 `{{content:标题}}` 占位符
  - 需要表格的节预建表头框架
  - 页面设置：A4、标准页边距、页眉（"投标文件"）、页脚（页码）
- `保存Docx模板(文档对象, 输出路径)` → 序列化写入 .docx

**依赖：** `docx` npm 包（Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, PageNumber, TableOfContents）

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 DOCX 模板构建器（格式规范书→空白投标框架）"`

### 任务 2.3：Markdown 转 DOCX 转换引擎

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/md-to-docx.ts`

**核心函数：**
- `标记转Docx(标记文本, 输出路径, 选项)` → 返回 `{ 输出路径, 字数 }`
  1. 将 Markdown 文本写入临时文件
  2. 执行 `pandoc 临时文件.md --reference-doc=样式参考.docx -o 输出.docx`
  3. 统计字数
- `组合章节(章节输入[], 输出路径, 选项)` → 多章节拼接后统一转换

**选项类型：** `{ 参考文档路径, 样式配置?, 图片列表? }`

**说明：** MVP 阶段先使用 Pandoc 带参考模板直出。后处理优化（中文编号修正、下划线填空区、表格样式精修、页眉页脚注入）作为后续迭代叠加。

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 Markdown→DOCX 转换引擎（Pandoc 管道）"`

---

## 阶段二.5：图片描述引擎（v1.1 新增）

### 任务 2.5：图片描述器

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/image-describer.ts`
- 新建：`apps/daemon/tests/foxpre/image-describer.test.ts`

**核心函数：**

| 函数 | 职责 |
|---|---|
| `分析引用项目(项目ID, 项目路径, 招标需求?)` | 分析引用的 Open Design 项目，提取截图并生成功能描述 |
| `从HTML提取文本(html内容)` | Level 2 降级：解析 HTML 代码提取标题、按钮、表单、导航等文本信息 |
| `从文件名推断功能(项目路径)` | Level 2 降级：基于文件名（如 login.html → 登录模块）推断功能 |
| `从CSS类名推断(html内容)` | Level 2 降级：基于 CSS 类名推断 UI 组件类型 |
| `生成Vision描述(图片路径, 招标需求)` | Level 3：调用多模态 LLM 生成结构化图片描述 |
| `检测Vision可用性()` | 检测当前 Agent 运行时是否支持 `supportsImagePaths` |

**三级降级策略：**

```
Level 3（最优）→ 多模态 Vision 分析
  条件：用户配置了支持 Vision 的 LLM
  产出：{ 功能概述, 核心元素[], 用户交互, 技术特征[], 投标关联度, 描述精度: 'Level3-Vision' }

Level 2（降级）→ HTML 代码分析 + 文件名推断
  条件：无多模态 LLM，但有项目 HTML 文件
  产出：基于代码分析的描述（覆盖80%场景）
  置信度：0.6

Level 1（兜底）→ 返回待标注状态
  条件：无法自动分析
  产出：{ 描述精度: 'Level1-待标注', 功能概述: '' }
  UI 层提供手动标注表单
```

**输出类型：**
```typescript
interface 图片描述结果 {
  截图路径: string;
  功能概述: string;
  核心元素: string[];
  用户交互: string;
  技术特征: string[];
  投标关联度: number;          // 0-1
  描述精度: 'Level3-Vision' | 'Level2-文本推断' | 'Level1-待标注';
  建议章节: string;            // 如 "3.2.1 系统架构设计"
}
```

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 运行：`pnpm --filter @open-design/daemon test tests/foxpre/image-describer.test.ts`
- [ ] 提交：`git commit -m "feat: 添加图片描述引擎（三级降级：Vision→HTML分析→手动标注）"`

---

## 阶段三：门禁系统

### 任务 3.1：Harness 门禁引擎

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/harness-engine.ts`

**核心函数：** `执行门禁审核(数据库, 上下文: 门禁上下文) → 审核报告`

**门禁上下文输入：**
```typescript
{
  项目ID: string;
  分析器输出: 分析器输出;           // 需求报告 + 格式规范 + 门禁清单
  投标人信息: 投标人信息;             // 通用门禁字段匹配来源（v1.1 替代企业配置）
  已生成内容: Record<string, string>;  // 智能体代号→Markdown内容
  已生成文件: Record<string, string>;
  自定义规则: 自定义检查项[];        // 用户当前项目级审查要点
}
```

**执行流程（五步）：**

**第一步——通用门禁检查**
- 从数据库加载所有启用状态的通用门禁规则
- 对每条规则执行确定性检查：
  - `字段存在检查`：生成内容中是否包含必填字段
  - `精确匹配检查`：字段值是否与企业配置中的值完全一致
  - `条件存在检查`：根据招标要求判断某字段是否需要出现
- 构建 `通用门禁失败项[]`，每条含：类别、检查项、状态、严重度、详细说明、指派智能体、修改建议
- 需要 LLM 评估的规则标记为 `需LLM评估: true`

**第二步——特定门禁检查**
- 将分析器输出的 `门禁清单` 映射到 `特定一级门禁[]`（废标点列表）
- 初始化 `特定二级评分`（由 Reviewer Agent LLM 实际评估填值）
- 初始化 `特定三级` 和 `特定四级`（同样由 LLM 评估）

**第三步——格式一致性检查**
- 扫查内容中的术语不一致对
- 检查未替换占位符

**第四步——判定结论**
- 有致命失败项 → `已驳回`
- 仅有警告级 → `有条件通过`
- 完全干净 → `通过`

**第五步——构建下一步行动**
- 将每条失败项映射为 `下一步行动`
- 包含：指派智能体、任务描述、优先级（critical/normal）、截止时间

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加双层 Harness 门禁引擎"`

---

## 阶段四：智能体 Skills 定义

### 任务 4.1：创建 foxpre 智能体 Skills

**涉及文件：** 在 `skills/foxpre-*/SKILL.md` 下新建 9 个 SKILL.md

| 技能标识 | 文件路径 | 核心角色与职责 |
|---|---|---|
| foxpre-analyzer | `skills/foxpre-analyzer/SKILL.md` | 解析招标文件，提取需求分析报告、格式规范书、废标点清单、置信度评分 |
| foxpre-researcher | `skills/foxpre-researcher/SKILL.md` | 搜集行业案例、技术参考资料、政策文件，输出到 `research/` 目录 |
| foxpre-prototyper | `skills/foxpre-prototyper/SKILL.md` | 生成HTML原型并截图；调用 next-dwr-io MCP 生成架构图/网络拓扑图 |
| foxpre-architect | `skills/foxpre-architect/SKILL.md` | 设计技术大纲，每个章节标注评分项编号和建议页数 |
| foxpre-tech-writer | `skills/foxpre-tech-writer/SKILL.md` | 按大纲撰写技术方案各章节，引用原型截图和参考资料 |
| foxpre-business-writer | `skills/foxpre-business-writer/SKILL.md` | 编制商务标书：投标函、资质索引、业绩案例、偏离表 |
| foxpre-pm-writer | `skills/foxpre-pm-writer/SKILL.md` | 撰写实施计划、团队配置、进度管理、风险管理章节 |
| foxpre-reviewer | `skills/foxpre-reviewer/SKILL.md` | 双层审核：通用门禁规则 + 特定废标点 + 评分响应度 + 自定义审查 + 格式一致性 |
| foxpre-solo-coder | `skills/foxpre-solo-coder/SKILL.md` | 投标项目经理：任务分解、智能体调度、成果整合、触发审核、协调用户介入 |

**每个 SKILL.md 必须包含：**
- YAML 前置元数据：名称、描述、触发器、模式(utility)、分类(foxpre)
- 角色描述段落
- 职责清单（编号列表）
- 输出格式说明（输出为 Markdown 格式，保存到指定目录）
- 工具使用规范：Git 提交格式为 `[<智能体代号>] <动词>: <简述>`

- [ ] 验证：9个 SKILL.md 文件均有有效 YAML 前置元数据和全部必要章节
- [ ] 提交：`git commit -m "feat: 添加 9 个 foxpre 智能体 Skill 定义"`

---

## 阶段五：SOLO Coder 调度引擎

### 任务 5.1：SOLO Coder 核心引擎

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/solo-coder.ts`

**核心函数（6个）：**

| 函数 | 职责 |
|---|---|
| `启动投标工作流(数据库, 项目, 投标人信息)` | 入口：依次执行 Analyzer→Researcher+Prototyper（并行）→Architect→三个Writer（并行）→Reviewer |
| `派遣智能体(数据库, 项目ID, 智能体代号, 任务配置)` | 通过现有 Chat/Run 系统创建 Agent 运行实例，传入上下文和工具权限 |
| `监控智能体进度(数据库, 项目ID)` | 每30秒通过 `simple-git.log()` 检查各 Agent 分支最新提交，解析 `[代号]` 提交信息更新状态 |
| `处理用户介入(数据库, 项目ID, 目标智能体, 消息)` | 暂停 Agent，将用户指令作为高优先级上下文注入，恢复运行 |
| `触发审核(数据库, 项目ID)` | 收集所有 Agent 输出，调用门禁引擎，返回审核报告 |
| `组装最终Docx(数据库, 项目ID)` | 合并已通过分支到主分支，运行 MD→DOCX 管道，调用文档组装器生成最终文件 |

**状态机（按需求规格 7.3）：**
```
待启动 → 进行中 → 已完成 → (审核) → 已驳回→进行中(审核轮次+1) / 通过
            ├→ 已暂停 ← 用户介入
            └→ 已出错 → 用户决定重试/跳过/接管
```

**Git 工作流：**
- 在 `.foxpre/projects/<项目ID>/` 下创建 Git 仓库和目录结构
- 为每个任务创建 `agent/<代号>/<任务ID>` 工作分支
- 使用 `simple-git` 库进行所有 Git 操作（init、checkout、commit、merge、log）

**SSE 推送：**
- 复用现有 SSE 基础设施
- 每次状态转换推送 `智能体状态变更` 和 `项目进度` 事件

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 SOLO Coder 调度引擎"`

---

## 阶段六：守护进程 API 路由

### 任务 6.1：foxpre 项目路由

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/bid-routes.ts`
- 修改：`apps/daemon/src/server.ts`（注册路由）

**接口列表：**

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/foxpre/projects` | 创建投标项目，初始化 Git 仓库 |
| POST | `/api/foxpre/projects/:id/upload-tender` | 多部件上传招标文件，运行文档解析器 |
| GET | `/api/foxpre/projects/:id` | 获取项目详情 |
| GET | `/api/foxpre/projects` | 列出所有项目 |
| POST | `/api/foxpre/projects/:id/start` | 启动完整投标工作流 |
| GET | `/api/foxpre/projects/:id/tasks` | 返回按看板列分组的任务列表 |
| GET | `/api/foxpre/projects/:id/diff/:fragmentId` | 返回文档片段的 Git diff |
| POST | `/api/foxpre/projects/:id/tasks/:taskId/intervene` | 用户向智能体发送指令 |
| POST | `/api/foxpre/projects/:id/tasks/:taskId/pause` | 暂停智能体 |
| POST | `/api/foxpre/projects/:id/tasks/:taskId/resume` | 恢复智能体 |
| POST | `/api/foxpre/projects/:id/tasks/:taskId/rollback` | 回滚到上一个检查点 |
| GET | `/api/foxpre/projects/:id/output/:version/download` | 下载最终 DOCX |

**在 `server.ts` 中注册：**
```typescript
import { registerFoxpreBidRoutes } from './foxpre/bid-routes';
import { registerFoxpreStyleRoutes } from './foxpre/style-routes';
import { registerFoxpreBidderRoutes } from './foxpre/bidder-routes';
import { initFoxpreDatabase } from './foxpre/db';
// 在 registerMediaRoutes 之后，registerRoutineRoutes 之前
registerFoxpreBidRoutes(app, { db, http: httpDeps, ... });
registerFoxpreStyleRoutes(app, { db, http: httpDeps, ... });
registerFoxpreBidderRoutes(app, { db, http: httpDeps, ... });
initFoxpreDatabase(db);
```

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 foxpre 项目 API 路由"`

### 任务 6.2：样式与投标人信息库路由

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/style-routes.ts`
- 新建：`apps/daemon/src/foxpre/bidder-routes.ts`
- 新建：`apps/daemon/src/foxpre/field-crypto.ts`

**样式路由接口：**
- `GET /api/foxpre/styles` — 列出所有样式模板
- `POST /api/foxpre/styles` — 创建自定义样式（上传参考 DOCX 或 JSON 配置）
- `PUT /api/foxpre/styles/:id` — 更新样式配置
- `DELETE /api/foxpre/styles/:id` — 删除自定义样式（内置样式禁止删除）
- `GET /api/foxpre/styles/:id/preview` — 生成预览 DOCX 片段
- `POST /api/foxpre/styles/:id/apply/:projectId` — 将样式应用到项目

**投标人信息库路由接口（v1.1 替代原 enterprise-routes）：**
- `GET /api/foxpre/bidders` — 列出所有投标人
- `POST /api/foxpre/bidders` — 新增投标人（敏感字段通过 `field-crypto.ts` 加密后存储）
- `GET /api/foxpre/bidders/:id` — 获取投标人详情（敏感字段解密后返回，脱敏显示）
- `PUT /api/foxpre/bidders/:id` — 更新投标人信息
- `DELETE /api/foxpre/bidders/:id` — 删除投标人
- `POST /api/foxpre/bidders/:id/qualifications` — 新增资质证书
- `PUT /api/foxpre/bidders/:id/qualifications/:qid` — 更新资质证书
- `DELETE /api/foxpre/bidders/:id/qualifications/:qid` — 删除资质证书
- `POST /api/foxpre/bidders/:id/projects` — 新增业绩案例
- `PUT /api/foxpre/bidders/:id/projects/:pid` — 更新业绩案例
- `DELETE /api/foxpre/bidders/:id/projects/:pid` — 删除业绩案例
- `GET /api/foxpre/bidders/:id/export` — 导出投标人完整信息（含资质+案例，JSON 格式）
- `POST /api/foxpre/bidders/import` — 批量导入投标人信息（JSON 格式）
- `GET /api/foxpre/harness-rules` — 列出通用门禁规则
- `PUT /api/foxpre/harness-rules/:id` — 启用/禁用/修改某条规则
- `POST /api/foxpre/harness-rules` — 新增自定义门禁规则

**`field-crypto.ts` 敏感字段加密工具：**
- `加密字段(明文: string, 密钥: Buffer)` → `{ 密文: string, iv: string, tag: string }`（AES-256-GCM）
- `解密字段(密文: string, iv: string, tag: string, 密钥: Buffer)` → `string`
- `获取加密密钥()` → 从 OS Keychain 读取或首次生成（Windows DPAPI / macOS Keychain / Linux libsecret）
- `脱敏显示(原文: string, 类型: '身份证' | '银行账号')` → 如 `110***********1234`
- **加密字段列表**：`法人身份证号`、`银行账号`（高敏感）；`统一社会信用代码`（中敏感）

**在 `server.ts` 中注册两个路由模块 + 引入 field-crypto 初始化**
```typescript
import { registerFoxpreStyleRoutes } from './foxpre/style-routes';
import { registerFoxpreBidderRoutes } from './foxpre/bidder-routes';
registerFoxpreStyleRoutes(app, db);
registerFoxpreBidderRoutes(app, db);
```

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 foxpre 样式与投标人信息库 API 路由（含敏感字段加密）"`

### 任务 6.3：看板 SSE 推送流

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/kanban-sse.ts`

**接口：** `GET /api/foxpre/projects/:id/kanban-events` — SSE 事件流

**推送事件类型：**
- `智能体状态变更` — 任意 `agent_tasks` 表状态转换时
- `项目进度` — 工作流整体阶段切换时
- `文档片段更新` — 文档章节有新 Git 提交时

**实现方式：** 复用现有 Chat 路由中相同的 SSE 响应模式（`res.writeHead` + `res.write`）。

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加 foxpre 看板 SSE 推送流接口"`

---

## 阶段七：Web 用户界面

### 任务 7.1：foxpre 项目列表页

**涉及文件：**
- 新建：`apps/web/app/foxpre/page.tsx`（列表页）
- 新建：`apps/web/app/foxpre/layout.tsx`（foxpre 布局与导航）
- 新建：`apps/web/src/components/foxpre/ProjectCard.tsx`（项目卡片组件）

**布局：** 投标项目网格/列表展示。每张卡片显示：项目名称、招标项目名称、状态徽章、最后更新时间。顶部"新建投标项目"按钮。

**四种状态：** 加载中（骨架卡片）、空状态（引导插画 + CTA按钮）、加载失败（重试按钮）、已加载（项目卡片网格）。

- [ ] 提交：`git commit -m "feat: 添加 foxpre 项目列表页"`

### 任务 7.2：新建项目流程（v1.1 简化为 4 步，集成到 NewProjectPanel）

**涉及文件：**
- 修改：`apps/web/src/components/NewProjectPanel.tsx`（新增"标书制作" Tab，`ProjectKind = 'bid'`）
- 修改：`packages/contracts/src/api/projects.ts`（`ProjectKind` 新增 `'bid'`）
- 新建：`apps/web/src/components/foxpre/CreateProjectForm.tsx`
- 新建：`apps/web/src/components/foxpre/FileUploadZone.tsx`
- 新建：`apps/web/src/components/foxpre/StyleSelector.tsx`
- 新建：`apps/web/src/components/foxpre/BidderSelector.tsx`
- 新建：`apps/web/src/components/foxpre/ProjectReferencePicker.tsx`

**简化 4 步流程（替代原有 3 步）：**
1. **上传招标文件**：用户只需上传文件 + 给项目起个别名（如"6月智慧交通投标"）。招标项目名称、招标编号、项目类型由 Analyzer 自动提取，无需手工填写。拖拽上传 PDF/DOCX（50MB上限），含上传进度指示器
2. **关联投标人**：从投标人信息库中选择一个投标人（MVP 仅支持独立投标），可通过搜索快速定位。如无投标人信息，提供"新增投标人"快捷入口（弹窗表单）
3. **选择样式模板**：4套内置样式网格（含预览缩略图），用户可上传自定义参考 DOCX
4. **引用已有项目**（可选）：列出用户的 Open Design 项目（调用 `GET /api/projects`），选择要引用的原型/架构图/PPT 项目。后续工作流中需要生成图片或原型可引导用户创建新的 OD 项目

提交后调用创建项目API（含关联投标人ID + 引用项目列表）+ 上传招标文件API → 跳转到 ProjectView 的标书工作区 Tab。

**NewProjectPanel 集成要点：**
- 在现有 6 个 Tab（prototype, live-artifact, deck, template, media, other）后新增"标书制作" Tab
- Tab 图标建议使用 `📋` 或自定义投标文档图标
- Tab 标题：`标书制作`（zh-CN）/ `Bid Document`（en）
- 选中"标书制作" Tab 时，渲染 `CreateProjectForm` 组件
- 创建的项目 `kind = 'bid'`，在项目列表中以投标项目样式显示

- [ ] 提交：`git commit -m "feat: 添加 foxpre 新建项目流程（4步：上传→关联投标人→样式→引用项目）"`

### 任务 7.3：投标作战室（v1.1 集成到 ProjectView 标书 Tab）

**涉及文件：**
- 修改：`apps/web/src/components/ProjectView.tsx`（项目类型为 `bid` 时显示"标书" Tab）
- 新建：`apps/web/src/components/foxpre/BidWarRoom.tsx`
- 新建：`apps/web/src/components/foxpre/KanbanBoard.tsx`
- 新建：`apps/web/src/components/foxpre/KanbanCard.tsx`
- 新建：`apps/web/src/components/foxpre/DocumentPreview.tsx`
- 新建：`apps/web/src/components/foxpre/AgentChatPanel.tsx`

**ProjectView 集成要点：**
- 当 `project.kind === 'bid'` 时，ProjectView 的 Tab 列表中新增"标书" Tab
- Tab 标题：`标书`（zh-CN）/ `Bid`（en）
- 选中"标书" Tab 时，渲染 `BidWarRoom` 三栏组件
- 保留原有的 Files、Preview、Chat 等标准 Tab

**三栏布局（按需求规格 8.1）：**
- **左栏——智能体看板**：5列拖拽看板（待启动/进行中/等待审核/需修改/已完成），使用 `@dnd-kit/core` 实现拖拽。卡片通过 SSE 流自动更新。每张卡片含：智能体图标、任务名称、状态指示、分支名、进度（小节数）、最近提交时间。操作按钮：查看diff、介入对话、暂停/恢复、强制回滚。
- **中栏——文档预览区**：将已生成的 Markdown 渲染为 HTML 预览，按章节展示。各章节标注归属于哪个智能体。提供下载中间产物/最终 DOCX 按钮。
- **右栏——对话面板**：按智能体分标签页。用户输入 → 调用介入对话API → 上下文注入 → 实时响应展示。复用现有的 Open Design Chat 组件。

- [ ] 提交：`git commit -m "feat: 添加投标作战室（看板+文档预览+智能体对话）"`

### 任务 7.4：样式设计器页

**涉及文件：**
- 新建：`apps/web/app/foxpre/styles/page.tsx`
- 新建：`apps/web/src/components/foxpre/StyleDesigner.tsx`
- 新建：`apps/web/src/components/foxpre/StyleTree.tsx`
- 新建：`apps/web/src/components/foxpre/StylePreview.tsx`

**布局（按需求规格 5.4.2）：**
- **左栏——样式树**：列出所有可编辑的样式级别（正文、标题1~3、项目符号列表、编号列表、表格、填空区样式）
- **右栏——实时预览**：渲染当前选中样式级别的预览效果
- **底部工具栏**：字体选择器、字号下拉、行距、段前段后距控制
- **操作按钮**：保存样式、导出 DOCX 参考文件、应用到当前项目

- [ ] 提交：`git commit -m "feat: 添加 foxpre 样式设计器页"`

### 任务 7.5：投标人信息库与门禁规则设置页（v1.1 重构）

**涉及文件：**
- 新建：`apps/web/app/foxpre/settings/page.tsx`
- 新建：`apps/web/src/components/foxpre/BidderConfigForm.tsx`
- 新建：`apps/web/src/components/foxpre/QualificationEditor.tsx`
- 新建：`apps/web/src/components/foxpre/HarnessRuleEditor.tsx`
- 新建：`apps/web/src/components/foxpre/ImageAnnotationCard.tsx`

**投标人信息库管理（替代原企业配置表单）：**
- 投标人列表：卡片网格展示，每张卡片含投标人名称、信用代码（脱敏）、默认标记、资质数量、案例数量
- 新增/编辑投标人：`BidderConfigForm` 表单组件
  - 基本信息区：投标主体名称、统一社会信用代码、注册地址、联系人、电话、邮箱
  - 法人信息区：法人姓名、法人身份证号（加密存储，UI 脱敏显示如 `110***********1234`）
  - 银行信息区：开户银行、银行账号（加密存储，UI 脱敏显示）
  - 默认投标人开关
- 资质证书编辑器：`QualificationEditor` 子组件
  - 资质列表（CMMI、ISO、ITSS、涉密等），每条含：资质名称、证书编号、发证机构、有效期至、扫描件上传
  - 有效期即将过期（30天内）显示黄色警告，已过期显示红色警告
- 业绩案例编辑器：列表形式，每条含项目名称、客户名称、合同金额、完成时间、项目简介、证明材料附件
- 导入/导出功能：JSON 格式批量导入导出

**门禁规则编辑器：**
- 12条内置通用门禁规则的启用/禁用开关列表
- 新增/删除自定义规则
- 每条规则：类别、名称、描述、严重度（致命/警告）、检查类型

**图片手动标注卡片（Level 1 降级 UI）：**
- `ImageAnnotationCard` 组件：当图片描述引擎降级到 Level 1 时使用
- 截图缩略图 + 功能描述输入框 + 所属章节下拉选择 + 核心模块标签输入
- 标注结果保存到 `project_references` 表的章节映射 JSON 中

- [ ] 提交：`git commit -m "feat: 添加投标人信息库与门禁规则设置页（含敏感字段脱敏+资质过期提醒）"`

---

## 阶段八：DOCX 组装与输出

### 任务 8.1：最终 DOCX 组装器

**涉及文件：**
- 新建：`apps/daemon/src/foxpre/docx-assembler.ts`

**核心函数：** `组装最终投标Docx(项目ID, 数据库) → 文件路径`

**组装管线（6步）：**
1. 从 `template/` 目录读取已锁定的 DOCX 模板文件
2. 从数据库查询所有 `状态 = '已通过'` 的文档片段
3. 加载用户选择的样式模板配置
4. 对每个片段，调用 `标记转Docx()` 将 Markdown 转为 DOCX 章节
5. 按 `目标章节` 字段将各章节插入模板对应位置，在 `{{image:...}}` 占位符处插入原型截图
6. 更新目录（TOC）、页眉（项目名称）、页脚（连续页码）
7. 保存到 `output/技术投标文件-终稿-v{N}.docx`
8. 更新 `foxpre_projects` 表的最终输出路径

**合并策略：** MVP 阶段按章节顺序追加到模板中。每个 Writer 的产出作为独立章节，模板作为主文档骨架。每个 MD→DOCX 片段自带样式参考文档中的标题样式。

- [ ] 运行：`pnpm --filter @open-design/daemon typecheck`
- [ ] 提交：`git commit -m "feat: 添加最终 DOCX 组装器"`

---

## 阶段九：集成测试与打磨

### 任务 9.1：集成测试

**涉及文件：**
- 新建：`apps/daemon/tests/foxpre/integration.test.ts`

**五个测试场景：**
1. **完整流程**：创建项目 → 上传招标 PDF → 验证分析器输出结构（含需求报告、格式规范、门禁清单三个字段）
2. **模板构建**：从分析器输出构建模板 → 验证 DOCX 文件创建和章节结构正确性
3. **任务状态机**：创建智能体任务 → 经过待启动→进行中→已完成→审核→已驳回→修改→通过完整生命周期
4. **门禁审核**：给门禁引擎注入已知失败项 → 验证审核报告生成正确
5. **样式CRUD**：创建/读取/更新/删除样式模板 → 验证持久化

- [ ] 运行：`pnpm --filter @open-design/daemon test tests/foxpre/`
- [ ] 提交：`git commit -m "test: 添加 foxpre 核心工作流集成测试"`

### 任务 9.2：foxpre 国际化词条

**涉及文件：** `apps/web/src/i18n/locales/` 下全部 18 个语言文件

**最低必要词条清单：**
```
foxpre.标题, foxpre.新建项目, foxpre.项目列表,
foxpre.投标作战室, foxpre.看板,
foxpre.待启动, foxpre.进行中, foxpre.等待审核, foxpre.需修改, foxpre.已完成,
foxpre.文档预览, foxpre.智能体对话, foxpre.查看变更,
foxpre.介入对话, foxpre.暂停, foxpre.恢复, foxpre.回滚,
foxpre.下载Docx, foxpre.样式设计器, foxpre.企业设置,
foxpre.项目类型.*（4个）, foxpre.项目状态.*（6个）, foxpre.智能体.*（9个）
```

- [ ] 先添加英文（en.ts）词条
- [ ] 添加中文（zh-CN.ts、zh-TW.ts）翻译
- [ ] 运行：`pnpm i18n:check`
- [ ] 提交：`git commit -m "feat: 添加 foxpre 国际化词条（en, zh-CN, zh-TW）"`

### 任务 9.3：最终验证

- [ ] 运行：`pnpm guard`（lint + 样式策略检查）
- [ ] 运行：`pnpm typecheck`（全部工作区类型检查）
- [ ] 运行：`pnpm --filter @open-design/daemon test`
- [ ] 运行：`pnpm --filter @open-design/web test`
- [ ] 手工冒烟测试：创建项目、验证UI加载、验证SSE连接
- [ ] 提交：`git commit -m "chore: foxpre MVP 最终验证修正"`

---

## 文件地图

### 新建文件（约 52 个）

```
packages/contracts/src/foxpre/
├── constants.ts     # 智能体代号、状态常量、类型字面量
├── api.ts           # 全部 API DTO 和契约类型（含投标人、项目引用、图片描述类型）
└── index.ts         # 统一导出

apps/daemon/src/foxpre/
├── db.ts                # 11张表 SQLite schema + 迁移 + 种子数据（含投标人三表+项目引用表）
├── doc-parser.ts        # PDF/DOCX 文档解析器
├── template-builder.ts  # 格式规范书 → 空白 DOCX 模板
├── md-to-docx.ts        # Markdown → DOCX 转换引擎
├── image-describer.ts   # 图片描述引擎（三级降级：Vision→HTML分析→手动标注）【v1.1 新增】
├── harness-engine.ts    # 双层门禁审核逻辑
├── solo-coder.ts        # 智能体调度引擎 / 任务状态机
├── docx-assembler.ts    # 最终 DOCX 章节合并组装
├── bid-routes.ts        # 项目 CRUD、上传、工作流控制 API
├── bidder-routes.ts     # 投标人信息库 CRUD + 资质证书 + 业绩案例 API【v1.1 新增】
├── style-routes.ts      # 样式模板 CRUD API
├── field-crypto.ts      # 敏感字段 AES-256-GCM 加密/解密工具【v1.1 新增】
└── kanban-sse.ts        # 看板实时推送 SSE 流

apps/daemon/tests/foxpre/
├── doc-parser.test.ts   # 文档解析器单元测试
├── image-describer.test.ts # 图片描述引擎单元测试【v1.1 新增】
└── integration.test.ts  # 核心工作流端到端测试

apps/web/app/foxpre/
├── layout.tsx           # foxpre 导航布局
├── page.tsx             # 项目列表页
├── new/page.tsx         # 新建项目页（简化流程：上传→关联投标人→引用项目）
├── styles/page.tsx      # 样式设计器页
├── settings/page.tsx    # 投标人信息库 + 门禁规则设置页【v1.1 重命名】
└── [id]/page.tsx        # 投标作战室页

apps/web/src/components/foxpre/
├── ProjectCard.tsx       # 项目列表卡片
├── CreateProjectForm.tsx # 新建项目表单（含投标人选择+项目引用）【v1.1 更新】
├── FileUploadZone.tsx    # 拖拽文件上传区
├── StyleSelector.tsx     # 样式模板选择器
├── BidderSelector.tsx    # 投标人选择器组件【v1.1 新增】
├── ProjectReferencePicker.tsx # 引用已有项目选择器【v1.1 新增】
├── ImageAnnotationCard.tsx   # 图片手动标注卡片（Level 1 降级）【v1.1 新增】
├── BidWarRoom.tsx        # 三栏作战室布局
├── KanbanBoard.tsx       # 5列看板（dnd-kit拖拽）
├── KanbanCard.tsx        # 智能体任务卡片
├── DocumentPreview.tsx   # DOCX/Markdown 预览渲染
├── AgentChatPanel.tsx    # 按智能体分标签的对话面板
├── StyleDesigner.tsx     # 样式设计器主组件
├── StyleTree.tsx         # 样式类别树
├── StylePreview.tsx      # 实时样式预览
├── BidderConfigForm.tsx  # 投标人信息编辑表单【v1.1 新增】
├── QualificationEditor.tsx # 资质证书编辑器【v1.1 新增】
└── HarnessRuleEditor.tsx # 门禁规则列表编辑器

skills/
├── foxpre-analyzer/SKILL.md
├── foxpre-researcher/SKILL.md
├── foxpre-prototyper/SKILL.md
├── foxpre-architect/SKILL.md
├── foxpre-tech-writer/SKILL.md
├── foxpre-business-writer/SKILL.md
├── foxpre-pm-writer/SKILL.md
├── foxpre-reviewer/SKILL.md
└── foxpre-solo-coder/SKILL.md
```

### 修改现有文件（约 6 个）

```
apps/daemon/src/server.ts        # 注册 foxpre 路由（含 bidder-routes），调用 initfoxpreDb()
apps/web/src/components/NewProjectPanel.tsx # 新增"标书制作" Tab（仅注册 CreateTab + 一行条件渲染委托给 CreateProjectForm）
apps/web/src/components/ProjectView.tsx     # 项目类型为 bid 时显示"标书" Tab
packages/contracts/src/api/projects.ts      # ProjectKind 追加 'bid'
packages/contracts/src/plugins/scenario-defaults.ts  # DEFAULT_SCENARIO_PLUGIN_BY_KIND 追加 'bid'
packages/contracts/tests/scenario-defaults.test.ts   # 同步追加 kind-to-plugin 映射测试用例
apps/web/src/i18n/locales/*.ts   # 新增 foxpre.* 词条
```

---

## 需求规格覆盖检查

| 需求规格章节 | 对应实现任务 |
|---|---|
| 第3章 智能体矩阵（9个智能体） | 阶段四（9个SKILL.md）+ 阶段五（SOLO Coder调度引擎） |
| 第4章 核心工作流（8步） | 阶段五（solo-coder.ts 工作流编排）+ 阶段六（bid-routes.ts） |
| 第4.2节 深度协作模式 | 阶段七.3（AgentChatPanel）+ solo-coder.ts 处理用户介入() |
| 第5.1节 文档解析 | 阶段二.1（doc-parser.ts） |
| 第5.2节 模板构建 | 阶段二.2（template-builder.ts） |
| 第5.3节 用户确认（方案A+C） | 阶段七.2（CreateProjectForm 项目创建流程）+ solo-coder.ts 置信度检查 |
| 第5.4节 样式库 | 阶段七.4（StyleDesigner）+ 阶段六.2（style-routes.ts） |
| 第5.5节 MD→DOCX引擎 | 阶段二.3（md-to-docx.ts）+ 阶段八.1（docx-assembler.ts） |
| 第6.1节 双层Harness | 阶段三.1（harness-engine.ts） |
| 第6.2节 审核报告输出 | 阶段三.1（审核报告类型 + harness-engine.ts） |
| 第7章 长时运行Harness | 阶段五（solo-coder.ts 状态机 + Git工作流 + 检查点/恢复） |
| 第8章 任务看板 | 阶段七.3（BidWarRoom、KanbanBoard）+ 阶段六.3（kanban-sse.ts） |
| 第9章 Open Design能力复用 | 全部阶段（复用守护进程、前端、Chat、SSE、Skills、MCP、i18n） |
| 第10章 Skills/MCP | 阶段四（Skills定义）+ 现有 MCP 连接基础设施 |
| 第11章 数据模型 | 阶段一.1（11张DB表）+ 阶段零.2（契约类型） |
| 第12章 非功能性需求 | 阶段九（验证、测试、国际化） |
| 第13章 MVP范围 | 全部阶段均在 MVP 边界内 |
| 附录A 投标人信息库 | 阶段一.1（bidders/bidder_qualifications/bidder_projects 三表）+ 阶段六.2（bidder-routes.ts + field-crypto.ts）+ 阶段七.5（BidderConfigForm + QualificationEditor） |
| 附录B 引用已有项目 | 阶段一.1（project_references 表）+ 阶段二.5（image-describer.ts）+ 阶段七.2（ProjectReferencePicker）+ 阶段七.5（ImageAnnotationCard） |
| 附录C foxpre-OD集成 | 阶段七.2（NewProjectPanel 标书制作 Tab）+ 阶段七.3（ProjectView 标书 Tab）+ 阶段零.2（ProjectKind='bid'） |

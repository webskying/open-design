# foxpre 需求规格说明书

**版本**：v1.1-MVP  
**日期**：2026-06-10  
**更新日志**：基于架构讨论更新投标人信息库、引用已有项目、Vision 降级策略、数据安全等需求  
**产品**：foxpre（基于 Open Design 的投标文件智能编制系统）  
**目标用户**：信息化类项目投标团队（软件开发、系统集成、运维服务）  

---

## 1. 项目概述

### 1.1 产品定位
foxpre 是基于 Open Design 代码库 fork 的独立产品分支，专门面向**信息化类投标项目**的技术标书与商务标书编制。系统模拟真实投标团队的分工协作模式，由主智能体（SOLO Coder）统一调度多个专业子智能体，分别负责需求分析、资料收集、原型开发、大纲设计、内容撰写、商务编制、质量审核等任务，最终输出严格符合招标文件格式要求的投标文件（Word 文档）。

### 1.2 核心目标
- **降低投标编制成本**：将原本需要数人数日完成的投标技术标书压缩到数小时内生成高质量初稿。
- **消除废标风险**：通过 Harness 门禁体系自动识别招标文件中的废标点、废标项，确保输出文件 100% 响应格式要求。
- **复用设计能力**：充分继承 Open Design 的原型设计、架构图生成、Deck 制作等可视化能力，自动生成投标所需的原型截图、网络拓扑图、甘特图等。
- **深度人机协作**：用户不仅可审批阶段成果，还可随时介入与任意 Agent 实时对话，精准调整输出内容。

### 1.3 适用范围
- 信息化建设项目（硬件集成、网络部署、机房建设）
- 软件开发类项目（定制开发、SaaS 平台、移动应用）
- 系统集成类项目（多系统对接、数据中台、API 集成）
- 软件系统运维投标项目（IT 运维、云运维、安全运维）

---

## 2. 系统架构总览

### 2.1 部署形态
foxpre 保留 Open Design 的**本地优先（Local-First）**架构：

```
┌─────────────────────────────────────────────────────────────┐
│                      Open Design Web UI                          │
│              (Next.js 16 App Router + React 18)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 投标项目列表 │  │ 投标作战室  │  │ Agent 实时对话面板   │ │
│  │  (Projects)  │  │  (Kanban)   │  │   (Chat Panel)      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│                   foxpre Daemon (Node.js)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  REST API   │  │  SSE 流     │  │  Agent 调度引擎      │ │
│  │  (/api/*)   │  │  (/events)  │  │   (SOLO Coder)      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ DOCX 生成   │  │ PDF/DOCX    │  │  Git 工作区管理      │ │
│  │ (docx.js)   │  │ 解析引擎    │  │  (simple-git)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ SQLite 状态 │  │ MCP 连接    │  │ Skills 注册表        │ │
│  │   数据库    │  │   管理器    │  │   (SKILL.md)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ spawn
┌──────────────────────────▼──────────────────────────────────┐
│              Agent CLI 运行时（复用 Open Design）            │
│         Claude Code / Codex / Cursor / API 适配层            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术决策（胶水编程，最大化复用）

| 能力 | 技术方案 | 复用来源 / 理由 |
|---|---|---|
| Web 前端 | Next.js 16 + React 18 | **直接复用** `apps/web`，新增 foxpre 专属页面和组件 |
| HTTP API / SSE | Express + 手动 event-stream | **直接复用** `apps/daemon/src/server.ts` 路由体系 |
| Agent 运行时 | RuntimeAgentDef + Chat Run | **直接复用** `apps/daemon/src/runs.ts` 和 `runtimes/defs/` |
| 数据持久化 | SQLite (`better-sqlite3`) | **直接复用** `apps/daemon/src/db.ts` 数据库连接和迁移机制 |
| 项目/文件管理 | `.foxpre/projects/<id>/` | **改造复用** Open Design 的 `.od/` 项目目录结构 |
| DOCX 生成 | `docx` (npm) + Pandoc | **胶水集成** Pandoc 处理 MD→DOCX 主体结构，docx.js 后处理样式精修 |
| PDF 解析 | `pdf-parse` + OCR 兜底 | **胶水集成** 文本层提取为主，复杂扫描件 fallback OCR |
| DOCX 读取 | `mammoth.js` | **胶水集成** 将 DOCX 输入转为 HTML/Markdown 供 Analyzer 理解 |
| Git 操作 | `simple-git` (npm) | **胶水集成** Node.js 封装层，调用本地 git 命令 |
| Markdown→DOCX | Pandoc (系统依赖) | **胶水集成** 成熟文档转换引擎，处理 80% 标准转换 |
| 工程绘图 | next-dwr-io MCP | **MCP 插件** 自然语言生成 draw.io 工程图（架构图/网络拓扑）|
| 原型/图表生成 | Open Design Design Templates | **直接复用** `design-templates/` 和 `apps/daemon/src/live-artifacts/` |
| Skills 系统 | SKILL.md + 扫描注册 | **直接复用** `skills/` 目录和 `/api/skills` 路由 |
| MCP 连接 | MCP Client SDK | **直接复用** Open Design 已有的 MCP 连接基础设施 |
| 国际化 | `apps/web/src/i18n/` | **直接复用** 现有 18 语言体系，新增投标相关词条 |

**不造的轮子**：不自研 workflow 引擎（用现有 Chat Run + 状态表）、不自研 DOCX 编辑器（用 docx.js）、不自研 PDF 渲染器（用现有解析库）、不自研消息队列（用 SQLite + SSE）。

---

## 3. 智能体矩阵与职责定义

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLO Coder（主控智能体）                      │
│  角色: 投标项目经理                                               │
│  职责: 需求分析 → 任务分解 → 智能体调度 → 成果整合 → 质量审核     │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  需求分析     │    │  资料搜索     │    │  原型开发     │
│  智能体       │    │  智能体       │    │  智能体       │
│  (Analyzer)   │    │  (Researcher) │    │  (Prototyper) │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌───────────────┐
                    │  大纲设计     │
                    │  智能体       │
                    │  (Architect)  │
                    └───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  技术方案     │    │  项目管理     │    │  商务方案     │
│  智能体       │    │  方案智能体   │    │  智能体       │
│  (TechWriter) │    │  (PMWriter)   │    │(BusinessWriter)│
└───────────────┘    └───────────────┘    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │  质量审核     │
                    │  智能体       │
                    │  (Reviewer)   │
                    └───────────────┘
```

### 3.2 智能体职责定义

| 智能体 | 代号 | 核心职责 | 输出物 | 依赖关系 |
|---|---|---|---|---|
| **SOLO Coder** | Orchestrator | 投标项目经理：解析用户需求、分解任务、调度子智能体、整合成果、触发质量审核、协调用户介入 | 《任务计划书》《调度指令》 | 无（根节点） |
| **需求分析智能体** | Analyzer | 解析招标文件（PDF/DOCX），提取技术要求、评分要点、项目范围、**废标点/废标项**、投标文件格式规范 | 《需求分析报告》《格式规范书》《废标点清单》 | SOLO Coder 启动 |
| **资料搜索智能体** | Researcher | 搜集行业案例、技术资料、政策文件、竞品信息、最佳实践 | 《参考资料包》 | Analyzer 完成后并行启动 |
| **原型开发智能体** | Prototyper | 开发系统原型，生成关键界面截图和交互演示；调用 Open Design 设计模板生成架构图、网络拓扑图、甘特图 | 《原型截图》《可交互原型链接》《架构图/甘特图 PNG》 | Analyzer 完成后并行启动 |
| **大纲设计智能体** | Architect | 制定技术方案大纲结构，严格对标评分要点设计章节权重和响应策略 | 《技术大纲》（含评分对标映射表） | Analyzer + Researcher/Prototyper 完成后 |
| **商务方案智能体** | BusinessWriter | 编制商务标书：投标函、公司资质、业绩案例、偏离表、报价说明等固定格式内容 | 《商务标书》（DOCX 章节） | Architect 完成后并行启动 |
| **技术方案智能体** | TechWriter | 撰写技术方案各章节正文（系统架构、功能设计、安全方案、技术路线等） | 《技术方案章节》（Markdown/DOCX） | Architect 完成后并行启动 |
| **项目管理智能体** | PMWriter | 撰写项目实施计划、团队配置、进度管理、质量管理、风险管理等内容 | 《项目管理章节》 | Architect 完成后并行启动 |
| **质量审核智能体** | Reviewer | 全文审核：废标点响应检查、评分覆盖度评估、一致性检查、格式合规性检查、用户自定义审查要点 | 《审核报告》《修改意见清单》 | 所有撰写 Agent 完成后 |

### 3.3 调度依赖关系

```
Analyzer（需求解析 + 格式提取）
    │
    ├──→ Researcher（资料搜集）─────┐
    └──→ Prototyper（原型/图表）────┤
                                    ▼
                            Architect（大纲设计）
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    BusinessWriter           TechWriter               PMWriter
    （商务标书）             （技术方案）              （项目管理）
            └───────────────────────┬───────────────────────┘
                                    ▼
                            Reviewer（质量审核）
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
                审核通过                          审核不通过
                    │                               │
                    ▼                               ▼
            组装最终 DOCX                   SOLO Coder 派发修改任务
                                                    │
                                                    └──→ 对应 Agent 迭代修改
```

**并行策略**：
- Researcher 与 Prototyper 在 Analyzer 完成后可**并行**运行。
- BusinessWriter、TechWriter、PMWriter 在 Architect 完成后可**并行**运行。
- BusinessWriter 独立产出商务标书，与技术标无内容依赖，仅共享 Analyzer 输出的格式规范。

---

## 4. 核心业务流程

### 4.1 主流程：从招标文件到投标文件

**Step 1：项目创建与招标文件上传**
- 用户在 foxpre Web UI 创建新项目，上传招标文件（PDF 或 DOCX）。
- 系统校验文件格式和大小（上限 50MB）。
- 可选：用户上传企业资质包（ZIP）或关联已有知识库（飞书/Obsidian）。

**Step 2：Analyzer 解析（自动）**
- SOLO Coder 启动 Analyzer Agent。
- Analyzer 解析招标文件，产出三份关键文档：
  1. **《需求分析报告》**：项目背景、技术需求、功能清单、性能指标、安全要求。
  2. **《格式规范书》**：投标文件应有的章节结构、标题层级、表格样式、下划线填空区位置、页眉页脚要求。
  3. **《废标点清单》**：所有不满足即导致废标的条款（如资质门槛、签字盖章要求、密封要求、工期上限等）。

**Step 3：模板重建与确认（方案 A + 方案 C）**
- **默认路径（方案 A）**：系统根据《格式规范书》自动生成空白 DOCX 模板，包含正确的标题样式、预留填空区、表格框架。若置信度高，直接进入 Step 4。
- **复杂格式路径（方案 C）**：若 Analyzer 检测到复杂嵌套表格、多栏排版、特殊分页，或置信度低于阈值，系统暂停并提示用户进入**模板确认界面**：
  - 左侧：自动重建的 DOCX 模板预览
  - 右侧：原始招标文件对应章节对照
  - 用户可调整标题层级、增删填空区、修改表格行列、上传自定义格式页
  - 用户点击"确认模板"后锁定格式，进入 Step 4

**Step 4：并行资料收集与原型开发**
- SOLO Coder 同时启动 Researcher 和 Prototyper。
- Researcher 搜集行业资料并存入项目 Git 仓库的 `research/` 目录。
- Prototyper 调用 Open Design 的 design-templates 生成原型和图表，截图存入 `prototypes/` 目录。

**Step 5：大纲设计**
- Architect 综合 Analyzer 的评分要点、Researcher 的参考资料、Prototyper 的可视化素材，设计《技术大纲》。
- 大纲中每个章节都标注对应的**评分项编号**和**建议页数/字数**。

**Step 6：并行内容撰写**
- SOLO Coder 同时启动 BusinessWriter、TechWriter、PMWriter。
- 三个 Writer 各自在 Git 工作分支上工作，按章节撰写内容并提交 Git。
- 每个 Writer 完成原子章节后执行 `git commit`，提交信息格式：`[<代号>] <动作>: <简述>`（例：`[TechWriter] add: 3.2 系统架构设计`）。

**Step 7：质量审核**
- 所有 Writer 完成后，SOLO Coder 启动 Reviewer。
- Reviewer 执行**四级门禁审核**（详见第 6 章），产出《审核报告》。
- **审核通过**：进入 Step 8。
- **审核不通过**：SOLO Coder 根据 Reviewer 的《修改意见清单》，将任务重新派发给对应 Writer，Writer 修改后重新提交，Reviewer 再审。可循环多轮。

**Step 8：最终组装与输出**
- SOLO Coder 将 BusinessWriter 的商务标、TechWriter 的技术方案、PMWriter 的项目管理章节按招标文件要求顺序合并。
- 插入 Prototyper 生成的图片到对应章节。
- 更新目录（Table of Contents）、页眉页脚、连续页码。
- 输出最终 `技术投标文件-终稿.docx` 供用户下载。

### 4.2 深度协作模式（用户随时介入）

用户在任意阶段可通过**投标作战室（Kanban）**或**侧边对话栏**与具体 Agent 直接对话：

- **场景 A**：用户在 TechWriter 撰写过程中发出指令："第三章的系统架构请改成微服务方案，强调 Spring Cloud Gateway + Nacos"。
  - SOLO Coder 捕获该指令，暂停 TechWriter 当前任务队列。
  - 将用户指令作为高优先级上下文注入 TechWriter。
  - TechWriter 响应修改，提交新 commit。
  - SOLO Coder 判断该修改是否影响其他章节（如 PMWriter 的实施计划可能需要同步调整），必要时触发关联 Agent 更新。

- **场景 B**：用户看到 Researcher 搜集的资料后补充："请重点参考我们公司 2024 年给某市政府做的智慧交通项目案例"。
  - SOLO Coder 将新知识注入 Researcher 和 TechWriter 的上下文。
  - 已完成的章节不受影响，未完成的章节自动采用新资料。

- **场景 C**：用户上传新的资质证书扫描件。
  - SOLO Coder 通知 BusinessWriter 更新资质索引表。
  - BusinessWriter 修改后提交，Reviewer 再次检查该章节。

---

## 5. 输入处理与模板重建

### 5.1 招标文件解析引擎

**输入类型**：PDF（电子文本型 / 扫描图像型）、DOCX

**解析流水线**：

```
招标文件上传
    │
    ├──→ DOCX ──→ mammoth.js 提取 ──→ 结构化 HTML/Markdown
    │
    └──→ PDF ───→ pdf-parse 尝试文本提取
                    │
                    ├──→ 文本质量高 ──→ 结构化文本
                    └──→ 文本质量低 ──→ OCR（Tesseract）──→ 结构化文本
                                │
                                ▼
                        Analyzer Agent（LLM）
                                │
                    ├────→ 《需求分析报告》
                    ├────→ 《格式规范书》
                    └────→ 《废标点清单》
```

**Analyzer 的提取策略**：
- Analyzer 的 system prompt 经过专门设计，要求模型同时输出**内容需求**和**格式规范**两部分。
- 对格式规范的提取采用"结构先验 + 文本匹配"：先告知模型常见投标文件格式模板（如"一、投标函 二、法定代表人授权书 三、技术方案..."），再让模型匹配实际招标文件中的对应描述。
- 废标点提取采用"关键词触发 + 上下文确认"：模型扫描"废标"、"无效投标"、"否决投标"、"不予接受"等关键词，提取完整条款原文。

### 5.2 模板重建引擎

基于《格式规范书》自动生成空白 DOCX 模板：

- **章节骨架**：按章节序列创建 Word 标题样式（Heading 1 / Heading 2 / Heading 3）。
- **填空区标记**：在需要填写具体内容的位置插入**内容控件（Content Controls）**或**占位符标记**（如 `{{BusinessWriter:投标函.报价}}`），方便后续 Agent 精准填充。
- **表格框架**：预创建招标文件中明确要求的表格（如偏离表、资质索引表、人员配置表），保留表头，留空数据行。
- **样式继承**：若 Analyzer 能从招标文件中提取明确的字体、字号、页边距要求，则应用到模板；若无法提取，使用预设的投标标书标准样式。

### 5.3 用户确认流程（方案 C 触发条件）

**自动跳过确认**（置信度高时）：
- 章节结构清晰（一级标题数量 ≤ 15，层级 ≤ 3）
- 无复杂嵌套表格（表格嵌套层数 ≤ 1）
- 无多栏排版、无特殊分页要求
- Analyzer 对自身提取结果置信度评分 ≥ 0.85

**触发用户确认**（任一满足即触发）：
- 存在复杂嵌套表格、多栏排版、特殊分页、横向页面
- Analyzer 对格式规范某部分的置信度 < 0.85
- 用户上传时主动勾选"我需要确认模板格式"
- 招标文件中包含大量"请按以下格式填写"的表格，且表格结构复杂

**用户确认 UI**：
- 分屏预览：左侧重建模板，右侧原始文件对照（同步滚动）。
- 编辑工具：增删章节、调整层级、插入/删除表格行列、标记填空区、上传自定义页。
- 锁定机制：用户点击"确认并锁定"后，模板进入只读状态，所有 Agent 只能填充内容，无权修改格式骨架。

---

## 5.4 样式库与排版设计器

### 5.4.1 样式库（Style Library）

**核心思想**：把"投标文件样式"做成可复用、可分享、可选择的模板库，类似于 Open Design 的 HTML design-templates，但底层是 DOCX 的样式定义。

**样式模板内容**：
每个样式模板是一个 `.docx` 参考文件（Reference Document），内部预定义好以下样式：

| 样式类型 | 具体定义 | 示例 |
|---|---|---|
| **正文样式** | 中文字体、英文字体、字号、行距、段前段后距 | 正文：宋体小四，1.5倍行距 |
| **标题层级** | Heading 1~9 的字体、字号、编号格式、缩进 | 一级标题：黑体三号，编号"一、"；二级标题：楷体四号，编号"（一）" |
| **列表样式** | 多级列表的编号格式（数字、字母、中文数字） | 第一级：1. 2. 3.；第二级：（1）（2）（3）；第三级：① ② ③ |
| **表格样式** | 表头背景色、边框线型、字体、对齐方式 | 表头：黑体五号，浅灰底，全边框 |
| **填空区样式** | 下划线填空区的线型、长度、字体 | 下划线：单实线，长度随内容自适应 |
| **页面设置** | 纸张大小、页边距、页眉页脚、页码格式 | A4，上下2.54cm，左右3.17cm，页码底部居中 |

**样式库的工作方式**：
- **内置样式**：foxpre 内置 5~10 套常见投标样式（如"政府信息化投标标准样式"、"国企招投标规范样式"、"minimalist 简洁样式"）。
- **用户自定义样式**：用户上传一个已排版好的 DOCX 作为"参考模板"，foxpre 自动提取其中的样式定义，保存到用户的样式库中。
- **样式选择界面**：新建项目时，用户在 UI 中预览并选择样式模板，类似于 Open Design 选择 Design Template。

### 5.4.2 用户样式设计器

在 foxpre Web UI 中提供**可视化样式设计器**：

```
┌─────────────────────────────────────────────────────────┐
│  样式名称：我的企业投标样式                                │
├─────────────────────────────────────────────────────────┤
│  左侧：样式树                    │  右侧：实时预览        │
│  ├── 正文                         │  ┌──────────────┐    │
│  ├── 标题 1（一级标题）            │  │ 一、项目概述  │    │
│  ├── 标题 2（二级标题）            │  │              │    │
│  ├── 标题 3（三级标题）            │  │ 正文内容...  │    │
│  ├── 项目符号列表                  │  │              │    │
│  ├── 编号列表                      │  │ 1. 需求分析   │    │
│  ├── 表格                          │  │ 2. 技术方案   │    │
│  └── 填空区样式                    │  │ ____填空____ │    │
│                                   │  └──────────────┘    │
├─────────────────────────────────────────────────────────┤
│  [字体：宋体] [字号：小四] [行距：1.5] [段前：0pt] [段后：6pt] │
│  [保存样式] [导出样式] [应用到当前项目]                      │
└─────────────────────────────────────────────────────────┘
```

用户可调整任何样式属性，右侧实时渲染预览。保存后进入样式库，供后续项目复用。

---

## 5.5 Markdown → DOCX 转换引擎

### 5.5.1 为什么不用 Pandoc 直出？

Agent 最擅长输出 **Markdown**，但 Pandoc 直出 DOCX 在样式保真度上有明显天花板，特别是：
- 中文多级列表编号（一、/（一）/ 1. / （1））支持不够好
- 难以精确控制"下划线填空区"等投标专用格式
- 表格样式映射比较粗糙

### 5.5.2 推荐方案：Pandoc + 参考模板 + docx.js 后处理

不是抛弃 Pandoc，而是**让 Pandoc 做它擅长的事，docx.js 做 Pandoc 不擅长的事**。

**完整流水线**：

```
Agent 输出 Markdown
    │
    ▼
┌─────────────────────────────────────────┐
│  Pandoc 转换（带参考模板）               │
│  pandoc input.md                          │
│    --reference-doc=用户样式模板.docx      │
│    -o output-raw.docx                     │
└─────────────────────────────────────────┘
    │
    ├──→ Pandoc 擅长处理的部分（自动完成）：
    │     • 段落和标题层级结构
    │     • 基础表格
    │     • 粗体/斜体/代码块
    │     • 图片嵌入
    │
    └──→ Pandoc 不擅长处理的部分（需要后处理）：
    │       • 中文多级编号格式（一、/（一）/ 1.）
    │       • 下划线填空区样式
    │       • 复杂表格样式（合并单元格、特定边框）
    │       • 页眉页脚中的动态内容（如项目名称、页码）
    │       • 目录（TOC）的精确控制
    │
    ▼
┌─────────────────────────────────────────┐
│  docx.js 后处理引擎                      │
│  （读取 output-raw.docx，修正样式）       │
└─────────────────────────────────────────┘
    │
    ▼
output-final.docx
```

**后处理引擎的具体职责**：

| 后处理项 | 技术实现 | 说明 |
|---|---|---|
| **中文多级列表编号** | docx.js 遍历段落，根据 heading level 重新应用编号样式 | 一级="一、"，二级="（一）"，三级="1."，四级="（1）" |
| **下划线填空区** | 识别 Markdown 中的 `{{填空}}` 或 `____` 占位符，替换为带下划线的 Word Content Control | 投标专用格式，Pandoc 无法原生支持 |
| **表格样式精修** | 遍历所有表格，重新应用表头样式、边框线型、单元格对齐 | Pandoc 只生成基础表格 |
| **页眉页脚注入** | 在页眉插入项目名称和招标编号，页脚插入页码 | 从项目元数据中读取 |
| **目录（TOC）重建** | 删除 Pandoc 生成的目录，用 docx.js 重新插入符合样式模板的 TOC 域 | 确保目录样式与正文一致 |

**为什么不完全自研 MD→DOCX？**

| 方案 | 开发成本 | 维护成本 | 样式控制 | 结论 |
|---|---|---|---|---|
| **Pandoc + 后处理（推荐）** | 低 | 中 | 高 | Pandoc 处理 80% 标准转换，我们只写 20% 后处理 |
| **完全自研（docx.js）** | 高 | 高 | 极高 | 需要重写 Pandoc 十年的积累（脚注、引用、LaTeX 数学式等）|
| **HTML 中间层（mammoth）** | 中 | 中 | 中 | 多一层转换，多一层失真 |

**Agent 写 Markdown 是最优解**——Markdown 是 LLM 的母语，Agent 在 Markdown 中的输出质量远高于直接写 DOCX XML 或操作 Word API。

---

## 6. 质量审核 Harness（Reviewer）

Reviewer 不是"通用校对员"，而是基于招标文件提取的**强制性门禁（Gating Criteria）**进行审核。

### 6.1 双层 Harness 门禁体系

Reviewer 的审核基于**双层 Harness**：
- **通用 Harness（Universal Harness）**：适用于所有投标项目的 baseline 检查清单，与用户企业信息和通用投标规范绑定。
- **特定 Harness（Tender-Specific Harness）**：从当前上传的招标文件中动态提取的针对性检查项。

两层 Harness 叠加执行，Reviewer 必须同时通过两层审核才能放行。

---

#### 通用 Harness（Universal Harness）

**定位**：无论投什么标、什么行业，都必须满足的**基础合规检查**。类似于企业的投标 SOP。

**检查项来源**：
- **系统预设**：foxpre 内置一套标准通用检查清单（见下表）。
- **用户企业配置**：用户在"企业设置"中录入本公司信息后，系统自动关联相关检查项。
- **用户自定义扩展**：用户可新增/修改/禁用通用检查项，保存为企业的"通用 Harness 模板"。

**内置通用检查项示例**：

| 检查类别 | 检查项 | 严重程度 | 说明 |
|---|---|---|---|
| **企业信息** | 投标人名称与营业执照完全一致 | Fatal | 名称错字/漏字 = 废标风险 |
| **企业信息** | 统一社会信用代码已填写 | Fatal | 漏填 = 废标 |
| **联系方式** | 联系人姓名、电话、邮箱完整 | Fatal | 招标方无法联系 = 废标风险 |
| **联系方式** | 联系地址与注册地址逻辑一致 | Warning | 异常需人工确认 |
| **资质文件** | 营业执照在有效期内 | Fatal | 过期 = 废标 |
| **资质文件** | 法定代表人身份证明已附 | Fatal | 漏附 = 废标 |
| **签章格式** | 投标函有法定代表人签字或盖章 | Fatal | 未签章 = 废标 |
| **签章格式** | 授权委托书（如适用）格式正确 | Fatal | 授权链断裂 = 废标 |
| **保证金** | 投标保证金金额与要求一致（如适用） | Fatal | 金额错误 = 废标 |
| **保证金** | 保证金缴纳方式符合要求 | Warning | 如要求保函却电汇 = 扣分/废标 |
| **格式基础** | 投标文件有连续页码 | Warning | 缺页/跳页 = 评审扣分 |
| **格式基础** | 目录与实际章节标题一致 | Warning | 目录错误 =  professionalism 问题 |

**配置方式**：
- 用户首次使用 foxpre 时，在"企业设置"中录入：公司全称、统一社会信用代码、注册地址、联系人、电话、邮箱、资质列表（CMMI/ISO/ITSS 等）。
- 通用 Harness 自动关联这些信息，生成动态检查规则（如"检查投标函中的公司名称是否等于 {{user.company_name}}"）。

---

#### 特定 Harness（Tender-Specific Harness）

**定位**：针对**当前招标文件**的定制化检查，由 Analyzer 动态提取。

**四级特定检查**：

**特定一级：废标点（Pass/Fail，一票否决）**
- **来源**：Analyzer 从当前招标文件中提取的"不满足则废标"条款。
- **示例**：
  - "投标人须具有 CMMI5 级认证，否则投标无效"
  - "投标函未按本招标文件第六章格式填写者，视为无效投标"
  - "工期超过 180 个日历天，按废标处理"
  - "本项目不接受联合体投标"
- **Reviewer 行为**：逐项检查标书是否明确响应了这些条款。
- **结果**：任何一项未通过 → **立即打回**，SOLO Coder 将补全任务派发给对应 Agent，并标记为最高优先级（P0）。

**特定二级：评分响应度（量化评分）**
- **来源**：当前招标文件中的评分标准（如技术方案 30 分、项目管理 20 分、演示 10 分等）。
- **Reviewer 行为**：
  - 对照评分细则，评估当前标书各章节对评分点的覆盖完整度。
  - 对未覆盖或覆盖薄弱的评分点给出具体补强建议。
  - 输出覆盖度评分（百分制）。
- **结果**：覆盖度低于用户设定阈值（默认 80%）→ 打回补强；高于阈值 → 通过。

**特定三级：招标文件强制要求**
- **来源**：招标文件中明确要求的、非废标但影响得分的条款。
- **示例**：
  - "须提供近三年内至少 3 个同类项目业绩证明"
  - "技术方案必须包含系统安全等级保护设计方案"
  - "项目实施团队须配备至少 1 名高级项目经理"
- **Reviewer 行为**：检查这些强制要求是否在标书对应章节中得到体现。
- **结果**：未满足项打回对应 Agent 补充。

**特定四级：用户自定义审查要点**
- **来源**：用户在项目启动前或协作过程中为**当前项目**配置的额外审查规则。
- **示例**：
  - "必须提到我司自研的‘智慧城市中枢平台’"
  - "技术架构章节必须引用 2024 年某市智慧交通项目作为案例"
  - "团队配置中必须包含 2 名 PMP 认证人员"
- **Reviewer 行为**：检查自定义要点是否在标书中得到体现。
- **结果**：未通过项打回对应 Agent 补充。

---

#### 格式与一致性检查（横跨两层）

无论通用还是特定 Harness，Reviewer 都执行以下基础质量检查：
- **术语一致性**：前文叫"微服务架构"，后文不能叫"分布式单体"；前文提到"Spring Boot"，后文不能写成"Springboot"。
- **完整性检查**：所有占位符是否已替换、表格是否填满、目录是否与实际章节匹配、页码是否连续。
- **低级错误**：空段落、重复标题、错别字（基础检查，不追求 100% 无误，但拦截明显错误）。

### 6.2 Reviewer 输出结构

Reviewer 输出结构化的 JSON 审核报告，供 SOLO Coder 自动解析并执行后续动作：

```json
{
  "verdict": "rejected",
  "universal_harness": {
    "passed": false,
    "fatal_count": 1,
    "warning_count": 2,
    "failures": [
      {
        "category": "企业信息",
        "item": "投标人名称与营业执照完全一致",
        "status": "mismatch",
        "severity": "fatal",
        "detail": "投标函中公司名称为'XX科技有限公司'，但企业设置中名称为'XX科技股份有限公司'，漏写'股份'二字",
        "assigned_to": "BusinessWriter",
        "suggestion": "核对投标函、授权书、资质文件中的所有公司名称，确保与营业执照完全一致"
      },
      {
        "category": "保证金",
        "item": "投标保证金金额与要求一致（如适用）",
        "status": "missing",
        "severity": "fatal",
        "detail": "招标文件要求保证金 5 万元，商务标书中未提及保证金缴纳信息",
        "assigned_to": "BusinessWriter",
        "suggestion": "在投标函或保证金说明章节补充：'本公司已按招标文件要求缴纳投标保证金人民币伍万元整'"
      }
    ]
  },
  "tender_specific_harness": {
    "passed": false,
    "level1_gates": [
      {
        "item": "须提供 CMMI5 证书",
        "source": "招标文件第三章 3.2.1",
        "status": "missing",
        "severity": "fatal",
        "assigned_to": "BusinessWriter",
        "suggestion": "在资质索引表补充 CMMI5 证书信息，并在偏离表中标注'无偏离'"
      }
    ],
    "level2_score": {
      "total": 82,
      "max": 100,
      "threshold": 80,
      "gaps": [
        {
          "scoring_item": "3.2 系统高可用设计（5分）",
          "current_status": "提及但未展开",
          "suggestion": "补充双活架构、数据库主从切换、熔断降级策略"
        }
      ]
    },
    "level3_checks": [
      {
        "rule": "须提供近三年内至少 3 个同类项目业绩证明",
        "status": "insufficient",
        "current": "仅提供 2 个业绩",
        "assigned_to": "BusinessWriter"
      }
    ],
    "level4_custom": [
      {
        "rule": "必须提到智慧城市中枢平台",
        "status": "missing",
        "assigned_to": "TechWriter"
      }
    ]
  },
  "format_consistency": {
    "issues": [
      {
        "type": "terminology_inconsistency",
        "description": "第3章用'微服务'，第5章用'SOA架构'，建议统一",
        "assigned_to": "TechWriter"
      }
    ]
  },
  "iteration_required": true,
  "next_actions": [
    {
      "agent": "BusinessWriter",
      "task": "修正投标函公司名称并补充保证金信息",
      "priority": "critical",
      "deadline": "next_iteration"
    }
  ]
}
```

---

## 7. 长时间运行 Agent Harness 架构

### 7.1 核心原则

foxpre 的 Agent 不是"单次 Prompt 调用"，而是遵循 **Anthropic Effective Harnesses** 的持久化循环模式：

1. **状态持久化（State Checkpointing）**：每个 Agent 的进度以 Git commit 形式持久化，可随时恢复。
2. **工具调用 + 验证（Tool Use + Validation）**：Agent 通过结构化工具（文件读写、Git 提交、搜索查询）与环境交互，工具返回结果经校验后进入下一轮。
3. **人工介入审批门（Human-in-the-Loop Gates）**：用户在关键节点或任意时刻可暂停、修改、重定向 Agent。
4. **中断恢复（Resume from Interruption）**：系统重启或浏览器关闭后，Agent 从最后一次 checkpoint 自动恢复。
5. **结构化日志与观测（Structured Observability）**：所有 Agent 状态、工具调用、错误日志写入 SQLite，实时推送到前端看板。

### 7.2 Git-Based Agent 工作流

每个 foxpre 项目对应一个独立 Git 仓库：

```
.foxpre/projects/<project-id>/
├── .git/                           # Git 版本库
├── .foxpre/state.json              # foxpre 运行时状态（任务列表、看板数据）
├── tender/
│   └── 招标文件.pdf                # 原始招标文件
├── template/
│   └── 投标文件模板.docx           # 用户确认后的锁定模板（只读）
├── business/                       # BusinessWriter 工作区
├── technical/                      # TechWriter 工作区
├── management/                     # PMWriter 工作区
├── prototypes/                     # Prototyper 输出
├── research/                       # Researcher 参考资料
├── review/
│   └── review-report-v{N}.json    # Reviewer 审核报告（多轮迭代保留历史）
└── output/
    └── 技术投标文件-终稿-v{N}.docx  # 最终输出（保留每轮迭代版本）
```

**Git 分支策略**：
- `main`：当前 Reviewer 认可的最新的稳定版本。
- `agent/<代号>/<task-id>`：各 Agent 的工作分支。例如 `agent/techwriter/sec3-architecture`。
- SOLO Coder 在 Reviewer 通过后，将对应 Agent 分支合并到 `main`。

**Git 提交规范**：
- 格式：`[<Agent代号>] <动作>: <简述>`
- 示例：
  - `[Analyzer] extract: 废标点清单（共12项）`
  - `[TechWriter] add: 3.2 系统架构设计（微服务方案）`
  - `[BusinessWriter] update: 偏离表（响应评标办法第4条）`
  - `[Reviewer] reject: 缺少CMMI5证书（一级门禁未通过）`

**SOLO Coder 通过 Git 感知进度**：
- 定时执行 `git log --all --oneline` 获取所有 Agent 分支的最新提交。
- 解析提交信息中的 `[代号]` 和 `<动作>`，更新内部状态表。
- 用户可在 UI 中查看"变更历史"，像 Review Code 一样审阅 Agent 的修改 diff。

### 7.3 SOLO Coder 状态管理

SOLO Coder 维护一张 SQLite 任务状态表，作为所有 Agent 的单一事实来源：

```sql
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_code TEXT NOT NULL,        -- Analyzer, TechWriter, BusinessWriter 等
  task_name TEXT NOT NULL,         -- 人类可读的任务名称
  task_type TEXT NOT NULL,         -- draft / revise / research / prototype / review
  status TEXT NOT NULL,            -- pending / running / paused / completed / error / rejected
  branch TEXT,                     -- Git 工作分支名
  depends_on TEXT,                 -- JSON 数组，依赖的前置任务 ID
  checkpoint_sha TEXT,             -- 最后一次 Git commit SHA（恢复点）
  checkpoint_path TEXT,            -- 恢复所需上下文文件路径（JSON）
  started_at DATETIME,
  completed_at DATETIME,
  error_log TEXT,
  review_round INTEGER DEFAULT 0,  -- 当前是第几轮审核
  created_by TEXT,                 -- solo_coder / user_intervention
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**状态流转**：
```
pending ──→ running ──→ completed ──→ (Reviewer 审核)
  │            │                           │
  │            ├──→ paused ←── 用户介入 ──┤
  │            │                           │
  │            └──→ error ──→ 用户决定重试/跳过/接管
  │                                        │
  └────────────────────────────────────────┘
                 (不通过则回退到 running，review_round + 1)
```

### 7.4 中断恢复机制

**场景 1：Agent 进程崩溃或 LLM API 超时**
- SOLO Coder 检测到心跳中断（60 秒内无新 commit）。
- 状态表标记为 `error`，看板卡片变红。
- 用户可选择：
  - **重试**：从 `checkpoint_sha` 恢复 Agent 上下文，重新启动。
  - **跳过**：将该任务标记为 `skipped`，由用户手动补充内容。
  - **接管**：用户自己编辑对应文件，完成后手动标记完成。

**场景 2：foxpre Daemon 重启**
- Daemon 启动时读取 `agent_tasks` 表中所有 `status = 'running'` 的记录。
- 对每个运行中任务，检查对应 Agent 进程是否存活。
- 若进程丢失，自动从 `checkpoint_sha` + `checkpoint_path` 恢复上下文并重新拉起 Agent。

**场景 3：用户关闭浏览器**
- Agent 在 Daemon 端持续运行，不受前端影响。
- 用户重新打开 foxpre → 通过 SSE 重连 → 看板自动同步到最新状态。
- 所有中间产物已保存在 Git 和 SQLite 中，无进度丢失。

---

## 8. 任务看板与实时观测（投标作战室）

### 8.1 投标作战室（Bid War Room）

foxpre Web UI 的核心工作界面，替代 Open Design 原有的纯聊天界面，成为投标项目的"指挥中枢"。

**布局**：
```
┌─────────────────────────────────────────────────────────────┐
│  foxpre Logo  │  项目：XX市智慧交通平台投标  │  用户头像    │
├──────────────────┬────────────────────────────┬─────────────┤
│                  │                            │             │
│   智能体看板      │      文档预览区            │  对话面板   │
│   (Kanban)       │   (DOCX / Markdown)       │  (Chat)     │
│                  │                            │             │
│  ┌───────────┐   │   ┌────────────────────┐   │  ┌───────┐  │
│  │ 待启动 2  │   │   │  技术投标文件预览   │   │  │ SOLO  │  │
│  ├───────────┤   │   │  （基于 mammoth.js  │   │  │Coder  │  │
│  │ 进行中 3  │   │   │   渲染的 HTML 预览）│   │  └───┬──┘  │
│  ├───────────┤   │   └────────────────────┘   │      │     │
│  │ 等待审核 1│   │                            │  ┌───▼───┐  │
│  ├───────────┤   │   [下载 DOCX] [导出 PDF]   │  │ Tech  │  │
│  │ 需修改 1  │   │                            │  │Writer │  │
│  ├───────────┤   │                            │  └───┬───┘  │
│  │ 已完成 2  │   │                            │  ┌───▼───┐  │
│  └───────────┘   │                            │  │用户输入│  │
│                  │                            │  └───────┘  │
└──────────────────┴────────────────────────────┴─────────────┘
```

**看板列定义**：
| 列名 | 含义 |
|---|---|
| **待启动** | SOLO Coder 已规划但尚未启动的任务 |
| **进行中** | Agent 正在运行中，有活跃的 LLM 调用或文件写入 |
| **等待审核** | Agent 已完成并提交，等待 Reviewer 或用户审核 |
| **需修改** | Reviewer 审核不通过，等待 Agent 修改 |
| **已完成** | Reviewer 审核通过，已合并到 `main` 分支 |

**看板卡片内容**：
```
┌──────────────────────────────┐
│ 🤖 TechWriter                │
│ 任务：撰写"系统架构"章节      │
│ 状态：🟡 进行中               │
│ 分支：agent/tw/sec3          │
│ 进度：3/5 小节               │
│ 最近提交：2分钟前             │
│ [查看 diff] [介入对话] [暂停] │
└──────────────────────────────┘
```

### 8.2 实时更新机制

- **数据层**：SQLite `agent_tasks` 表为单一事实来源。
- **推送层**：复用 Open Design 现有的 SSE（Server-Sent Events）基础设施。SOLO Coder 每次更新状态表后，通过 SSE 向所有连接的客户端推送 `agent_status_changed` 事件。
- **前端层**：React 状态管理接收 SSE 事件，更新对应看板卡片位置和内容，无需页面刷新。

### 8.3 用户介入入口

- **查看 diff**：点击后展开该 Agent 最新 commit 与前一次的对比（Markdown diff 或 DOCX 段落对比）。
- **介入对话**：点击后打开专属对话通道，用户可直接向该 Agent 下达指令（如"第三章改成微服务架构"）。SOLO Coder 将该对话内容作为最高优先级上下文注入该 Agent 的下一次运行。
- **暂停/恢复**：用户可暂停某个 Agent 的运行（如等待用户提供额外资料），稍后恢复。
- **强制回滚**：将该 Agent 分支回退到上一稳定 commit，废弃最近的修改。

---

## 9. Open Design 能力复用映射

foxpre 作为 Open Design 的分支，直接继承并改造以下能力：

| Open Design 原能力 | foxpre 改造方式 | 复用代码位置 |
|---|---|---|
| **Design Templates / Prototype 模式** | Prototyper Agent 调用现有 design-templates 生成系统界面原型，通过 Puppeteer 截图后嵌入 DOCX | `design-templates/`, `apps/daemon/src/live-artifacts/` |
| **Deck 模式** | 用于生成架构图、网络拓扑图、甘特图等可视化图表，输出 PNG/SVG 嵌入标书 | `design-templates/`（新增 bid-chart 类模板） |
| **Image / Video 生成** | 如需生成系统效果图、演示视频截图，调用现有媒体生成 connector | `apps/daemon/src/connectors/` |
| **Artifact 渲染引擎** | 中间产物（原型、图表）先在 Web UI 中以 HTML 预览，确认后转为 DOCX 内嵌图片 | `apps/web/src/components/file-viewer/` |
| **Chat / Run 系统** | SOLO Coder 和子 Agent 的运行时完全复用现有 Chat Run + SSE 流 + tool-use 框架 | `apps/daemon/src/runs.ts`, `apps/daemon/src/chat-routes.ts` |
| **Skills 系统** | 将各 Agent 能力封装为 Skills（`bid-analyzer`, `bid-tech-writer` 等），支持用户扩展自定义 Skill | `skills/`（新增 `foxpre-*` 目录） |
| **Project / File 系统** | 每个投标项目对应一个 Project，文件存入 `.foxpre/projects/<id>/` | 改造 `apps/daemon/src/projects.ts` 数据根目录 |
| **Agent 适配层** | 复用现有的 Claude Code / Codex / Cursor / API 运行时适配器 | `apps/daemon/src/runtimes/defs/` |
| **i18n 国际化** | 复用现有 18 语言框架，新增投标业务相关词条 | `apps/web/src/i18n/` |
| **MCP 连接能力** | 复用现有 MCP Client 实现，用于连接飞书、Obsidian 等外部知识库 | `apps/daemon/src/mcp/` |

### 9.1 原型与图表生成的具体集成

#### 图表生成（架构图 / 网络拓扑图 / 部署图）

Prototyper Agent 支持**多后端图表生成**，按优先级调用：

**方式一：自然语言绘图 MCP（推荐用于复杂工程图）**
- **工具**：`next-dwr-io` MCP（draw.io / diagrams.net）
- **流程**：
  1. Prototyper 用自然语言描述图表需求（如"画出微服务架构图，包含网关、注册中心、四个业务服务、MySQL 主从、Redis 集群"）。
  2. 通过 MCP 调用 draw.io 生成专业工程图（SVG/PNG/PDF）。
  3. 存入 `prototypes/diagrams/`，嵌入 DOCX。
- **优势**：draw.io 是工程标准，输出专业度最高；支持复杂网络拓扑、机架图、UML。
- **兜底**：当 MCP 不可用时，自动回退到方式二。

**方式二：Open Design 原生 design-templates**
- 使用内置的 `deck-architecture-diagram`、`bid-network-topology` 等模板。
- 通过 LLM 生成 Mermaid / SVG / HTML 描述，利用 Open Design 的 Artifact 渲染能力生成 PNG。
- **适用**：简单架构图、快速示意。

#### 原型开发（UI 界面原型）

Prototyper Agent 支持**多后端原型生成**，用户可在项目设置中选择：

| 选项 | 工具 | 适用场景 | MVP 状态 |
|---|---|---|---|
| **A. Open Design 原生** | design-templates + Live Artifact | 通用系统原型、快速页面截图 | **默认/内置** |
| **B. Pencil MCP** | Pencil Project 原型工具 | 需要特定控件库或导出到 Pencil 格式 | 可选 MCP 插件 |
| **C. Google Stitch MCP** | Google Stitch AI 原型 | 需要 AI 生成的高保真 UI 设计 | 可选 MCP 插件 |
| **D. 扩展** | 用户自定义 MCP/Skill | 其他原型工具（Figma、Axure 等） | Phase 2 |

**原型开发流程（以 Open Design 原生为例）**：
1. Prototyper 接收到系统功能需求（如"用户管理模块：列表页、新增页、编辑弹窗"）。
2. Prototyper 选择合适的 Open Design design-template（如 `prototype-admin-dashboard`）。
3. 调用 LLM 生成 HTML 原型代码，通过现有的 Live Artifact 机制渲染。
4. foxpre 内置的截图服务（Puppeteer）访问该 HTML 的本地 URL，截取关键页面截图。
5. 截图保存为 PNG，存入 Git 仓库 `prototypes/screenshots/`。
6. TechWriter 在撰写"系统功能设计"章节时，引用这些截图的路径，最终组装进 DOCX。

**原型开发流程（以 MCP 工具为例）**：
1. Prototyper 接收功能需求。
2. 根据用户选择的后端（Pencil/Stitch），通过 MCP 发送设计指令。
3. MCP 返回原型文件或截图 URL。
4. 下载/转换后存入 `prototypes/`，嵌入 DOCX。

---

## 10. 扩展能力设计

### 10.1 Skills 扩展

foxpre 的 Agent 能力通过 **SKILL.md** 文件定义，与 Open Design 的 Skills 系统完全兼容。

**内置 Skills（MVP）**：
- `foxpre-analyzer`：招标文件解析与需求提取
- `foxpre-researcher`：行业资料搜集与整理
- `foxpre-prototyper`：原型开发与图表生成
- `foxpre-architect`：投标大纲设计
- `foxpre-business-writer`：商务标书撰写
- `foxpre-tech-writer`：技术方案撰写
- `foxpre-pm-writer`：项目管理方案撰写
- `foxpre-reviewer`：质量审核与 Harness 检查
- `foxpre-solo-coder`：主控调度与 Orchestration

**用户自定义 Skills**：
- 用户可在 `~/.foxpre/skills/` 或项目级 `./.foxpre/skills/` 目录添加自定义 SKILL.md。
- 自定义 Skill 可覆盖内置 Skill（同名则 shadowing），或作为新 Agent 类型被 SOLO Coder 调用。
- 例如：某公司有固定的"技术方案引言模板"，可封装为 `foxpre-tech-writer` 的 overlay Skill。

### 10.2 MCP（Model Context Protocol）扩展

foxpre 复用 Open Design 的 MCP Client 基础设施，通过 MCP 协议连接外部工具和数据源。MCP 插件分为**数据类**和**工具类**两大类别。

#### 数据类 MCP（知识库与数据源）

**飞书（Lark）知识库 MCP**：
- 功能：读取飞书文档、表格、知识库中的企业资质、过往案例、标准方案。
- 使用场景：Researcher 搜集资料时，优先查询飞书知识库中的内部案例；BusinessWriter 填写资质和业绩时，直接从飞书表格拉取最新数据。
- 接入方式：用户配置飞书 App ID / App Secret，foxpre 通过 MCP Server 连接。

**Obsidian 知识库 MCP**：
- 功能：读取用户本地 Obsidian Vault 中的 Markdown 笔记、技术文档、项目复盘。
- 使用场景：TechWriter 撰写技术方案时，引用 Obsidian 中沉淀的技术架构决策、技术栈对比笔记。
- 接入方式：用户指定 Obsidian Vault 本地路径，foxpre 通过本地 MCP Server 读取。

**其他潜在数据 MCP**：
- **企业网盘**（百度网盘、阿里云盘）：读取资质扫描件、合同扫描件。
- **CRM 系统**：读取客户信息、历史项目数据。
- **招标信息网站**：自动获取最新招标公告。

#### 工具类 MCP（生成与操作增强）

**自然语言绘图 MCP：next-dwr-io**
- 功能：通过自然语言描述生成 draw.io / diagrams.net 工程图（架构图、网络拓扑图、UML、机架图）。
- 使用场景：Prototyper Agent 需要生成专业工程图时调用。
- 优势：draw.io 是工程标准，支持复杂拓扑和精确布局。
- 接入方式：配置 next-dwr-io MCP Server，Prototyper 自动调用。

**原型设计 MCP：Pencil / Google Stitch**
- 功能：通过 AI 或控件库生成高保真 UI 原型。
- 使用场景：用户需要比 Open Design 原生 HTML 原型更专业的设计稿时选用。
- 用户选择：项目设置中切换原型后端（Open Design 原生 / Pencil / Stitch）。

**Word 精修 MCP：office-cli**
- 功能：通过本地安装的 Microsoft Word 执行精确的 DOCX 操作（VBA 宏、域代码、复杂样式调整、格式合规校验）。
- 使用场景：
  - 某省电子招投标平台对 DOCX 有特殊的格式校验规则，需通过 Word 原生功能确保兼容性。
  - 用户需要批量修改已生成标书（如全局替换产品名称并更新页眉）。
  - 插入复杂的 Word 域（如 IF 域、合并域、交叉引用）。
- **定位**：可选增强插件，不是 MVP 核心路径。MVP 核心路径为 Pandoc + docx.js 后处理。
- 接入方式：
  ```json
  {
    "mcpServers": {
      "office-cli": {
        "command": "npx",
        "args": ["office-cli", "mcp-server"],
        "env": {
          "OFFICE_CLI_WORD_PATH": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE"
        }
      }
    }
  }
  ```

### 10.3 插件化架构（预留）

虽然 MVP 阶段不实现完整的插件市场，但代码架构预留扩展点：
- **Agent 注册表**：新 Agent 类型通过 SKILL.md + 代码实现注册到 SOLO Coder，SOLO Coder 自动识别并纳入调度。
- **输出格式扩展**：当前 MVP 输出 DOCX，预留 `OutputAdapter` 接口，未来可扩展为 PDF、HTML 等。
- **审核规则扩展**：Reviewer 的审核规则采用插件化配置，用户可通过 JSON/YAML 添加新的门禁检查项。

---

## 11. 数据模型与存储

### 11.1 项目（Project）

复用 Open Design 的 Project 模型，扩展投标专属字段：

```typescript
interface foxpreProject {
  id: string;
  name: string;                    // 项目名称（如"XX市智慧交通平台"）
  tender_name: string;             // 招标项目名称
  tender_number: string;           // 招标编号
  tender_file_path: string;        // 招标文件路径
  tender_file_type: 'pdf' | 'docx';
  status: 'created' | 'analyzing' | 'template_confirming' | 'drafting' | 'reviewing' | 'completed';
  business_type: 'it_construction' | 'software_dev' | 'system_integration' | 'maintenance';
  created_at: Date;
  updated_at: Date;
  // 扩展字段
  format_confirmed: boolean;       // 用户是否已确认模板
  template_path: string;           // 确认后的模板路径
  review_round: number;            // 当前审核轮次
  final_output_path: string;       // 最终 DOCX 输出路径
}
```

### 11.2 智能体任务（AgentTask）

详见第 7.3 节的 `agent_tasks` 表设计。

### 11.3 文档片段（DocumentFragment）

用于追踪各 Agent 产出的文档片段，支持最终组装：

```sql
CREATE TABLE document_fragments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_code TEXT NOT NULL,
  fragment_type TEXT NOT NULL,     -- chapter / table / image / appendix
  title TEXT,
  content_path TEXT,               -- 文件在 Git 仓库中的相对路径
  target_section TEXT,             // 对应模板的哪个章节（如 "3.2 系统架构"）
  status TEXT,                     -- draft / submitted / approved / rejected
  word_count INTEGER,
  git_sha TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### 11.4 审核历史（ReviewHistory）

保留每轮审核的完整记录，支持审计和回溯：

```sql
CREATE TABLE review_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  reviewer_agent_id TEXT,
  report_json TEXT,                // Reviewer 输出的完整 JSON 报告
  verdict TEXT,                    // passed / conditionally_passed / rejected
  created_at DATETIME
);
```

---

## 12. 非功能性需求

### 12.1 性能
- **招标文件解析**：50MB 以内的 PDF/DOCX 应在 2 分钟内完成 Analyzer 解析。
- **Agent 响应**：用户与 Agent 对话的响应延迟应控制在 5-30 秒（取决于 LLM 模型和任务复杂度）。
- **看板刷新**：SSE 推送延迟 < 1 秒，前端状态更新无感知。
- **DOCX 生成**：最终组装 100 页以内的标书应在 10 秒内完成。

### 12.2 可靠性
- **进度不丢失**：所有 Agent 状态、文件内容、Git commit 持久化到本地磁盘，系统崩溃后可 100% 恢复。
- **格式安全**：Agent 无权修改已锁定的 DOCX 模板格式，从根本上杜绝"擅自改格式导致废标"。
- **审核兜底**：Reviewer 的四级门禁体系作为最终质量闸门，不通过则无法输出最终文件。

### 12.3 可扩展性
- **新 Agent 类型**：通过添加 SKILL.md + 注册到 SOLO Coder 调度表，即可引入新智能体，无需修改核心架构。
- **新输出格式**：通过实现 `OutputAdapter` 接口，可扩展 PDF、HTML 等输出。
- **新 MCP 源**：通过配置 MCP Server，可接入任意支持 MCP 协议的外部数据源。

### 12.4 安全性
- **本地优先**：招标文件和企业资质数据默认存储在本地（`.foxpre/`），不上传云端。
- **敏感信息隔离**：Agent 的 system prompt 中明确禁止在日志中输出 API Key、密码等敏感信息。
- **LLM 数据边界**：若用户选择使用云端 LLM API，仅上传必要的招标文件片段（经用户确认），不上传整个企业资质库。

### 12.5 兼容性
- **输入格式**：支持 PDF（含扫描件）、DOCX；未来可扩展至 TXT、RTF、图片格式招标公告。
- **输出格式**：MVP 输出 DOCX（兼容 Microsoft Word 2016+、WPS Office）；未来可扩展 PDF。
- **操作系统**：与 Open Design 保持一致，优先支持 macOS 和 Linux，Windows native 为 best-effort。

---

## 13. 附录：MVP 范围边界

### 13.1 包含在 MVP 中
- 8 个核心智能体（SOLO Coder + 7 个子 Agent）的协同工作流。
- PDF/DOCX 招标文件解析与需求提取。
- **双层 Harness 质量审核**：通用 Harness（企业信息/资质/签章/保证金基线检查）+ 特定 Harness（废标点/评分响应/招标强制要求/自定义审查）。
- DOCX 模板自动重建 + 用户确认流程。
- **样式库与排版设计器**：内置投标样式模板 + 用户自定义样式 + 可视化样式设计器。
- **Markdown → DOCX 转换引擎**：Pandoc 主体结构转换 + docx.js 后处理（中文编号/填空区/表格精修/页眉页脚）。
- 商务标书 + 技术标书 + 项目管理方案的并行撰写。
- Git 版本化工作流与任务看板实时观测。
- 深度协作模式（用户随时介入与 Agent 对话）。
- Open Design 原型/图表能力的复用（截图嵌入 DOCX）。
- **自然语言绘图 MCP**：内置 `next-dwr-io` MCP 支持，Agent 可通过自然语言生成架构图、网络拓扑图等专业工程图。
- Skills 扩展机制。

### 13.2 不包含在 MVP 中（后续迭代）
- **MCP 知识库对接**：架构预留接口，MVP 阶段先支持本地文件上传作为知识库，飞书/Obsidian MCP 在 Phase 2 实现。
- **外部原型工具 MCP**：`next-dwr-io` 绘图 MCP 在 MVP 中已内置，但 Pencil / Google Stitch 等原型设计 MCP 为 Phase 2 可选插件。
- **Word 精修 MCP**：`office-cli` 等通过本地 Word 执行复杂 DOCX 操作的 MCP 为 Phase 2 可选增强，MVP 核心路径为 Pandoc + docx.js 后处理。
- **报价/经济标编制**：MVP 仅覆盖技术标和商务标（资质/偏离表等），不包含报价计算和 Excel 报价表生成。
- **电子签章/CA 加密**：投标文件盖章、CA 证书加密、电子标书平台上传等属于后续集成。
- **多项目并行管理看板**：MVP 聚焦单项目内的 Agent 协作，多项目总览在 Phase 2 扩展。
- **AI 辅助评标（反向）**：不仅帮投标人写标书，还能帮招标人审标书——这是后续产品延伸方向。

---

**文档结束**。本规格说明书作为 foxpre MVP 的总体蓝图，后续将进入技术实现计划阶段。

---

## 附录 A：投标人信息库（v1.1 新增）

### A.1 定位

投标人信息库是 foxpre 的核心知识资产，存储投标人的企业信息、资质证书、业绩案例等，用于商务标书的自动填充和门禁审核。**一个企业可维护多个投标人信息**（对应不同子公司/分公司），创建投标项目时从中选择一个关联。MVP 阶段仅支持独立投标，联合体投标在后续迭代实现。

### A.2 数据模型

```typescript
interface 投标人信息 {
  id: string;
  投标主体名称: string;           // 投标时使用的公司名称
  统一社会信用代码: string;
  注册地址: string;
  联系人: string;
  电话: string;
  邮箱: string;
  法人姓名: string;
  法人身份证号?: string;         // 加密存储
  开户银行: string;
  银行账号?: string;             // 加密存储
  是否默认: boolean;              // 默认投标人
  创建时间: string;
  更新时间: string;
}

interface 资质证书 {
  id: string;
  投标人ID: string;
  资质名称: string;              // CMMI5、ISO9001、ITSS、涉密资质等
  证书编号: string;
  发证机构: string;
  有效期至: string;              // 用于过期提醒
  扫描件路径?: string;
}

interface 业绩案例 {
  id: string;
  投标人ID: string;
  项目名称: string;
  客户名称: string;
  合同金额?: number;
  完成时间: string;
  项目简介: string;
  相关证明材料?: string[];      // 文件路径列表
}
```

### A.3 数据安全策略

投标人信息涉及企业敏感数据，实施**分级保护**：

| 数据项 | 敏感级别 | 存储策略 |
|--------|---------|---------|
| 投标人名称、地址 | 低 | SQLite 明文 |
| 信用代码、联系人 | 中 | SQLite + 应用层加密（AES-256-GCM） |
| 法人身份证号、银行账号 | 高 | SQLite + 应用层加密 + UI 脱敏显示 |
| 资质证书扫描件 | 高 | 文件系统加密存储 |

**加密密钥管理**：
- 密钥来源：用户首次设置 foxpre 时自动生成
- 密钥存储：操作系统的密钥管理器（Windows DPAPI / macOS Keychain / Linux libsecret）
- 加密方式：Node.js 内置 `crypto` 模块，每条记录独立 IV + GCM 认证标签

### A.4 知识库对接路线图

| 阶段 | 能力 | 对接方式 |
|------|------|---------|
| MVP | 手工录入投标人信息 | 直接 SQLite |
| V1.1 | 从飞书多维表格导入 | Composio Lark Connector（复用 Open Design 已有基础设施） |
| V1.2 | 从 Obsidian 知识库同步 | 本地文件扫描（`.md` 文件解析） |
| V2.0 | 双向同步（foxpre ↔ 飞书） | Composio + Webhook |

---

## 附录 B：引用已有项目（v1.1 新增）

### B.1 设计背景

foxpre 不是"Open Design 的一个插件"，而是"Open Design 的一个使用场景"。售前工程师用 Open Design 做原型、做 PPT、做架构图... 然后把这些成果**组装成投标文件**。因此，引用已有 Open Design 项目是 foxpre 的核心能力。

### B.2 引用流程

**创建投标项目时的引用步骤**：

```
步骤1：上传招标文件 → Analyzer 自动提取项目信息（招标项目名称、编号、类型等无需手工填写）
步骤2：关联投标人（从投标人信息库中选择）
步骤3：引用已有项目（可选）
  ├── 列出用户的 Open Design 项目（调用 GET /api/projects）
  ├── 用户选择一个/多个项目
  ├── 系统分析项目文件，提取可引用资源
  │     ├── prototype → 自动截图各页面
  │     ├── deck → 导出各页幻灯片为图片
  │     ├── image/template → 原图
  │     └── live-artifact → 渲染后截图
  └── 用户确认/调整章节映射
```

**编制过程中新建原型项目**：

```
1. 用户在标书制作工作区点击"创建原型"
2. foxpre 调用 Open Design 的创建项目 API
   请求中携带: { metadata: { foxpreProjectId: '投标项目ID', source: 'foxpre' } }
3. 新项目创建完成后，自动出现在投标项目的引用列表中
   （因为 metadata 中有 foxpreProjectId 关联）
4. 用户在原型项目中工作
5. 工作完成后，点击"同步到投标项目"
6. foxpre 执行截图 + 描述流程
7. 描述结果注入到对应章节
```

### B.3 数据模型

```typescript
// 在 foxpre_projects 表中新增引用关系
interface 项目引用关系 {
  投标项目ID: string;
  引用项目ID: string;           // Open Design 项目 ID
  引用来源: '创建时引用' | '工作中新建' | '手动添加';
  创建时间: string;
  最后同步时间: string;
}

// 引用项目的章节映射
interface 章节映射 {
  章节标题: string;            // 如 "3.2.1 系统架构设计"
  文件路径: string;            // 项目内文件相对路径
  描述文本: string;            // Agent 生成的图片描述（用于响应性描述）
  插入方式: '嵌入图片' | '引用链接';
}

// Open Design 项目 metadata 中新增字段
interface 项目元数据扩展 {
  foxpreProjectId?: string;     // 如果此项目是由 foxpre 创建的，记录关联的投标项目 ID
  foxpreSource?: string;        // 'foxpre-prototyper' | 'foxpre-architect' | 'foxpre-user-create'
  foxpre章节映射?: 章节映射[];
}
```

### B.4 图片描述引擎（三级降级策略）

引用项目的截图需要生成功能描述，供 TechWriter 撰写响应性描述。采用三级降级策略：

**Level 3（最优）— 多模态 Vision 分析**
- 条件：用户配置了支持 Vision 的 LLM（如 GPT-4V、Claude 3 Opus、Gemini Pro Vision）
- 产出：结构化功能描述 + 技术特征 + 投标关联度
- 实现：`apps/daemon/src/foxpre/image-describer.ts`，调用 `supportsImagePaths` 的 Agent 运行时

**Level 2（降级）— HTML 代码分析 + 文件名推断**
- 条件：无多模态 LLM，但有项目 HTML 文件
- 产出：基于代码分析的描述（80% 场景可覆盖）
- 分析内容：
  - 页面标题（`<title>`）
  - 按钮文本（`<button>`）
  - 表单标签（`<label>`）
  - 导航菜单项（`<nav>`）
  - 标题层级（`<h1>`-`<h6>`）
  - 图片 alt 文本（`<img alt="">`）
  - CSS 类名推断（`.data-table` → 数据表格）
  - 文件名推断（`login.html` → 登录模块）
- 置信度：0.6（降级模式下较低）

**Level 1（兜底）— 用户手动标注**
- 条件：无法自动分析
- 产出：用户在 UI 上填写截图功能描述
- UI 提供：截图缩略图 + 功能描述输入框 + 所属章节下拉选择 + 核心模块标签输入

### B.5 图片嵌入 DOCX 策略

| 项目类型 | 文件格式 | 嵌入策略 |
|---------|---------|---------|
| prototype（原型） | HTML | 渲染后截图为 PNG → 嵌入 DOCX |
| deck（PPT） | HTML | 每页导出为 PNG → 逐页嵌入 |
| image/template | PNG/SVG | SVG 直接嵌入（矢量） / PNG 直接嵌入 |
| live-artifact | HTML | 渲染后截图为 PNG → 嵌入 DOCX |

---

## 附录 C：foxpre 与 Open Design 集成架构（v1.1 新增）

### C.1 集成方式

foxpre 不作为 Open Design 的独立子页面（如 `/foxpre`），而是**深度集成到 Open Design 的项目系统中**：

- **New Project 面板**：在 `NewProjectPanel.tsx` 的 Tab 列表中新增**"标书制作" Tab**（对应 `ProjectKind = 'bid'`）
- **ProjectView 工作区**：当项目类型为 `bid` 时，ProjectView 中显示**"标书" Tab**，内含三栏布局（看板 + 文档预览 + 智能体对话）
- **项目类型扩展**：在 `packages/contracts/src/api/projects.ts` 的 `ProjectKind` 中新增 `'bid'` 类型

### C.2 New Project 流程（标书制作 Tab）

```
步骤1：上传招标文件
  └── 用户只需做一件事：上传文件 + 给项目起个名字（如"6月智慧交通投标"）
  └── 招标项目名称、招标编号、项目类型由 Analyzer 自动提取，无需手工填写

步骤2：关联投标人
  └── 从投标人信息库中选择一个投标人（MVP 仅支持独立投标）

步骤3：选择样式模板
  └── 4套内置样式网格 + 可上传自定义参考 DOCX

步骤4：引用已有项目（可选）
  └── 列出用户的 Open Design 项目
  └── 选择要引用的原型/架构图/PPT 项目
  └── 后续工作流中需要生成图片或原型可引导用户创建新的 OD 项目
```

### C.3 ProjectView 中的标书制作工作区

当项目类型为 `bid` 时，ProjectView 新增**"标书" Tab**：

```
┌─────────────────────────────────────────────────────────────────┐
│  Project: 6月智慧交通投标       [Files] [Preview] [标书] [Chat] │
├─────────────────────────────────────────────────────────────────┤
│  标书制作工作区                                                  │
│  ┌──────────────────┬──────────────────┬──────────────────────┐ │
│  │  智能体看板        │  文档预览          │  智能体对话           │ │
│  │  (Kanban)         │  (Preview)         │  (Chat)              │ │
│  └──────────────────┴──────────────────┴──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

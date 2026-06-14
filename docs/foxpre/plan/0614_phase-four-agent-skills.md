# foxpre 阶段四开发提示词：Agent Skills 定义

**日期**：2026-06-14
**状态**：下发给 atomcode
**分支**：`foxpre/v0.10/dev`
**基线**：`3c3d45aa` (OD v0.10.0 tag)

---

## 0. 前置状态（请勿修改）

| 名称 | 状态 |
|------|------|
| OD 基线 | v0.10.0 tag `3c3d45a` |
| foxpre 分支 | `foxpre/v0.10/dev` @ `da5d893` |
| contracts/foxpre/api.ts | ✅ 已就绪（`BidProjectMetadata`, `AgentTask`, `ReviewReport`, `RuleResult`, `StyleTemplate`, `Bidder` 等） |
| foxpre/db.ts | ✅ 11 张表 + 4 种子模板 + 12 条门禁规则 |
| foxpre/harness-engine.ts | ✅ `checkFragment`, `runHarness`, `runFullHarness`, `generateReviewReport` |
| foxpre/document-pipeline.ts | ✅ `parseDocument`, `importDocument` |

## 1. 目标与范围

将 `skills/foxpre-*/SKILL.md` 这 **9 个文件**从占位桩升级为完整的 Agent Skill 定义。
**每个文件增加约 30-60 行内容，总计约 350-450 行新增。**

**不改动任何其他文件**。不新增目录，不新增文件，不写代码。

---

## 2. 改动清单（逐文件）

### 2.1 foxpre-analyzer（招标文件解析器）

当前状态：基本框架完整（输入/输出/执行概要/约束）。

**要补充的内容：**

#### a) Frontmatter 扩展

```yaml
---
name: foxpre-analyzer
zh_name: "招标文件解析器"
emoji: "🔍"
description: "解析招标文件，提取评分项、资质条件、技术规范"
category: bid
od:
  mode: bid
  category: bid
---
```

#### b) 新增节："## 技术上下文"

```
- 输入来源：`document-pipeline.ts` 的 `parseDocument(filePath)` → `Fragment[]`
- 关键数据库表：`foxpre_projects`, `foxpre_document_fragments`
- 关键合同类型：`BidProjectMetadata` (来自 `@open-design/contracts`)
- 评分关键词识别集：`["评分", "分值", "得分", "评审", "评价"]`
- 资质条件识别：注册资金正则 `\d+[\s]*万元?`，认证关键词 `["ISO", "CMMI", "等保"]`
- 输出格式：Markdown 表格，结构化为后续 Writer 可直接引用的清单
```

#### c) 新增节："## 交互协议"

```
- 下游消费者：TechWriter, BizWriter, QualWriter（通过 Orchestrator 协调并行消费）
- 输出传递方式：分析结果写入 `foxpre_document_fragments` 表（作为分析碎片），Orchestrator 传递 `projectId`
- 消息格式：`{ 评分项: [], 资质条件: [], 技术规范: [], 废标点: [] }`（JSON 结构）
```

---

### 2.2 foxpre-tech-writer（技术方案编写器）

Frontmatter 参照 2.1 模式补全（name: foxpre-tech-writer, zh_name: "技术方案编写器", emoji: "⚙️"）。

#### 新增 "## 技术上下文"

```
- 输入来源：Analyzer 输出的技术规范清单（从 `foxpre_document_fragments` 读取）
- 数据库操作：写入方案片段到 `foxpre_document_fragments`，更新 `foxpre_agent_tasks`
- 章节结构：需求分析、系统架构、技术方案、实施方案、项目保障
- 必含要素：技术指标响应表（逐条对应招标要求）
- Markdown 分节：每个大节使用 `##` 标题，与 `document-pipeline.ts` 的分节规则一致
```

#### 新增 "## 交互协议"

```
- 上游：Analyzer（依赖其输出完成后才启动）
- 下游：HarnessRunner（不需要直接交互，Orchestrator 协调）
- 并行约束：与 BizWriter、QualWriter 并行执行，无共享状态
- 状态上报：完成时更新 `foxpre_agent_tasks.status = 'DONE'`
```

---

### 2.3 foxpre-biz-writer（商务方案编写器）

Frontmatter 补全（name: foxpre-biz-writer, zh_name: "商务方案编写器", emoji: "💰"）。

#### 新增 "## 技术上下文"

```
- 输入来源：Analyzer 输出的商务要求清单、`foxpre_bidders` 报价策略
- 数据库操作：读取 `foxpre_bidders.*`，写入片段到 `foxpre_document_fragments`
- 必含要素：报价表（Markdown 表格）、商务条款逐条响应、商务偏离表（如有偏离）
- 报价表字段：序号、项目名称、规格型号、数量、单价、合计、备注
```

#### 新增 "## 交互协议"

```
- 上游：Analyzer + BidderManager（读取投标人商务数据）
- 并行约束：与 TechWriter、QualWriter 并行
- 状态上报：同 TechWriter
```

---

### 2.4 foxpre-qual-writer（资质文件编写器）

Frontmatter 补全（name: foxpre-qual-writer, zh_name: "资质文件编写器", emoji: "📋"）。

#### 新增 "## 技术上下文"

```
- 输入来源：Analyzer 输出的资质条件、`foxpre_bidders` + `foxpre_bidder_qualifications` + `foxpre_bidder_projects`
- 数据库操作：从三张 bidder 相关表读取资质、业绩数据
- 必含要素：资质证书清单、人员配置表、类似业绩案例表、资格证明文件索引
- 资质过期检测：对比 `有效截止日期` 字段与当前日期
```

#### 新增 "## 交互协议"

```
- 上游：Analyzer + BidderManager
- 并行约束：与 TechWriter、BizWriter 并行
```

---

### 2.5 foxpre-harness-runner（门禁审核执行器）

Frontmatter 补全（name: foxpre-harness-runner, zh_name: "门禁审核执行器", emoji: "🛡️"）。

当前 "## 执行概要" 节已有内容很好，**保持不变**。在约束最后追加技术约束。

#### 新增 "## 技术上下文"

```
- 核心技术依赖：`apps/daemon/src/foxpre/harness-engine.ts`
  - `loadActiveRules(db)` — 从 `foxpre_universal_harness_rules` 读取规则（12 条种子规则）
  - `runFullHarness(db, projectId, fragments)` — 批量审核（N fragments × M rules）
  - `generateReviewReport(db, projectId, report)` — 磁盘写入审核历史
- 五大类别：内容完整性、废标规避、格式一致性、合规性、质量
- 数据库写入：`foxpre_review_history`（原子写入）+ `foxpre_projects.当前审核轮次` 递增
- 门禁不通过时：不阻断下游（返回失败结果，由 Orchestrator 决策是否退回重写）
```

#### 新增 "## 交互协议"

```
- 上游：Orchestrator（调用 `runFullHarness`）
- 迭代协议：通过 `foxpre_projects.当前审核轮次` 实现多轮审核
```

---

### 2.6 foxpre-style-checker（样式合规检查器）

Frontmatter 补全（name: foxpre-style-checker, zh_name: "样式合规检查器", emoji: "🎨"）。

#### 新增 "## 技术上下文"

```
- 输入来源：待检查的文档片段（`foxpre_document_fragments`）+ `foxpre_style_templates` 格式规范
- 检查项目：字体类型/字号、行距/段间距、页眉页脚一致性、标题编号层级连续性
- 格式规范来源：`StyleTemplate.formatSpec` JSON 字段
- 严重级别：致命（格式不符合招标要求）> 严重（正文格式不一致）> 轻微（建议性优化）
- 约束：仅检查样式，不涉及内容审核（内容归 HarnessRunner 管）
```

#### 新增 "## 交互协议"

```
- 上游：HarnessRunner（门禁通过后触发，由 Orchestrator 协调）
- 并行约束：与 DocxAssembler 串行（样式检查组在前，组装在后）
```

---

### 2.7 foxpre-docx-assembler（DOCX 组装器）

Frontmatter 补全（name: foxpre-docx-assembler, zh_name: "DOCX 组装器", emoji: "📄"）。

#### 新增 "## 技术上下文"

```
- 输入来源：所有已审核通过的片段（从 `foxpre_document_fragments` 读取）+ `foxpre_style_templates.templatePath` (空白 DOCX 模板)
- 组装顺序：封面 → 商务方案 → 技术方案 → 资质文件 → 附件
- 关键操作：Pandoc 拼接 Markdown → 应用模板样式 → 生成目录 → 插入页码
- Fragment 排序：按 `orderIndex` 升序排列
- 约束：不得修改已审核片段内容（HarnessRunner 通过后锁定），仅做排版和样式
```

#### 新增 "## 交互协议"

```
- 上游：StyleChecker（样式检查通过后触发）
- 串行约束：必须是工作流的最后一步
```

---

### 2.8 foxpre-orchestrator（编排调度器）

Frontmatter 补全（name: foxpre-orchestrator, zh_name: "编排调度器", emoji: "🎯"）。

当前文件有完整的 "## 任务依赖图" 和 "## 状态流转"——**这是权威设计文档，保持不变**。

#### 新增 "## 技术上下文"

```
- 状态机字段：`foxpre_projects.状态`（`待启动` → `进行中` → `等待审核` → `需修改` → `已完成`）
- 任务管理：`foxpre_agent_tasks` 表追踪每个 Agent 执行状态
- Agent 派遣：通过 `POST /api/runs` 创建 Agent 实例（当前阶段尚未实现，仅注释说明）
- 依赖图执行：严格按 DAG 执行，不可跳过 HarnessRunner 门禁
- 门禁门逻辑：`failedRules > 0` → 状态转为 `需修改`，退回编写阶段；`failedRules === 0` → 状态转为 `等待审核`
```

#### 新增 "## 交互协议"

```
- 与 BidderManager 交互：创建项目时读取投标人数据快照
- 故障恢复：`foxpre_agent_tasks.status` 的 `FAILED` 状态可触发重试
```

---

### 2.9 foxpre-bidder-manager（投标人管理器）

Frontmatter 补全（name: foxpre-bidder-manager, zh_name: "投标人管理器", emoji: "🏢"）。

#### 新增 "## 技术上下文"

```
- 管理表：`foxpre_bidders`（投标人信息）、`foxpre_bidder_qualifications`（资质证书）、`foxpre_bidder_projects`（业绩案例）
- 敏感字段加密：`统一社会信用代码`、`法人代表` 通过 `AES-256-GCM` 加密存储（阶段六实现 `field-crypto.ts`）
- 资质过期预警：`SELECT * FROM foxpre_bidder_qualifications WHERE 有效截止日期 < ?` 查询即将过期证书
- 快照模式：创建项目时一次性快照到 `foxpre_projects`，标书生成使用本地快照
```

#### 新增 "## 交互协议"

```
- 消费者：QualWriter（读取资质和业绩）、BizWriter（读取报价信息）
- 不参与主工作流 DAG——是支撑服务，按需被查询
```

---

## 3. 通用规则

1. **内容约束**：不删除或修改现有章节（输入/输出/执行概要/约束），只追加新节
2. **Markdown 约束**：所有输出必须为 Markdown 格式（`##` 标题分节，与 `document-pipeline.ts` 兼容）
3. **数据访问约束**：所有数据库操作必须经过 `foxpre_` 前缀表，不得触碰 OD 核心表（`projects`, `conversations`, `messages` 等）
4. **门禁依赖**：HarnessRunner 必须通过 `runFullHarness(db, projectId, fragments)` 调用，不得自行实现检查逻辑
5. **文档管线依赖**：Analyzer 输入必须通过 `parseDocument(filePath)` 获得 Fragment 结构

---

## 4. 验收标准（逐项检查）

| # | 检查项 | 方法 |
|---|--------|------|
| 1 | `pnpm guard` 零错误（与 baseline 一致） | `pnpm guard` |
| 2 | 未引入新 JS/TS 文件 | `ls skills/foxpre-*/*.ts skills/foxpre-*/*.js 2>&1` 无输出 |
| 3 | 未修改 skills/foxpre-* 之外的任何文件 | `git diff --name-only origin/foxpre/v0.10/dev` |
| 4 | 9 个文件修改，全部在 `skills/foxpre-*/SKILL.md` | `git diff --stat origin/foxpre/v0.10/dev` |
| 5 | 每个文件 frontmatter 含 `category: bid`, `od.mode: bid` | `grep "category:" skills/foxpre-*/SKILL.md` |
| 6 | 每个文件含 "## 技术上下文" 和 "## 交互协议" | `grep "技术上下文" skills/foxpre-*/SKILL.md` |
| 7 | 每个文件含 emoji（在 frontmatter） | `grep "emoji:" skills/foxpre-*/SKILL.md` |
| 8 | 现有节"输入/输出/执行概要/约束"内容未被删除或修改 | `git diff` 人工检查 |
| 9 | `pnpm --filter @open-design/daemon test tests/foxpre/` 全绿 | `pnpm --filter @open-design/daemon test tests/foxpre/` |
| 10 | 工作区 clean（无未提交文件） | `git status` |

---

## 5. 操作指南

```bash
# 第零步：确认分支环境
git branch --show-current  # 必须在 foxpre/v0.10/dev

# 第一步：逐个编辑 9 个文件（见 §2）
# 按 2.1 → 2.9 顺序，每改完一个检查一次 diff

# 第二步：自检
git diff --stat origin/foxpre/v0.10/dev  # 确认只改了 9 个 SKILL.md

# 第三步：验收
pnpm guard
pnpm --filter @open-design/daemon test tests/foxpre/

# 第四步：提交
git add skills/foxpre-*/SKILL.md
git commit -m "foxpre: upgrade agent skill definitions with tech context and interaction protocols"
```

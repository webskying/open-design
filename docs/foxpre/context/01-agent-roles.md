# foxpre Agent 角色速查卡

**用一句话理解**：foxpre 模拟真实投标团队 —— 9 个 Agent 在 Orchestrator 调度下按 DAG 协作，从招标文件分析到最终 DOCX 输出。

---

## Agent 全景

```
                    ┌────────────────────┐
                    │   Orchestrator 🎯  │  驱动层：任务编排、状态流转、故障恢复
                    └────────┬───────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
      ▼                      ▼                      ▼
┌───────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Analyzer  │    │   BidderManager 🏢  │    │   依赖图执行引擎      │
│ 🔍  Step 1│    │   (支撑服务，按需)   │    │  (阶段五实现)        │
└─────┬─────┘    └─────────────────────┘    └─────────────────────┘
      │
      ├──────────────────┬──────────────────┐
      ▼                  ▼                  ▼
┌───────────┐      ┌───────────┐      ┌───────────┐
│TechWriter │      │ BizWriter │      │QualWriter │    Step 2（并行）
│ ⚙️ 技术方案│      │ 💰 商务方案│      │ 📋 资质文件│
└─────┬─────┘      └─────┬─────┘      └─────┬─────┘
      └──────────────────┼──────────────────┘
                         ▼
                   ┌───────────┐
                   │HarnessRun │    Step 3（门禁门）
                   │ 🛡️ 审核   │    ← 调用 harness-engine.ts
                   └─────┬─────┘
                         ▼
                   ┌───────────┐
                   │StyleCheck │    Step 4（样式检查）
                   │ 🎨 格式   │
                   └─────┬─────┘
                         ▼
                   ┌───────────┐
                   │DocxAssem  │    Step 5（最终输出）
                   │ 📄 组装   │
                   └───────────┘
```

---

## 各 Agent 一句话定义

| emoji | 标识 | 一句话 | 输入来源 | 输出目标 |
|-------|------|--------|---------|---------|
| 🎯 | **orchestrator** | 编排调度器，驱动整个 DAG | 项目配置 | Agent 任务 + 状态机 |
| 🔍 | **analyzer** | 解析招标文件，提取评分项/资质/规范 | `parseDocument()` → Fragment[] | TechWriter/BizWriter/QualWriter |
| ⚙️ | **tech-writer** | 撰写技术方案章节 + 指标响应表 | Analyzer 技术规范 | 技术方案 Fragment[] |
| 💰 | **biz-writer** | 撰写报价表 + 商务条款响应 | Analyzer 商务要求 + BidderManager | 商务方案 Fragment[] |
| 📋 | **qual-writer** | 编译资质证书清单 + 团队配置 + 业绩 | Analyzer 资质条件 + BidderManager | 资质文件 Fragment[] |
| 🛡️ | **harness-runner** | 执行门禁审核（12 条规则 × 5 类别） | 所有 Fragment[] + `loadActiveRules()` | `foxpre_review_history` 记录 |
| 🎨 | **style-checker** | 检查字体/行距/页眉页脚/标题层级 | Fragment[] + StyleTemplate | 样式问题清单 |
| 📄 | **docx-assembler** | 合并片段 → 应用模板 → 生成最终 .docx | Fragment[] + 空白 DOCX 模板 | 标书 .docx 文件 |
| 🏢 | **bidder-manager** | 投标人信息/资质/业绩的管理维护 | 手动录入 | 按需被 QualWriter/BizWriter 查询 |

---

## 门禁规则五大类别

| 类别 | 规则数 | 检查内容 |
|------|--------|---------|
| 内容完整性 | 3 | 必填章节关键词、评分项、附件引用 |
| 废标规避 | 3 | 过期日期、报价计算、敏感信息 |
| 格式一致性 | 3 | 封面信息、目录页码、页边距/字体 |
| 合规性 | 2 | 投标有效期、保证金/保函 |
| 质量 | 1 | 重复段落、短片段、空行 |

12 条种子规则在 `initFoxpreDatabase()` 中插入，从 `foxpre_universal_harness_rules` 表加载。

---

## 状态机

```
       Orchestrator 控制
            │
            ▼
待启动 → 进行中 → 等待审核 → 需修改
                        │         │
                        ▼         │
                      已完成 ←────┘ (修改后重新审核)
```

KANBAN_COLUMNS: `{ TODO: '待启动', IN_PROGRESS: '进行中', REVIEW: '等待审核', NEEDS_REVISION: '需修改', DONE: '已完成' }`

---

## Skill 文件位置

| 文件 | 核心依赖 |
|------|---------|
| `skills/foxpre-orchestrator/SKILL.md` | DAG 图、状态机 |
| `skills/foxpre-analyzer/SKILL.md` | `document-pipeline.ts` |
| `skills/foxpre-tech-writer/SKILL.md` | Analyzer 输出 |
| `skills/foxpre-biz-writer/SKILL.md` | Analyzer + BidderManager |
| `skills/foxpre-qual-writer/SKILL.md` | Analyzer + BidderManager |
| `skills/foxpre-harness-runner/SKILL.md` | `harness-engine.ts` |
| `skills/foxpre-style-checker/SKILL.md` | StyleTemplate.formatSpec |
| `skills/foxpre-docx-assembler/SKILL.md` | StyleTemplate.templatePath + Pandoc |
| `skills/foxpre-bidder-manager/SKILL.md` | 三张 bidder 表 |

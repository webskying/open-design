---
name: foxpre-orchestrator
zh_name: "编排调度器"
emoji: "🎯"
description: "任务依赖管理、状态流转、看板更新"
category: bid
od:
  mode: bid
  category: bid
---

# 编排调度器（Orchestrator）

## 任务依赖图

```
           Analyzer
          /    |    \
   TechWriter  BizWriter  QualWriter
          \    |    /
         HarnessRunner    ← 门禁门（所有任务就绪后执行）
              |
        StyleChecker
              |
       DocxAssembler      ← 最终输出
```

## 输入
- 招标文件路径
- 投标人 ID
- 项目配置（输出目录、模板选择等）

## 输出
- 项目执行状态看板
- 各阶段任务完成/失败状态
- 最终输出文件路径

## 执行概要
0. **初始化** — 创建 `foxpre_projects` 记录，设置初始状态 `draft`
1. **分析阶段** — 调用 Analyzer 解析招标文件
2. **编写阶段** — Analyzer 完成后并行调用 TechWriter、BizWriter、QualWriter
3. **门禁阶段** — 三路编写完成后调用 HarnessRunner 执行审核
4. **样式检查** — 审核通过后调用 StyleChecker
5. **组装阶段** — 样式检查通过后调用 DocxAssembler 生成最终文件

## 状态流转

```
draft → analyzing → [tech-writing, biz-writing, qual-writing] (并行)
     → harness-ready → style-checking → assembling → completed
                                                ↘ failed（退回重写）
```

## 约束
- 依赖关系严格按任务依赖图执行，不可跳过步骤
- 门禁阶段不通过（HarnessRunner 返回 failedRules > 0）则标记为 `failed`，退回编写阶段
- 状态变更须写入 `foxpre_projects` 表
- 支持重新执行单个阶段（如仅重写技术方案）

## 技术上下文
- 状态机字段：`foxpre_projects.状态`（`待启动` → `进行中` → `等待审核` → `需修改` → `已完成`）
- 任务管理：`foxpre_agent_tasks` 表追踪每个 Agent 执行状态
- Agent 派遣：通过 `POST /api/runs` 创建 Agent 实例（当前阶段尚未实现，仅注释说明）
- 依赖图执行：严格按 DAG 执行，不可跳过 HarnessRunner 门禁
- 门禁门逻辑：`failedRules > 0` → 状态转为 `需修改`，退回编写阶段；`failedRules === 0` → 状态转为 `等待审核`

## 交互协议
- 与 BidderManager 交互：创建项目时读取投标人数据快照
- 故障恢复：`foxpre_agent_tasks.status` 的 `FAILED` 状态可触发重试

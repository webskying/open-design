---
name: foxpre-harness-runner
zh_name: "门禁审核执行器"
emoji: "🛡️"
description: "逐条检查、生成报告"
category: bid
od:
  mode: bid
  category: bid
---

# 门禁审核执行器（HarnessRunner）

## 输入
- 所有片段（fragments，Markdown 数组）
- 规则集（rules，来自 `apps/daemon/src/foxpre/harness-engine.ts` 的 `loadActiveRules`）

## 输出
- ReviewReport（审核结果报告，含逐条通过/失败状态）
- 写入 `foxpre_review_history` 表

## 执行概要
1. 调用 `loadActiveRules(db)` 获取所有启用的审核规则
2. 调用 `runFullHarness(db, projectId, fragments)` 执行逐条检查
3. 审核结果由 `generateReviewReport` 持久化到数据库
4. 更新 `foxpre_projects.current_review_round` 轮次号

## 约束
- 不得自行实现检查逻辑 — 必须调用 harness-engine 的 `runFullHarness`
- 输入 fragment 必须是通过 `document-pipeline.ts` 解析得到的合法结构
- 输出 ReviewReport 须包含 totalRules / failedRules / passedRules / detail
- 审核执行必须写入 `foxpre_review_history` 表，不得仅返回内存结果
- 技术约束：必须通过 `runFullHarness(db, projectId, fragments)` 调用，不得自行实现检查逻辑

## 技术上下文
- 核心技术依赖：`apps/daemon/src/foxpre/harness-engine.ts`
  - `loadActiveRules(db)` — 从 `foxpre_universal_harness_rules` 读取规则（12 条种子规则）
  - `runFullHarness(db, projectId, fragments)` — 批量审核（N fragments × M rules）
  - `generateReviewReport(db, projectId, report)` — 磁盘写入审核历史
- 五大类别：内容完整性、废标规避、格式一致性、合规性、质量
- 数据库写入：`foxpre_review_history`（原子写入）+ `foxpre_projects.当前审核轮次` 递增
- 门禁不通过时：不阻断下游（返回失败结果，由 Orchestrator 决策是否退回重写）

## 交互协议
- 上游：Orchestrator（调用 `runFullHarness`）
- 迭代协议：通过 `foxpre_projects.当前审核轮次` 实现多轮审核

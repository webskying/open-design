---
name: foxpre-harness-runner
description: 门禁审核执行器  逐条检查、生成报告
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

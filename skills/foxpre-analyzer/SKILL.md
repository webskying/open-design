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

# 招标文件分析器（Analyzer）

## 输入
- 招标文件片段（Markdown 格式）
- 投标人信息（可选）

## 输出
- 评分项清单（Markdown 表格）
- 资质条件摘要
- 技术规范清单

## 执行概要
1. 扫描所有片段，识别评分关键词（"评分"、"分值"、"得分"、"评审"等）
2. 提取资质条件（注册资金、认证要求、业绩门槛）
3. 整理技术规范要求
4. 输出结构化清单用于后续阶段

## 约束
- 不自行生成内容，仅从输入提取
- 对不确定的条目标注 "[需确认]"
- 输出必须为 Markdown 表格格式

## 技术上下文
- 输入来源：`document-pipeline.ts` 的 `parseDocument(filePath)` → `Fragment[]`
- 关键数据库表：`foxpre_projects`, `foxpre_document_fragments`
- 关键合同类型：`BidProjectMetadata` (来自 `@open-design/contracts`)
- 评分关键词识别集：`["评分", "分值", "得分", "评审", "评价"]`
- 资质条件识别：注册资金正则 `\d+[\s]*万元?`，认证关键词 `["ISO", "CMMI", "等保"]`
- 输出格式：Markdown 表格，结构化为后续 Writer 可直接引用的清单

## 交互协议
- 下游消费者：TechWriter, BizWriter, QualWriter（通过 Orchestrator 协调并行消费）
- 输出传递方式：分析结果写入 `foxpre_document_fragments` 表（作为分析碎片），Orchestrator 传递 `projectId`
- 消息格式：`{ 评分项: [], 资质条件: [], 技术规范: [], 废标点: [] }`（JSON 结构）

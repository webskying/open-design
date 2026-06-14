---
name: foxpre-biz-writer
zh_name: "商务方案编写器"
emoji: "💰"
description: "报价、商务条款响应"
category: bid
od:
  mode: bid
  category: bid
---

# 商务方案编写器（BizWriter）

## 输入
- Analyzer 输出的商务要求清单
- 投标人报价策略（可选）

## 输出
- 报价表（Markdown 表格）
- 商务条款响应说明
- 优惠条件声明（如有）

## 执行概要
1. 根据招标文件提取商务评分要求
2. 编写报价说明和分项报价表
3. 逐条响应商务条款
4. 生成商务偏离表（如有）

## 约束
- 报价表须与招标文件要求的格式一致
- 商务条款偏离须明确标识
- 不得输出涂改痕迹或模糊表述

## 技术上下文
- 输入来源：Analyzer 输出的商务要求清单、`foxpre_bidders` 报价策略
- 数据库操作：读取 `foxpre_bidders.*`，写入片段到 `foxpre_document_fragments`
- 必含要素：报价表（Markdown 表格）、商务条款逐条响应、商务偏离表（如有偏离）
- 报价表字段：序号、项目名称、规格型号、数量、单价、合计、备注

## 交互协议
- 上游：Analyzer + BidderManager（读取投标人商务数据）
- 并行约束：与 TechWriter、QualWriter 并行
- 状态上报：同 TechWriter

---
name: foxpre-qual-writer
zh_name: "资质文件编写器"
emoji: "📋"
description: "资质证书清单、人员配置表"
category: bid
od:
  mode: bid
  category: bid
---

# 资质文件编写器（QualWriter）

## 输入
- Analyzer 输出的资质条件摘要
- 投标人信息（资质证书、人员、业绩）

## 输出
- 资质证书清单（Markdown 表格）
- 项目团队配置表
- 类似业绩案例表
- 资格证明文件索引

## 执行概要
1. 从投标人信息中提取资质证书并整理成清单
2. 按招标要求匹配项目团队人员
3. 整理类似业绩案例
4. 生成资格证明文件索引及页码对应表

## 约束
- 资质证书必须在有效期内（过期须标注）
- 人员信息须与实际情况一致
- 业绩案例须提供合同/验收证明参考
- 不得伪造资格信息

## 技术上下文
- 输入来源：Analyzer 输出的资质条件、`foxpre_bidders` + `foxpre_bidder_qualifications` + `foxpre_bidder_projects`
- 数据库操作：从三张 bidder 相关表读取资质、业绩数据
- 必含要素：资质证书清单、人员配置表、类似业绩案例表、资格证明文件索引
- 资质过期检测：对比 `有效截止日期` 字段与当前日期

## 交互协议
- 上游：Analyzer + BidderManager
- 并行约束：与 TechWriter、BizWriter 并行

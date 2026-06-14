---
name: foxpre-bidder-manager
zh_name: "投标人管理器"
emoji: "🏢"
description: "投标人信息、资质证书、业绩案例"
category: bid
od:
  mode: bid
  category: bid
---

# 投标人管理器（BidderManager）

## 输入
- 招标文件中的投标人资格要求
- 手动录入的投标人基本信息

## 输出
- 投标人信息卡片（结构化 JSON）
- 资质证书清单与有效期跟踪
- 类似业绩案例库

## 执行概要
1. 创建/更新投标人档案（名称、统一社会信用代码、联系人等）
2. 维护资质证书清单（名称、发证机关、有效期）
3. 管理类似业绩案例（项目名称、合同金额、验收状态）
4. 提供资质到期预警

## 约束
- 投标人档案变更须保留历史记录
- 资质证书有效期须精确到日，过期自动标记
- 不得共享不同投标人的信息

## 技术上下文
- 管理表：`foxpre_bidders`（投标人信息）、`foxpre_bidder_qualifications`（资质证书）、`foxpre_bidder_projects`（业绩案例）
- 敏感字段加密：`统一社会信用代码`、`法人代表` 通过 `AES-256-GCM` 加密存储（阶段六实现 `field-crypto.ts`）
- 资质过期预警：`SELECT * FROM foxpre_bidder_qualifications WHERE 有效截止日期 < ?` 查询即将过期证书
- 快照模式：创建项目时一次性快照到 `foxpre_projects`，标书生成使用本地快照

## 交互协议
- 消费者：QualWriter（读取资质和业绩）、BizWriter（读取报价信息）
- 不参与主工作流 DAG——是支撑服务，按需被查询

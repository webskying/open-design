---
name: foxpre-orchestrator
description: 编排调度器  任务依赖管理、状态流转、看板更新
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

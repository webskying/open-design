---
name: foxpre-style-checker
zh_name: "样式合规检查器"
emoji: "🎨"
description: "字体/行距/页眉页脚统一"
category: bid
od:
  mode: bid
  category: bid
---

# 样式合规检查器（StyleChecker）

## 输入
- 待检查的文档片段（Markdown / DOCX 文本）
- 招标文件样式要求（格式要求章节）

## 输出
- 样式问题清单（Markdown 表格）
- 修正后的样式建议

## 执行概要
1. 检查字体类型和字号是否符合要求（如宋体/仿宋、小四号等）
2. 检查行距、段间距是否统一
3. 检查页眉页脚内容是否一致
4. 检查标题编号层级是否连续
5. 输出所有样式问题并提供修正建议

## 约束
- 仅检查样式合规性，不涉及内容审核
- 页眉页脚问题只在 DOCX 阶段可修正，Markdown 阶段仅提示
- 输出须按严重程度排序（致命/严重/轻微）

## 技术上下文
- 输入来源：待检查的文档片段（`foxpre_document_fragments`）+ `foxpre_style_templates` 格式规范
- 检查项目：字体类型/字号、行距/段间距、页眉页脚一致性、标题编号层级连续性
- 格式规范来源：`StyleTemplate.formatSpec` JSON 字段
- 严重级别：致命（格式不符合招标要求）> 严重（正文格式不一致）> 轻微（建议性优化）
- 约束：仅检查样式，不涉及内容审核（内容归 HarnessRunner 管）

## 交互协议
- 上游：HarnessRunner（门禁通过后触发，由 Orchestrator 协调）
- 并行约束：与 DocxAssembler 串行（样式检查组在前，组装在后）

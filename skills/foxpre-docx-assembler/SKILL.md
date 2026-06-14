---
name: foxpre-docx-assembler
zh_name: "DOCX 组装器"
emoji: "📄"
description: "合并片段、应用样式模板、生成最终文件"
category: bid
od:
  mode: bid
  category: bid
---

# DOCX 组装器（DocxAssembler）

## 输入
- 所有已审核通过的文档片段（Markdown 数组）
- 样式模板（.docx 模板文件路径）

## 输出
- 合并后的完整标书（.docx 文件）
- 页码目录自动生成

## 执行概要
1. 按照投标文件结构（商务/技术/资质）排列片段
2. 合并所有 Markdown 片段为完整文档
3. 应用样式模板（字体、页眉页脚、样式集）
4. 生成目录和页码
5. 输出最终 .docx 文件

## 约束
- 样式模板必须预先定义并存在于设计系统
- 所有片段必须是 HarnessRunner 审核通过的状态
- 不得修改片段的实质性内容，仅做排版和样式应用
- 输出目录必须包含自动页码

## 技术上下文
- 输入来源：所有已审核通过的片段（从 `foxpre_document_fragments` 读取）+ `foxpre_style_templates.templatePath` (空白 DOCX 模板)
- 组装顺序：封面 → 商务方案 → 技术方案 → 资质文件 → 附件
- 关键操作：Pandoc 拼接 Markdown → 应用模板样式 → 生成目录 → 插入页码
- Fragment 排序：按 `orderIndex` 升序排列
- 约束：不得修改已审核片段内容（HarnessRunner 通过后锁定），仅做排版和样式

## 交互协议
- 上游：StyleChecker（样式检查通过后触发）
- 串行约束：必须是工作流的最后一步

/**
 * foxpre 文档处理管线
 *
 * 功能：
 * 1. parseDocument — 调用 Pandoc 将 DOCX/PDF 转换为 Markdown，按 ## 标题分节
 * 2. importDocument — 将分节后的片段原子写入 foxpre_document_fragments 表
 *
 * 技术约束：
 * - 使用 child_process.execFile 调用 pandoc（同步版 execFileSync），不使用第三方 npm 包
 * - Fragment id 使用 crypto.randomUUID()
 * - 文件路径使用 path.resolve() 确保跨平台
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

/** 文档片段（与 foxpre_document_fragments 表结构对应） */
export interface Fragment {
  id: string;
  /** ## 标题文本（不含 ## 前缀） */
  sectionTitle: string;
  /** 片段 Markdown 内容（含 ## 标题行） */
  contentMd: string;
  /** 在文档中的顺序（从 0 递增） */
  orderIndex: number;
}

/** 支持的文档扩展名列表 */
const SUPPORTED_EXTENSIONS = ['.docx', '.pdf'] as const;

/**
 * 检测 Pandoc 是否可用。
 */
function isPandocAvailable(): boolean {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 调用 Pandoc 将文档转换为 Markdown。
 *
 * @param filePath - 文档文件绝对路径
 * @returns Markdown 字符串
 */
function convertToMarkdown(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  try {
    const stdout = execFileSync('pandoc', [resolvedPath, '-t', 'markdown', '--wrap', 'none'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });
    return stdout;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string; status?: number };
    // Pandoc 未安装 → ENOENT
    if (error.code === 'ENOENT') {
      throw new Error(
        'Pandoc not found. Install with: https://pandoc.org/installing.html',
      );
    }
    // Pandoc 转换失败（例如 PDF 需要 pdftotext）
    if (error.status !== undefined) {
      const detail = error.stderr ? error.stderr.trim() : `exit code ${error.status}`;
      throw new Error(`Pandoc conversion failed: ${detail}`);
    }
    throw error;
  }
}

/**
 * 将 Markdown 按 ## 标题拆分为片段。
 *
 * - 第一个 ## 之前的内容作为『前言』片段
 * - 每个 ## 标题作为新片段的开始
 * - 片段的 contentMd 包含 ## 标题行本身
 */
function splitIntoFragments(markdown: string): Fragment[] {
  const lines = markdown.split('\n');
  const fragments: Fragment[] = [];

  let currentTitle = '前言';
  let currentContent: string[] = [];
  let orderIndex = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // 保存前一个片段（跳过开头的空前言）
      if (currentContent.length > 0 || fragments.length > 0) {
        fragments.push({
          id: crypto.randomUUID(),
          sectionTitle: currentTitle,
          contentMd: currentContent.join('\n').trim(),
          orderIndex,
        });
        orderIndex++;
      }
      currentTitle = line.replace(/^##\s+/, '').replace(/\r$/, '');
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }

  // 最后一个片段
  if (currentContent.length > 0) {
    fragments.push({
      id: crypto.randomUUID(),
      sectionTitle: currentTitle,
      contentMd: currentContent.join('\n').trim(),
      orderIndex,
    });
  }

  return fragments;
}

/**
 * 解析文档文件，按 ## 标题分节。
 *
 * @param filePath - 文档文件路径（DOCX 或 PDF）
 * @returns Fragment[] — 按顺序排列的文档片段
 * @throws {Error} 不支持的文件类型
 * @throws {Error} Pandoc 未安装
 * @throws {Error} Pandoc 转换失败
 */
export function parseDocument(filePath: string): Fragment[] {
  const ext = path.extname(filePath).toLowerCase() as typeof SUPPORTED_EXTENSIONS[number];

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file type: ${ext}. Only .docx and .pdf are supported.`,
    );
  }

  if (!isPandocAvailable()) {
    throw new Error(
      'Pandoc not found. Install with: https://pandoc.org/installing.html',
    );
  }

  const markdown = convertToMarkdown(filePath);
  return splitIntoFragments(markdown);
}

/**
 * 将 Fragment[] 原子写入 foxpre_document_fragments 表。
 *
 * - 使用 db.transaction() 包裹批量 INSERT
 * - 重复调用时先 DELETE 该项目的旧片段再 INSERT（幂等）
 * - sectionTitle 保存在 Fragment 的内存对象中，不单独写入 DB 列
 *
 * @param db - better-sqlite3 数据库实例
 * @param projectId - 投标项目 ID
 * @param fragments - 文档片段数组
 */
export function importDocument(
  db: SqliteDb,
  projectId: string,
  fragments: Fragment[],
): void {
  const now = Date.now();

  const insertBatch = db.transaction(() => {
    // 先删除旧片段
    db.prepare('DELETE FROM foxpre_document_fragments WHERE project_id = ?').run(
      projectId,
    );

    // 批量插入新片段
    const stmt = db.prepare(
      `INSERT INTO foxpre_document_fragments
         (id, project_id, fragment_type, content_md, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const frag of fragments) {
      stmt.run(
        frag.id,
        projectId,
        'section',
        frag.contentMd,
        frag.orderIndex,
        now,
        now,
      );
    }
  });

  insertBatch();
}

/**
 * foxpre 文档处理管线测试
 *
 * 测试规格（7 个用例）：
 * 1. DOCX → Markdown 转换：创建最小 .docx 文件，验证 parseDocument 返回非空 Fragment[]
 * 2. PDF → Markdown 转换：如果 Pandoc + pdftotext 可用，验证 PDF 解析
 * 3. Fragment 分节正确：验证 ## 标题被正确识别为分节边界
 * 4. order_index 递增：验证返回的 Fragment 数组 order_index 从 0 递增
 * 5. importDocument 原子写入：验证插入后 foxpre_document_fragments 表记录数正确
 * 6. importDocument 幂等：两次调用 importDocument 不产生重复记录
 * 7. Pandoc 未安装时错误：模拟 Pandoc 不可1，验证抛出明确错误信息
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initFoxpreDatabase } from '../../src/foxpre/db.js';
import {
  type Fragment,
  importDocument,
  parseDocument,
} from '../../src/foxpre/document-pipeline.js';

type SqliteDb = Database.Database;

/** 检查 Pandoc 是否可用 */
function pandocAvailable(): boolean {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_PANDOC = pandocAvailable();

describe('foxpre document pipeline', () => {
  let tempDir: string;
  let dbPath: string;
  let db: SqliteDb;

  beforeAll(() => {
    // 验证测试环境
    if (!HAS_PANDOC) {
      console.warn('⚠ Pandoc 未安装，跳过需要 Pandoc 的测试用例');
    }
  });

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'foxpre-doc-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initFoxpreDatabase(db);
  });

  /** 创建测试用项目行，满足 foxpre_document_fragments 外键约束 */
  function createTestProject(projectId: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO foxpre_projects (id, name, 状态, created_at, updated_at)
       VALUES (?, ?, '待启动', ?, ?)`,
    ).run(projectId, '测试项目', Date.now(), Date.now());
  }

  afterEach(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      // ignore
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows WAL 锁可能短暂存在
    }
  });

  /** 创建测试用 .docx 文件 */
  function createTestDocx(
    markdown: string,
    fileName = 'test.docx',
  ): string {
    const mdPath = path.join(tempDir, 'input.md');
    const docxPath = path.join(tempDir, fileName);
    writeFileSync(mdPath, markdown, 'utf-8');
    execFileSync('pandoc', [mdPath, '-o', docxPath], {
      stdio: 'ignore',
    });
    return docxPath;
  }

  /** 创建测试用 .pdf 文件（需要 pdftotext） */
  function createTestPdf(
    markdown: string,
    fileName = 'test.pdf',
  ): string {
    const mdPath = path.join(tempDir, 'input.md');
    const docxPath = path.join(tempDir, '_intermediate.docx');
    const pdfPath = path.join(tempDir, fileName);
    writeFileSync(mdPath, markdown, 'utf-8');
    // Markdown → DOCX → PDF（两步转换）
    execFileSync('pandoc', [mdPath, '-o', docxPath], { stdio: 'ignore' });
    execFileSync('pandoc', [docxPath, '-o', pdfPath], { stdio: 'ignore' });
    return pdfPath;
  }

  /** 检查 pdftotext 是否已安装 */
  function pdftotextAvailable(): boolean {
    try {
      execFileSync('pdftotext', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // ─── 用例 1：DOCX → Markdown ─────────────────────────────────

  it('1. DOCX → Markdown 转换：解析 .docx 返回非空 Fragment[]', () => {
    if (!HAS_PANDOC) {
      console.warn('跳过：Pandoc 不可用');
      return;
    }

    const docxPath = createTestDocx(
      '# 测试文档\n\n## 第一章\n这是第一章的内容。\n\n## 第二章\n这是第二章的内容。',
    );

    const fragments = parseDocument(docxPath);
    expect(fragments.length).toBeGreaterThan(0);
    for (const frag of fragments) {
      expect(frag.id).toBeTruthy();
      expect(typeof frag.sectionTitle).toBe('string');
      expect(typeof frag.contentMd).toBe('string');
      expect(typeof frag.orderIndex).toBe('number');
    }
  });

  // ─── 用例 2：PDF → Markdown ─────────────────────────────────

  it('2. PDF → Markdown 转换：如果 pandoc + pdftotext 可用，解析 PDF', () => {
    if (!HAS_PANDOC || !pdftotextAvailable()) {
      console.warn('跳过：Pandoc 或 pdftotext 不可用');
      return;
    }

    const pdfPath = createTestPdf(
      '# PDF 测试\n\n## 第一章节\nPDF 内容。\n\n## 第二章节\n更多内容。',
    );

    const fragments = parseDocument(pdfPath);
    expect(fragments.length).toBeGreaterThan(0);
    // 应至少有两个 ## 分节
    const sectionTitles = fragments.map((f) => f.sectionTitle);
    expect(sectionTitles).toContain('第一章节');
    expect(sectionTitles).toContain('第二章节');
  });

  // ─── 用例 3：Fragment 分节 ─────────────────────────────────

  it('3. Fragment 分节正确：## 标题被正确识别为分节边界', () => {
    if (!HAS_PANDOC) {
      console.warn('跳过：Pandoc 不可用');
      return;
    }

    const docxPath = createTestDocx(
      '前言内容段落。\n\n## 需求概述\n需求内容。\n\n## 技术方案\n技术方案内容。\n\n## 实施计划\n实施计划内容。',
    );

    const fragments = parseDocument(docxPath);
    const titles = fragments.map((f) => f.sectionTitle);

    expect(titles).toContain('前言');
    expect(titles).toContain('需求概述');
    expect(titles).toContain('技术方案');
    expect(titles).toContain('实施计划');
    expect(fragments.length).toBe(4);
  });

  // ─── 用例 4：order_index 递增 ─────────────────────────────────

  it('4. order_index 递增：返回的 Fragment order_index 从 0 递增', () => {
    if (!HAS_PANDOC) {
      console.warn('跳过：Pandoc 不可用');
      return;
    }

    const docxPath = createTestDocx(
      '## A\n内容A\n## B\n内容B\n## C\n内容C',
    );

    const fragments = parseDocument(docxPath);
    for (let i = 0; i < fragments.length; i++) {
      expect(fragments[i]!.orderIndex).toBe(i);
    }
  });

  // ─── 用例 5：importDocument 原子写入 ─────────────────────────

  it('5. importDocument 原子写入：插入后 foxpre_document_fragments 记录数正确', () => {
    if (!HAS_PANDOC) {
      console.warn('跳过：Pandoc 不可用');
      return;
    }

    const docxPath = createTestDocx('## 第一章\n内容\n## 第二章\n内容\n## 第三章\n内容');
    const fragments = parseDocument(docxPath);
    const projectId = 'test-project-5';

    createTestProject(projectId);
    importDocument(db, projectId, fragments);

    const rows = db
      .prepare('SELECT COUNT(*) AS cnt FROM foxpre_document_fragments WHERE project_id = ?')
      .get(projectId) as { cnt: number };

    expect(rows.cnt).toBe(fragments.length);
  });

  // ─── 用例 6：importDocument 幂等 ─────────────────────────

  it('6. importDocument 幂等：两次调用不产生重复记录', () => {
    if (!HAS_PANDOC) {
      console.warn('跳过：Pandoc 不可用');
      return;
    }

    const docxPath = createTestDocx('## 唯一章节\n内容。');
    const fragments = parseDocument(docxPath);
    const projectId = 'test-project-6';

    createTestProject(projectId);
    // 第一次写入
    importDocument(db, projectId, fragments);
    const count1 = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM foxpre_document_fragments WHERE project_id = ?')
        .get(projectId) as { cnt: number }
    ).cnt;

    // 第二次写入（幂等）
    importDocument(db, projectId, fragments);
    const count2 = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM foxpre_document_fragments WHERE project_id = ?')
        .get(projectId) as { cnt: number }
    ).cnt;

    expect(count1).toBe(fragments.length);
    expect(count2).toBe(fragments.length);
    expect(count2).toBe(count1);
  });

  // ─── 用例 7：Pandoc 未安装时错误 ─────────────────────────

  it('7. Pandoc 不可用时抛出明确错误信息', () => {
    // 模拟 Pandoc 不可用：临时修改 PATH 为空
    const originalPath = process.env.PATH;
    const originalPandocPath = process.env.PANDOC_PATH;

    try {
      // 清除 PATH，让 execFileSync 找不到 pandoc
      process.env.PATH = '';
      // 仅对当前用例生效
      const hasPandoc = (() => {
        try {
          execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      })();

      if (hasPandoc) {
        // Windows 上 PATH 清除可能不生效（pandoc 在 System32）
        console.warn('跳过：无法通过清除 PATH 模拟 Pandoc 不可用');
        return;
      }

      expect(() => parseDocument(path.join(tempDir, 'test.docx'))).toThrow(
        /Pandoc not found/i,
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

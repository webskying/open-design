/**
 * foxpre 门禁审核引擎测试
 *
 * 测试规格（8 个用例）：
 * 1. 内容完整性 — 所有必填章节齐全时 passed=true
 * 2. 内容完整性 — 缺少必填章节时 passed=false，detail 说明缺失项
 * 3. 废标规避 — 检测到过期日期时 passed=false
 * 4. 废标规避 — 资质证书在有效期内时 passed=true
 * 5. 格式一致性 — 字数/行数不足时 passed=false
 * 6. 质量 — 重复段落检测 passed=false
 * 7. 空文档输入 — 不崩溃，返回有意义结果
 * 8. 生成审核报告 — 验证 ReviewReport 写入 foxpre_review_history 表
 */

import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initFoxpreDatabase } from '../../src/foxpre/db.js';
import type { Fragment } from '../../src/foxpre/document-pipeline.js';
import {
  type HarnessRule,
  checkFragment,
  generateReviewReport,
  loadActiveRules,
  runFullHarness,
  runHarness,
} from '../../src/foxpre/harness-engine.js';

type SqliteDb = Database.Database;

/** 创建测试用 HarnessRule（覆盖全部 5 个类别） */
function makeRule(
  id: string,
  name: string,
  category: string,
): HarnessRule {
  return {
    id,
    name,
    category,
    description: '',
    checkFnHint: '',
    priority: 5,
    isActive: 1,
  };
}

/** 创建测试用 Fragment */
function makeFragment(
  sectionTitle: string,
  contentMd: string,
  orderIndex = 0,
): Fragment {
  return { id: crypto.randomUUID(), sectionTitle, contentMd, orderIndex };
}

describe('foxpre harness engine', () => {
  let tempDir: string;
  let dbPath: string;
  let db: SqliteDb;
  const projectId = 'test-harness-project';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'foxpre-harness-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 初始化数据库（含 12 条种子规则）
    initFoxpreDatabase(db);

    // 创建测试项目行（满足外键约束）
    db.prepare(
      `INSERT OR IGNORE INTO foxpre_projects (id, name, 状态, created_at, updated_at)
       VALUES (?, ?, '待启动', ?, ?)`,
    ).run(projectId, '门禁测试项目', Date.now(), Date.now());
  });

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
      // Windows WAL lock
    }
  });

  // ─── 用例 1：内容完整性 — 通过 ─────────────────────────

  it('1. 内容完整性 — 所有必填章节齐全时 passed=true', () => {
    const rule = makeRule('rule-content-01', '所有必填章节齐全', '内容完整性');
    const frag = makeFragment(
      '技术方案',
      '## 技术方案\n\n封面：投标项目\n报价：100万元\n技术方案：详细描述\n资质：ISO认证\n承诺：按期交付',
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(true);
    expect(result.detail).toContain('已覆盖');
  });

  // ─── 用例 2：内容完整性 — 失败 ─────────────────────────

  it('2. 内容完整性 — 缺少必填章节时 passed=false', () => {
    const rule = makeRule('rule-content-01', '所有必填章节齐全', '内容完整性');
    const frag = makeFragment(
      '简介',
      '## 简介\n这是一个简短的介绍，不包含任何必填章节关键词。',
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('缺少');
  });

  // ─── 用例 3：废标规避 — 过期日期检出 ─────────────────

  it('3. 废标规避 — 检测到过期日期时 passed=false', () => {
    const rule = makeRule('rule-reject-01', '无过期资质证书', '废标规避');
    const frag = makeFragment(
      '资质证书',
      '## 资质证书\n\nISO 9001 认证有效期至 2020年12月31日。',
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('过期');
  });

  // ─── 用例 4：废标规避 — 有效期内 ─────────────────────

  it('4. 废标规避 — 资质证书在有效期内时 passed=true', () => {
    const rule = makeRule('rule-reject-01', '无过期资质证书', '废标规避');
    // 使用一个遥远的未来日期
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    const futureStr = `${farFuture.getFullYear()}年${farFuture.getMonth() + 1}月${farFuture.getDate()}日`;

    const frag = makeFragment(
      '资质证书',
      `## 资质证书\n\nISO 9001 认证有效期至 ${futureStr}。`,
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(true);
  });

  // ─── 用例 5：格式一致性 — 字数不足 ──────────────────

  it('5. 格式一致性 — 字数/行数不足时 passed=false', () => {
    const rule = makeRule('rule-format-01', '封面信息与正文一致', '格式一致性');
    const frag = makeFragment(
      '简短',
      '## 简短\n少',
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('内容过短');
  });

  // ─── 用例 6：质量 — 重复段落检测 ────────────────────

  it('6. 质量 — 重复段落检测 passed=false', () => {
    const rule = makeRule('rule-quality-01', '无错别字/病句/格式错乱', '质量');
    const frag = makeFragment(
      '重复内容',
      '## 重复内容\n\n这是一段重复的内容。\n这是一段重复的内容。\n这是不同的内容。',
    );

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('重复段落');
  });

  // ─── 用例 7：空文档输入 — 不崩溃 ────────────────────

  it('7. 空文档输入 — 不崩溃，返回有意义的结果', () => {
    const contentRule = makeRule('rule-content-01', '所有必填章节齐全', '内容完整性');

    // 空文档
    const emptyFragments: Fragment[] = [];

    // 验证 runHarness 不崩溃
    const report = runHarness(db, projectId, [contentRule], emptyFragments);
    expect(report.projectId).toBe(projectId);
    expect(report.results).toEqual([]);
    expect(report.round).toBeGreaterThanOrEqual(1);

    // 验证空 fragment 列表下 checkFragment 返回空结果
    // 验证 generateReviewReport 不崩溃
    const summary = generateReviewReport(db, projectId, report);
    expect(summary.totalRules).toBe(0);
    expect(summary.passedRules).toBe(0);
    expect(summary.failedRules).toBe(0);
  });

  // ─── 用例 8：生成审核报告 — 写入 foxpre_review_history ─────

  it('8. 生成审核报告 — 验证写入 foxpre_review_history 表', () => {
    const rules = [
      makeRule('rule-content-01', '所有必填章节齐全', '内容完整性'),
      makeRule('rule-reject-01', '无过期资质证书', '废标规避'),
    ];

    const fragments = [
      makeFragment('技术方案', '## 技术方案\n\n封面：项目名称\n报价：100万元\n技术方案：详细描述\n资质：ISO9001认证\n承诺：按期交付'),
      makeFragment('资质证书', '## 资质证书\n\n封面：项目名称\n报价：已包含\n技术方案：已描述\n资质：ISO9001认证\n承诺：保证\n有效期至2099年12月31日。'),
    ];

    const report = runHarness(db, projectId, rules, fragments);
    const summary = generateReviewReport(db, projectId, report);

    // 验证摘要
    expect(summary.totalRules).toBe(4); // 2 rules × 2 fragments
    expect(summary.failedRules).toBe(0);
    expect(summary.passedRules).toBe(4);
    expect(summary.detail).toBeTruthy();

    // 验证写入 foxpre_review_history
    const historyRows = db
      .prepare(
        'SELECT id, project_id, round, passed, comments_json, created_at FROM foxpre_review_history WHERE project_id = ? ORDER BY created_at DESC',
      )
      .all(projectId) as Array<{
      id: string;
      project_id: string;
      round: number;
      passed: number;
      comments_json: string;
      created_at: number;
    }>;

    expect(historyRows.length).toBe(1);
    expect(historyRows[0]!.project_id).toBe(projectId);
    expect(historyRows[0]!.round).toBe(1);
    expect(historyRows[0]!.passed).toBe(1); // 所有检查通过
    expect(historyRows[0]!.comments_json).toBeTruthy();

    // 验证 JSON 内容可解析
    const parsedResults = JSON.parse(historyRows[0]!.comments_json);
    expect(Array.isArray(parsedResults)).toBe(true);
    expect(parsedResults.length).toBe(4);

    // 验证项目轮次已递增
    const project = db
      .prepare('SELECT 当前审核轮次 FROM foxpre_projects WHERE id = ?')
      .get(projectId) as { 当前审核轮次: number };
    expect(project.当前审核轮次).toBe(1);
  });

  // ─── 额外：loadActiveRules 从种子数据加载 ────────────

  it('loadActiveRules 从种子数据加载 12 条规则', () => {
    const rules = loadActiveRules(db);
    expect(rules.length).toBe(12);

    // 验证所有类别覆盖
    const categories = [...new Set(rules.map((r) => r.category))];
    expect(categories).toContain('内容完整性');
    expect(categories).toContain('废标规避');
    expect(categories).toContain('格式一致性');
    expect(categories).toContain('合规性');
    expect(categories).toContain('质量');

    // 验证按 priority 降序排列
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1]!.priority).toBeGreaterThanOrEqual(rules[i]!.priority);
    }
  });

  // ─── 额外：不同类别的未知子规则不崩溃 ───────────────

  it('未知子规则 passed=true 且 detail 可读', () => {
    const rule = makeRule('unknown-rule', '未知规则', '内容完整性');
    const frag = makeFragment('测试', '## 测试\n内容');

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(true);
    // 未知子规则应返回 "未知子规则"
    expect(result.detail).toBe('未知子规则');
  });

  // ─── 额外：未知类别不崩溃 ─────────────────────────

  it('未知规则类别 passed=true 且跳过检查', () => {
    const rule = makeRule('new-category-rule', '新类别', '未知类别');
    const frag = makeFragment('测试', '## 测试\n内容');

    const result = checkFragment(frag, rule);
    expect(result.passed).toBe(true);
    expect(result.detail).toContain('未知规则类别');
  });
});

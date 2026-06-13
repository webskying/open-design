// foxpre 数据库模块测试
//
// 测试要求：
// - 所有 11 张表创建成功
// - 每张表的列名和类型正确
// - 外键约束生效
// - 索引已创建
// - 种子数据正确插入（12 条规则 + 4 套模板）
// - 迁移版本记录正确
// - 重复调用 initFoxpreDatabase 不产生错误（幂等）

import { mkdtempSync } from 'node:fs';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initFoxpreDatabase } from '../../src/foxpre/db.js';

type SqliteDb = Database.Database;

/** 列出指定表的所有列信息（列名、类型、是否 NOT NULL、默认值） */
function tableColumns(db: SqliteDb, tableName: string): Array<{
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}> {
  return db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
}

/** 列出指定表上的所有索引 */
function tableIndexes(db: SqliteDb, tableName: string): Array<{
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}> {
  return db.prepare(`PRAGMA index_list("${tableName}")`).all() as Array<{
    seq: number;
    name: string;
    unique: number;
    origin: string;
    partial: number;
  }>;
}

describe('initFoxpreDatabase', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'foxpre-db-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows 上 WAL 文件锁可能短暂存在，忽略清理错误
    }
  });

  function createFreshDb(): SqliteDb {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  }

  function closeFreshDb(db: SqliteDb): void {
    // 先强制刷新 WAL，使 Windows 文件锁释放
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  }

  describe('表创建', () => {
    it('创建所有 11 张 foxpre_ 表', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const tables: Array<{ name: string }> = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'foxpre_%' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('foxpre_projects');
      expect(tableNames).toContain('foxpre_agent_tasks');
      expect(tableNames).toContain('foxpre_document_fragments');
      expect(tableNames).toContain('foxpre_review_history');
      expect(tableNames).toContain('foxpre_bidders');
      expect(tableNames).toContain('foxpre_bidder_qualifications');
      expect(tableNames).toContain('foxpre_bidder_projects');
      expect(tableNames).toContain('foxpre_project_references');
      expect(tableNames).toContain('foxpre_style_templates');
      expect(tableNames).toContain('foxpre_universal_harness_rules');
      expect(tableNames).toContain('foxpre_migrations');
      expect(tableNames.length).toBe(11);

      closeFreshDb(db);
    });

    it('每张表包含正确的列', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      // foxpre_projects 表列检查
      const projectsCols = tableColumns(db, 'foxpre_projects');
      const projectsNames = projectsCols.map((c) => c.name);
      expect(projectsNames).toContain('id');
      expect(projectsNames).toContain('name');
      expect(projectsNames).toContain('description');
      expect(projectsNames).toContain('招标编号');
      expect(projectsNames).toContain('投标人ID');
      expect(projectsNames).toContain('样式模板ID');
      expect(projectsNames).toContain('引用项目ID列表_json');
      expect(projectsNames).toContain('状态');
      expect(projectsNames).toContain('当前审核轮次');
      expect(projectsNames).toContain('created_at');
      expect(projectsNames).toContain('updated_at');
      // 主键
      expect(projectsCols.find((c) => c.name === 'id')?.pk).toBe(1);

      // foxpre_agent_tasks 表列检查
      const taskCols = tableColumns(db, 'foxpre_agent_tasks');
      const taskNames = taskCols.map((c) => c.name);
      expect(taskNames).toContain('project_id');
      expect(taskNames).toContain('agent_code');
      expect(taskNames).toContain('status');
      expect(taskNames).toContain('depends_on_json');
      expect(taskNames).toContain('commit_sha');
      expect(taskNames).toContain('output_path');
      expect(taskNames).toContain('error_log');

      // foxpre_document_fragments 表列检查
      const fragCols = tableColumns(db, 'foxpre_document_fragments');
      const fragNames = fragCols.map((c) => c.name);
      expect(fragNames).toContain('task_id');
      expect(fragNames).toContain('fragment_type');
      expect(fragNames).toContain('content_md');
      expect(fragNames).toContain('order_index');

      // foxpre_bidders 表列检查（含加密字段）
      const bidderCols = tableColumns(db, 'foxpre_bidders');
      const bidderNames = bidderCols.map((c) => c.name);
      expect(bidderNames).toContain('统一社会信用代码_enc');
      expect(bidderNames).toContain('法人代表_enc');
      expect(bidderNames).toContain('联系电话_enc');

      // foxpre_review_history 表列检查
      const reviewCols = tableColumns(db, 'foxpre_review_history');
      const reviewNames = reviewCols.map((c) => c.name);
      expect(reviewNames).toContain('round');
      expect(reviewNames).toContain('passed');
      expect(reviewNames).toContain('comments_json');

      // foxpre_bidder_qualifications 表列检查
      const qualCols = tableColumns(db, 'foxpre_bidder_qualifications');
      const qualNames = qualCols.map((c) => c.name);
      expect(qualNames).toContain('cert_name');
      expect(qualNames).toContain('cert_number');
      expect(qualNames).toContain('issue_date');
      expect(qualNames).toContain('expiry_date');

      // foxpre_bidder_projects 表列检查
      const bidProjCols = tableColumns(db, 'foxpre_bidder_projects');
      const bidProjNames = bidProjCols.map((c) => c.name);
      expect(bidProjNames).toContain('project_name');
      expect(bidProjNames).toContain('amount');
      expect(bidProjNames).toContain('start_date');
      expect(bidProjNames).toContain('end_date');

      // foxpre_project_references 表列检查
      const refCols = tableColumns(db, 'foxpre_project_references');
      const refNames = refCols.map((c) => c.name);
      expect(refNames).toContain('od_project_id');
      expect(refNames).toContain('reference_type');
      expect(refNames).toContain('description_md');

      // foxpre_style_templates 表列检查
      const styleCols = tableColumns(db, 'foxpre_style_templates');
      const styleNames = styleCols.map((c) => c.name);
      expect(styleNames).toContain('template_path');
      expect(styleNames).toContain('format_spec_json');
      expect(styleNames).toContain('is_builtin');

      // foxpre_universal_harness_rules 表列检查
      const ruleCols = tableColumns(db, 'foxpre_universal_harness_rules');
      const ruleNames = ruleCols.map((c) => c.name);
      expect(ruleNames).toContain('check_fn_hint');
      expect(ruleNames).toContain('priority');
      expect(ruleNames).toContain('is_active');

      // foxpre_migrations 表列检查
      const migCols = tableColumns(db, 'foxpre_migrations');
      const migNames = migCols.map((c) => c.name);
      expect(migNames).toContain('version');
      expect(migNames).toContain('name');
      expect(migNames).toContain('applied_at');
      expect(migCols.find((c) => c.name === 'version')?.pk).toBe(1);

      closeFreshDb(db);
    });
  });

  describe('索引', () => {
    it('foxpre_agent_tasks 表有 project_id 索引', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const indexes = tableIndexes(db, 'foxpre_agent_tasks');
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_agent_tasks_project');

      closeFreshDb(db);
    });

    it('foxpre_document_fragments 表有 project_id 索引', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const indexes = tableIndexes(db, 'foxpre_document_fragments');
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_doc_fragments_project');

      closeFreshDb(db);
    });

    it('foxpre_bidder_qualifications 表有 bidder_id 索引', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const indexes = tableIndexes(db, 'foxpre_bidder_qualifications');
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_qualifications_bidder');

      closeFreshDb(db);
    });

    it('foxpre_bidder_projects 表有 bidder_id 索引', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const indexes = tableIndexes(db, 'foxpre_bidder_projects');
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_bidder_projects_bidder');

      closeFreshDb(db);
    });

    it('foxpre_project_references 表有 bid_project_id 索引', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const indexes = tableIndexes(db, 'foxpre_project_references');
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_refs_bid_project');

      closeFreshDb(db);
    });
  });

  describe('外键约束', () => {
    it('foxpre_agent_tasks 的 project_id 外键生效（拒绝孤儿记录）', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_agent_tasks (id, project_id, agent_code, status, created_at, updated_at) VALUES ('t1', 'nonexistent', 'Analyzer', '排队中', 1, 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });

    it('foxpre_bidder_qualifications 的 bidder_id 外键生效', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_bidder_qualifications (id, bidder_id, cert_name, created_at) VALUES ('q1', 'nonexistent', 'Cert', 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });

    it('foxpre_document_fragments 的 project_id 外键生效', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_document_fragments (id, project_id, fragment_type, content_md, order_index, created_at, updated_at) VALUES ('f1', 'nonexistent', 'section', '', 0, 1, 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });

    it('foxpre_review_history 的 project_id 外键生效', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_review_history (id, project_id, round, passed, created_at) VALUES ('r1', 'nonexistent', 1, 1, 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });

    it('foxpre_bidder_projects 的 bidder_id 外键生效', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_bidder_projects (id, bidder_id, project_name, created_at) VALUES ('bp1', 'nonexistent', 'Project', 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });

    it('foxpre_project_references 的 bid_project_id 外键生效', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      expect(() => {
        db.prepare(
          "INSERT INTO foxpre_project_references (id, bid_project_id, od_project_id, reference_type, created_at) VALUES ('ref1', 'nonexistent', 'od-p1', 'prototype', 1)",
        ).run();
      }).toThrow();

      closeFreshDb(db);
    });
  });

  describe('种子数据', () => {
    it('插入 4 套内置样式模板', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const templates = db.prepare(
        "SELECT id, name, description, template_path, is_builtin FROM foxpre_style_templates WHERE is_builtin = 1 ORDER BY id",
      ).all() as Array<{ id: string; name: string; description: string; template_path: string; is_builtin: number }>;

      expect(templates.length).toBe(4);
      expect(templates.map((t) => t.id)).toContain('template-gov');
      expect(templates.map((t) => t.id)).toContain('template-biz');
      expect(templates.map((t) => t.id)).toContain('template-tech');
      expect(templates.map((t) => t.id)).toContain('template-comprehensive');
      // is_builtin 标记正确
      for (const tpl of templates) {
        expect(tpl.is_builtin).toBe(1);
      }

      closeFreshDb(db);
    });

    it('插入 12 条通用门禁规则', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const rules = db.prepare(
        "SELECT id, name, category, priority, is_active FROM foxpre_universal_harness_rules ORDER BY id",
      ).all() as Array<{ id: string; name: string; category: string; priority: number; is_active: number }>;

      expect(rules.length).toBe(12);
      expect(rules.map((r) => r.id)).toContain('rule-format-01');
      expect(rules.map((r) => r.id)).toContain('rule-format-02');
      expect(rules.map((r) => r.id)).toContain('rule-format-03');
      expect(rules.map((r) => r.id)).toContain('rule-content-01');
      expect(rules.map((r) => r.id)).toContain('rule-content-02');
      expect(rules.map((r) => r.id)).toContain('rule-content-03');
      expect(rules.map((r) => r.id)).toContain('rule-reject-01');
      expect(rules.map((r) => r.id)).toContain('rule-reject-02');
      expect(rules.map((r) => r.id)).toContain('rule-reject-03');
      expect(rules.map((r) => r.id)).toContain('rule-compliance-01');
      expect(rules.map((r) => r.id)).toContain('rule-compliance-02');
      expect(rules.map((r) => r.id)).toContain('rule-quality-01');

      // 所有规则默认为启用
      for (const rule of rules) {
        expect(rule.is_active).toBe(1);
      }

      // 检查优先级分布
      const priorities = rules.map((r) => r.priority);
      expect(priorities.filter((p) => p === 10).length).toBeGreaterThanOrEqual(5);
      expect(priorities.filter((p) => p === 7).length).toBe(1);

      closeFreshDb(db);
    });

    it('样式模板 format_spec_json 是有效的 JSON 对象', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const specs = db.prepare(
        "SELECT id, format_spec_json FROM foxpre_style_templates ORDER BY id"
      ).all() as Array<{ id: string; format_spec_json: string }>;

      for (const spec of specs) {
        expect(() => JSON.parse(spec.format_spec_json)).not.toThrow();
        const parsed = JSON.parse(spec.format_spec_json);
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();
      }

      closeFreshDb(db);
    });
  });

  describe('迁移版本', () => {
    it('初始化后在 foxpre_migrations 中有 1 条版本记录', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const rows = db.prepare("SELECT version, name FROM foxpre_migrations ORDER BY version").all() as Array<{
        version: number;
        name: string;
      }>;

      expect(rows.length).toBe(1);
      expect(rows[0]!.version).toBe(1);
      expect(rows[0]!.name).toBe('foxpre 初始 11 张表');
    });

    it('version 1 记录包含有效的 applied_at 时间戳', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      const row = db.prepare("SELECT applied_at FROM foxpre_migrations WHERE version = 1").get() as {
        applied_at: number;
      } | undefined;

      expect(row).toBeDefined();
      expect(row!.applied_at).toBeGreaterThan(0);
      // 时间戳应在合理范围内（过去 10 年内）
      const now = Date.now();
      expect(row!.applied_at).toBeLessThanOrEqual(now);
      expect(row!.applied_at).toBeGreaterThan(now - 365 * 24 * 3600 * 1000);

      closeFreshDb(db);
    });
  });

  describe('幂等性', () => {
    it('重复调用不产生错误', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);
      // 第二次调用
      expect(() => initFoxpreDatabase(db)).not.toThrow();
      // 第三次调用
      expect(() => initFoxpreDatabase(db)).not.toThrow();

      closeFreshDb(db);
    });

    it('重复调用后迁移版本记录数不变（仍是 1）', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);
      initFoxpreDatabase(db);
      initFoxpreDatabase(db);

      const rows = db.prepare("SELECT COUNT(*) AS cnt FROM foxpre_migrations").get() as { cnt: number };
      expect(rows.cnt).toBe(1);

      closeFreshDb(db);
    });

    it('重复调用后种子数据不重复插入', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);
      initFoxpreDatabase(db);
      initFoxpreDatabase(db);

      const templateCount = db.prepare("SELECT COUNT(*) AS cnt FROM foxpre_style_templates").get() as { cnt: number };
      expect(templateCount.cnt).toBe(4);

      const ruleCount = db.prepare("SELECT COUNT(*) AS cnt FROM foxpre_universal_harness_rules").get() as { cnt: number };
      expect(ruleCount.cnt).toBe(12);

      closeFreshDb(db);
    });
  });

  describe('集成行为', () => {
    it('可与 OD 现有表共存（无冲突）', () => {
      const db = createFreshDb();

      // 模拟 OD 核心表
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      `);

      // 初始化 foxpre
      initFoxpreDatabase(db);

      // 两张表都能正常写入
      db.prepare("INSERT INTO projects (id, name, created_at) VALUES ('od-p1', 'OD Project', 1)").run();
      db.prepare(
        "INSERT INTO foxpre_projects (id, name, 状态, created_at, updated_at) VALUES ('fp-p1', 'Bid Project', '待启动', 1, 1)",
      ).run();

      const odCount = db.prepare("SELECT COUNT(*) AS cnt FROM projects").get() as { cnt: number };
      const fpCount = db.prepare("SELECT COUNT(*) AS cnt FROM foxpre_projects").get() as { cnt: number };
      expect(odCount.cnt).toBe(1);
      expect(fpCount.cnt).toBe(1);

      closeFreshDb(db);
    });

    it('完成的项目生命周期：创建项目 → 分配任务 → 写入文档片段 → 录入审核记录', () => {
      const db = createFreshDb();
      initFoxpreDatabase(db);

      // 1. 创建项目
      const now = Date.now();
      db.prepare(
        "INSERT INTO foxpre_projects (id, name, 招标编号, 状态, 当前审核轮次, created_at, updated_at) VALUES (?, ?, ?, '待启动', 0, ?, ?)",
      ).run('proj-1', '测试投标项目', 'ZB-2024-001', now, now);

      // 2. 分配任务
      db.prepare(
        "INSERT INTO foxpre_agent_tasks (id, project_id, agent_code, status, depends_on_json, created_at, updated_at) VALUES (?, ?, ?, '排队中', '[]', ?, ?)",
      ).run('task-1', 'proj-1', 'Analyzer', now, now);
      db.prepare(
        "INSERT INTO foxpre_agent_tasks (id, project_id, agent_code, status, depends_on_json, created_at, updated_at) VALUES (?, ?, ?, '排队中', '[\"task-1\"]', ?, ?)",
      ).run('task-2', 'proj-1', 'TechWriter', now, now);

      // 3. 写入文档片段
      db.prepare(
        "INSERT INTO foxpre_document_fragments (id, project_id, task_id, fragment_type, content_md, order_index, created_at, updated_at) VALUES (?, ?, ?, 'section', '# 技术方案' || CHAR(10) || '本方案采用...', ?, ?, ?)",
      ).run('frag-1', 'proj-1', 'task-2', 1, now, now);

      // 4. 录入审核记录
      db.prepare(
        "INSERT INTO foxpre_review_history (id, project_id, task_id, round, passed, comments_json, created_at) VALUES (?, ?, ?, 1, 0, ?, ?)",
      ).run('review-1', 'proj-1', 'task-2', JSON.stringify([
        { rule: '内容完整性', passed: false, detail: '缺少资质证书章节' },
      ]), now);

      // 验证全流程数据
      const project = db.prepare("SELECT id, name, 招标编号 FROM foxpre_projects WHERE id = ?").get('proj-1') as {
        id: string;
        name: string;
        [key: string]: unknown;
      };
      expect(project).toBeDefined();
      expect(project.name).toBe('测试投标项目');

      const tasks = db.prepare("SELECT id, agent_code, status FROM foxpre_agent_tasks WHERE project_id = ? ORDER BY id").all('proj-1') as Array<{
        id: string;
        agent_code: string;
        status: string;
      }>;
      expect(tasks.length).toBe(2);

      const fragments = db.prepare("SELECT id, content_md FROM foxpre_document_fragments WHERE project_id = ?").all('proj-1') as Array<{
        id: string;
        content_md: string;
      }>;
      expect(fragments.length).toBe(1);
      expect(fragments[0]!.content_md).toContain('技术方案');

      const reviews = db.prepare("SELECT id, passed FROM foxpre_review_history WHERE project_id = ?").all('proj-1') as Array<{
        id: string;
        passed: number;
      }>;
      expect(reviews.length).toBe(1);
      expect(reviews[0]!.passed).toBe(0);

      closeFreshDb(db);
    });
  });
});

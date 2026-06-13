// foxpre 数据库模块 — 11 张表 DDL + 迁移框架 + 种子数据
//
// 设计约束：
//   - 接收 OD 的 SqliteDb 实例，不新建连接
//   - 全部表使用 foxpre_ 前缀，与 OD 核心表完全隔离
//   - 使用 foxpre_migrations 表追踪版本，与 OD 迁移解耦
//   - 使用 better-sqlite3 同步 API
//   - 首次运行时插入种子数据

import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

const MIGRATION_TABLE = 'foxpre_migrations';

const MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  {
    version: 1,
    name: 'foxpre 初始 11 张表',
    sql: `
      -- 1. 投标项目元数据
      CREATE TABLE IF NOT EXISTS foxpre_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        招标编号 TEXT DEFAULT '',
        投标人ID TEXT DEFAULT '',
        样式模板ID TEXT DEFAULT '',
        引用项目ID列表_json TEXT DEFAULT '[]',
        状态 TEXT NOT NULL DEFAULT '待启动',
        当前审核轮次 INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 2. 智能体任务
      CREATE TABLE IF NOT EXISTS foxpre_agent_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '排队中',
        depends_on_json TEXT DEFAULT '[]',
        commit_sha TEXT DEFAULT '',
        output_path TEXT DEFAULT '',
        error_log TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_project ON foxpre_agent_tasks(project_id);

      -- 3. 文档片段
      CREATE TABLE IF NOT EXISTS foxpre_document_fragments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT DEFAULT '',
        fragment_type TEXT NOT NULL DEFAULT 'section',
        content_md TEXT NOT NULL DEFAULT '',
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_doc_fragments_project ON foxpre_document_fragments(project_id);

      -- 4. 审核记录
      CREATE TABLE IF NOT EXISTS foxpre_review_history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT DEFAULT '',
        round INTEGER NOT NULL DEFAULT 1,
        passed INTEGER NOT NULL DEFAULT 0,
        comments_json TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES foxpre_projects(id)
      );

      -- 5. 投标人信息库（含加密字段）
      CREATE TABLE IF NOT EXISTS foxpre_bidders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        统一社会信用代码_enc TEXT DEFAULT '',
        法人代表_enc TEXT DEFAULT '',
        联系人 TEXT DEFAULT '',
        联系电话_enc TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 6. 投标人资质证书
      CREATE TABLE IF NOT EXISTS foxpre_bidder_qualifications (
        id TEXT PRIMARY KEY,
        bidder_id TEXT NOT NULL,
        cert_name TEXT NOT NULL,
        cert_number TEXT DEFAULT '',
        issue_date TEXT DEFAULT '',
        expiry_date TEXT DEFAULT '',
        attachment_path TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (bidder_id) REFERENCES foxpre_bidders(id)
      );
      CREATE INDEX IF NOT EXISTS idx_qualifications_bidder ON foxpre_bidder_qualifications(bidder_id);

      -- 7. 投标人业绩案例
      CREATE TABLE IF NOT EXISTS foxpre_bidder_projects (
        id TEXT PRIMARY KEY,
        bidder_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        amount TEXT DEFAULT '',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (bidder_id) REFERENCES foxpre_bidders(id)
      );
      CREATE INDEX IF NOT EXISTS idx_bidder_projects_bidder ON foxpre_bidder_projects(bidder_id);

      -- 8. 项目引用关系
      CREATE TABLE IF NOT EXISTS foxpre_project_references (
        id TEXT PRIMARY KEY,
        bid_project_id TEXT NOT NULL,
        od_project_id TEXT NOT NULL,
        reference_type TEXT NOT NULL DEFAULT 'prototype',
        description_md TEXT DEFAULT '',
        image_paths_json TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (bid_project_id) REFERENCES foxpre_projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_refs_bid_project ON foxpre_project_references(bid_project_id);

      -- 9. 样式模板
      CREATE TABLE IF NOT EXISTS foxpre_style_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        template_path TEXT DEFAULT '',
        format_spec_json TEXT DEFAULT '{}',
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      -- 10. 通用门禁规则
      CREATE TABLE IF NOT EXISTS foxpre_universal_harness_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        description TEXT DEFAULT '',
        check_fn_hint TEXT DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      -- 11. 迁移版本追踪
      CREATE TABLE IF NOT EXISTS foxpre_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

/** 内置样式模板种子数据 */
const BUILTIN_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  templatePath: string;
  formatSpec: Record<string, string | boolean>;
}> = [
  {
    id: 'template-gov',
    name: '标准政府标书',
    description: '宋体正文/黑体标题/1.5倍行距',
    templatePath: '',
    formatSpec: { bodyFont: '宋体', headingFont: '黑体', lineSpacing: '1.5' },
  },
  {
    id: 'template-biz',
    name: '简化商务标书',
    description: '微软雅黑/1.2倍行距/蓝色主题色',
    templatePath: '',
    formatSpec: { bodyFont: '微软雅黑', headingFont: '微软雅黑', lineSpacing: '1.2', themeColor: 'blue' },
  },
  {
    id: 'template-tech',
    name: '技术方案重',
    description: '等宽正文/代码块/图表留白',
    templatePath: '',
    formatSpec: { bodyFont: '等线', monoFont: 'Consolas', codeBlock: 'true' },
  },
  {
    id: 'template-comprehensive',
    name: '综合标书',
    description: '多级目录/页眉页脚/封面页',
    templatePath: '',
    formatSpec: { tableOfContents: true, headerFooter: true, coverPage: true },
  },
];

/** 通用门禁规则种子数据 */
const HARNESS_RULES: Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  priority: number;
}> = [
  { id: 'rule-format-01', name: '封面信息与正文一致', category: '格式一致性', description: '封面上的项目名称、投标人名称等信息必须与正文完全一致', priority: 10 },
  { id: 'rule-format-02', name: '目录页码与正文对应', category: '格式一致性', description: '目录中列出的章节标题和页码必须与正文实际内容一一对应', priority: 10 },
  { id: 'rule-format-03', name: '页边距/页眉页脚/字体统一', category: '格式一致性', description: '全文的页边距、页眉页脚格式、正文字体字号必须统一', priority: 8 },
  { id: 'rule-content-01', name: '所有必填章节齐全', category: '内容完整性', description: '招标文件要求的所有必填章节均已编写并包含完整内容', priority: 10 },
  { id: 'rule-content-02', name: '评分项逐条响应', category: '内容完整性', description: '招标文件中的评分项必须逐条响应，不得遗漏', priority: 10 },
  { id: 'rule-content-03', name: '附件/证明文件引用无遗漏', category: '内容完整性', description: '正文中引用的附件和证明文件均已附上或说明原因', priority: 9 },
  { id: 'rule-reject-01', name: '无过期资质证书', category: '废标规避', description: '所有提交的资质证书均在有效期内', priority: 10 },
  { id: 'rule-reject-02', name: '报价无计算错误', category: '废标规避', description: '报价表各项计算准确，总价与分项合计一致', priority: 10 },
  { id: 'rule-reject-03', name: '无实名/敏感信息泄露', category: '废标规避', description: '未在非授权位置泄露竞争对手名称、内部人员实名信息等', priority: 8 },
  { id: 'rule-compliance-01', name: '投标有效期覆盖要求', category: '合规性', description: '投标有效期承诺满足招标文件要求的天数', priority: 9 },
  { id: 'rule-compliance-02', name: '保证金/保函信息正确', category: '合规性', description: '投标保证金或保函的金额、有效期、开具银行等信息正确无误', priority: 9 },
  { id: 'rule-quality-01', name: '无错别字/病句/格式错乱', category: '质量', description: '正文不存在明显的错别字、语病和排版格式错乱', priority: 7 },
];

/**
 * 获取当前迁移版本号。返回最新已应用的版本号，若无记录则返回 0。
 */
function getCurrentVersion(db: SqliteDb): number {
  const row = db.prepare(`SELECT MAX(version) AS v FROM ${MIGRATION_TABLE}`).get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

/**
 * 插入种子数据。仅当对应表为空时执行。
 */
function seedIfEmpty(db: SqliteDb): void {
  // 内置样式模板
  const templateCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM foxpre_style_templates').get() as { cnt: number }
  ).cnt;
  if (templateCount === 0) {
    const insertTemplate = db.prepare(
      'INSERT OR IGNORE INTO foxpre_style_templates (id, name, description, template_path, format_spec_json, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    );
    const now = Date.now();
    for (const tpl of BUILTIN_TEMPLATES) {
      insertTemplate.run(tpl.id, tpl.name, tpl.description, tpl.templatePath, JSON.stringify(tpl.formatSpec), now);
    }
  }

  // 通用门禁规则
  const ruleCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM foxpre_universal_harness_rules').get() as { cnt: number }
  ).cnt;
  if (ruleCount === 0) {
    const insertRule = db.prepare(
      'INSERT OR IGNORE INTO foxpre_universal_harness_rules (id, name, category, description, check_fn_hint, priority, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    );
    const now = Date.now();
    for (const rule of HARNESS_RULES) {
      insertRule.run(rule.id, rule.name, rule.category, rule.description, '', rule.priority, now);
    }
  }
}

/**
 * 幂等地初始化 foxpre 数据库。
 *
 * 1. 创建迁移版本追踪表（如不存在）
 * 2. 执行所有未应用的 DDL 迁移，并记录版本
 * 3. 首次运行时插入种子数据（样式模板 + 通用门禁规则）
 *
 * 可安全多次调用，重复调用不产生错误。
 */
export function initFoxpreDatabase(db: SqliteDb): void {
  // 1. 先确保迁移表存在
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  // 2. 获取当前版本，执行未应用的迁移
  const currentVersion = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  pending.sort((a, b) => a.version - b.version);

  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare(`INSERT INTO ${MIGRATION_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`).run(
        migration.version,
        migration.name,
        Date.now(),
      );
    }
  });

  if (pending.length > 0) {
    apply();
  }

  // 3. 种子数据（每次启动检查，幂等）
  seedIfEmpty(db);
}

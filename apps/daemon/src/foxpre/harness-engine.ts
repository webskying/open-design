/**
 * foxpre 门禁审核引擎（MVP 规则匹配版）
 *
 * 功能：
 * 1. checkFragment — 对单个 Fragment 执行单条规则检查
 * 2. runHarness — 遍历所有规则 × 所有 Fragment，批量审核
 * 3. generateReviewReport — 汇总结果并写入 foxpre_review_history 表
 *
 * 策略映射（按 rule.category）：
 *   - 内容完整性：关键词/正则匹配（必填章节、评分项、附件引用）
 *   - 废标规避：日期解析、敏感信息匹配
 *   - 格式一致性：行数、字段覆盖度启发式
 *   - 合规性：关键词/正则匹配（有效期、保证金）
 *   - 质量：重复段落检测、最小行数检查
 *
 * 技术约束：
 *   - 不使用第三方 NLP/LLM 库
 *   - 规则从 foxpre_universal_harness_rules 表读取
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RuleResult } from '@open-design/contracts';
import type { Fragment } from './document-pipeline.js';

type SqliteDb = Database.Database;

// ─── 类型 ─────────────────────────────────────────────────

/** 门禁规则（与 foxpre_universal_harness_rules 行对应） */
export interface HarnessRule {
  id: string;
  name: string;
  category: string;
  description: string;
  checkFnHint: string;
  priority: number;
  isActive: number;
}

/** 门禁审核报告（内部使用，不含持久化后的 DB 列） */
export interface HarnessReport {
  projectId: string;
  round: number;
  results: RuleResult[];
}

/** 门禁审核摘要 */
export interface HarnessSummary {
  totalRules: number;
  passedRules: number;
  failedRules: number;
  detail: string;
}

// ─── 规则选取 ─────────────────────────────────────────────

/**
 * 从 foxpre_universal_harness_rules 表读取所有 active 规则。
 */
export function loadActiveRules(db: SqliteDb): HarnessRule[] {
  const rows = db
    .prepare(
      `SELECT id, name, category, description, check_fn_hint, priority, is_active
       FROM foxpre_universal_harness_rules
       WHERE is_active = 1
       ORDER BY priority DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    check_fn_hint: string;
    priority: number;
    is_active: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    checkFnHint: r.check_fn_hint,
    priority: r.priority,
    isActive: r.is_active,
  }));
}

// ─── 单条检查 ─────────────────────────────────────────────

/**
 * 对单个 Fragment 执行单条规则检查。
 *
 * @param fragment - 文档片段
 * @param rule     - 门禁规则
 * @returns 检查结果
 */
export function checkFragment(
  fragment: Fragment,
  rule: HarnessRule,
): RuleResult {
  const content = fragment.contentMd;
  const category = rule.category;

  switch (category) {
    case '内容完整性':
      return checkContentIntegrity(fragment, rule, content);
    case '废标规避':
      return checkRejectAvoidance(fragment, rule, content);
    case '格式一致性':
      return checkFormatConsistency(fragment, rule, content);
    case '合规性':
      return checkCompliance(fragment, rule, content);
    case '质量':
      return checkQuality(fragment, rule, content);
    default:
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        passed: true,
        detail: `未知规则类别 "${category}"，跳过检查`,
        fragmentId: fragment.id,
      };
  }
}

// ─── 各策略实现 ───────────────────────────────────────────

/**
 * 内容完整性检查。
 *
 * - rule-content-01（所有必填章节齐全）：检查必填章节关键词
 * - rule-content-02（评分项逐条响应）：检查评分相关关键词
 * - rule-content-03（附件/证明文件引用无遗漏）：检查附件引用
 */
function checkContentIntegrity(
  fragment: Fragment,
  rule: HarnessRule,
  content: string,
): RuleResult {
  switch (rule.id) {
    case 'rule-content-01': {
      // 必填章节关键词
      const requiredSections = ['封面', '报价', '技术方案', '资质', '承诺'];
      const missing: string[] = [];
      for (const section of requiredSections) {
        if (!content.includes(section)) {
          missing.push(section);
        }
      }
      const passed = missing.length === 0;
      const detail = passed
        ? '所有必填章节关键词均已覆盖'
        : `缺少以下必填章节关键词：${missing.join('、')}`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-content-02': {
      // 评分项关键词
      const scoreKeywords = [/评分/i, /分值/i, /得分/i, /评审/i, /评价/i];
      const matched = scoreKeywords.some((re) => re.test(content));
      const passed = matched;
      const detail = passed
        ? '包含评分相关关键词'
        : '未检测到评分项关键词（评分、分值、得分等）';
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-content-03': {
      // 附件引用关键词
      const refKeywords = ['附件', '附录', '证明', '附图', '附表'];
      const found = refKeywords.filter((k) => content.includes(k));
      const passed = found.length > 0;
      const detail = passed
        ? `检测到附件/证明引用：${found.join('、')}`
        : '未检测到附件或证明文件引用';
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, passed: true, detail: '未知子规则', fragmentId: fragment.id };
  }
}

/**
 * 废标规避检查。
 *
 * - rule-reject-01（无过期资质证书）：检测过期日期
 * - rule-reject-02（报价无计算错误）：检测报价完整性
 * - rule-reject-03（无实名/敏感信息泄露）：检测手机号、身份证号
 */
function checkRejectAvoidance(
  fragment: Fragment,
  rule: HarnessRule,
  content: string,
): RuleResult {
  switch (rule.id) {
    case 'rule-reject-01': {
      // 检测 "过期" 关键词 + 过去日期
      const hasExpiredKeyword = /过期|失效|已过|逾期/.test(content);
      // 检测 YYYY-MM-DD / YYYY年MM月DD日 格式的过去日期
      const datePatterns = [
        /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g,
        /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
      ];
      const now = Date.now();
      let hasPastDate = false;
      for (const pattern of datePatterns) {
        const matches = content.matchAll(pattern);
        for (const m of matches) {
          const year = parseInt(m[1]!, 10);
          const month = parseInt(m[2]!, 10) - 1;
          const day = parseInt(m[3]!, 10);
          const date = new Date(year, month, day).getTime();
          if (!isNaN(date) && date < now) {
            hasPastDate = true;
            break;
          }
        }
        if (hasPastDate) break;
      }
      const passed = !hasExpiredKeyword && !hasPastDate;
      const reasons: string[] = [];
      if (hasExpiredKeyword) reasons.push('检测到"过期/失效"关键词');
      if (hasPastDate) reasons.push('检测到日期早于今天的日期');
      const detail = passed
        ? '未检测到过期资质或证书'
        : `可能有过期资质：${reasons.join('；')}`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-reject-02': {
      // 检测报价相关关键词 + 计算关键词
      const hasPriceContent = /报价|金额|价格|总价|合计|小计/.test(content);
      const hasCalculation = /合计|总计|汇总|总和/.test(content);
      const passed = !hasPriceContent || hasCalculation;
      const detail = !hasPriceContent
        ? '本片段不涉及报价内容，跳过检查'
        : passed
          ? '包含报价计算关键词'
          : '报价内容中未检测到合计/总计等汇总关键词，请确认计算完整';
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-reject-03': {
      // 检测中国大陆手机号 / 身份证号 / 银行卡号
      const phonePattern = /1[3-9]\d{9}/g;
      const idPattern = /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;
      const bankCardPattern = /\d{16,19}/g;

      const phones = [...content.matchAll(phonePattern)];
      const ids = [...content.matchAll(idPattern)];
      const cards = [...content.matchAll(bankCardPattern)];

      // 排除示例数据中的号码（如 123456789012345678 数量类数字）
      const actualPhones = phones.filter((m) => !/^1[3-9]0{9}$/.test(m[0]));
      const actualIds = ids.filter((m) => !/^1{6}1{4}1{4}1{4}$/.test(m[0]));

      const passed = actualPhones.length === 0 && actualIds.length === 0;
      const warnings: string[] = [];
      if (actualPhones.length > 0) warnings.push(`发现 ${actualPhones.length} 个手机号`);
      if (actualIds.length > 0) warnings.push(`发现 ${actualIds.length} 个身份证号`);
      if (cards.length > 0 && actualPhones.length === 0 && actualIds.length === 0) {
        // 仅银行卡号匹配时降级为 warning 而非 fail
        warnings.push('发现疑似银行卡号');
      }
      const detail = passed
        ? warnings.length > 0
          ? `注意：${warnings.join('；')}（可能为示例数据）`
          : '未检测到实名敏感信息泄露'
        : `检测到敏感信息：${warnings.join('；')}`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, passed: true, detail: '未知子规则', fragmentId: fragment.id };
  }
}

/**
 * 格式一致性检查（MVP 启发式）。
 *
 * - rule-format-01（封面信息与正文一致）：检查命名一致性
 * - rule-format-02（目录页码与正文对应）：检查目录/页码引用
 * - rule-format-03（页边距/页眉页脚/字体统一）：检查格式关键词
 */
function checkFormatConsistency(
  fragment: Fragment,
  rule: HarnessRule,
  content: string,
): RuleResult {
  // 提取纯文本（去除 Markdown 标记）
  const plainText = content.replace(/[#*_`~>\[\]()!|-]/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.length;

  switch (rule.id) {
    case 'rule-format-01': {
      // 检查是否包含项目名称一致性指示
      const hasProjectNameRef = /项目名称|项目编号|招标编号|项目名/.test(content);
      const passed = wordCount >= 20 || hasProjectNameRef;
      const detail = passed
        ? hasProjectNameRef
          ? '片段包含项目名称/编号引用'
          : '片段内容足够完整'
        : `片段内容过短（${wordCount} 字符），可能缺少封面信息`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-format-02': {
      // 目录/页码引用
      const hasTocRef = /目录|页码|第.*页|章节|分节/.test(content);
      const passed = wordCount >= 30 || hasTocRef;
      const detail = passed
        ? hasTocRef
          ? '包含目录/页码引用'
          : '片段内容足够完整'
        : `片段内容简短（${wordCount} 字符），可能缺少目录页码对应`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-format-03': {
      // 格式统一性
      const hasFormatRef = /字体|字号|行距|页边距|页眉|页脚|格式/.test(content);
      const passed = wordCount >= 15 || hasFormatRef;
      const detail = passed
        ? hasFormatRef
          ? '包含格式相关关键词'
          : '片段内容足够完整'
        : `片段过短（${wordCount} 字符），请确认格式统一`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, passed: true, detail: '未知子规则', fragmentId: fragment.id };
  }
}

/**
 * 合规性检查。
 *
 * - rule-compliance-01（投标有效期覆盖要求）：检查有效期天数
 * - rule-compliance-02（保证金/保函信息正确）：检查保证金/保函关键词
 */
function checkCompliance(
  fragment: Fragment,
  rule: HarnessRule,
  content: string,
): RuleResult {
  switch (rule.id) {
    case 'rule-compliance-01': {
      // 有效期天数模式
      const validityPattern = /有效期.*?(\d+)\s*[天日]/;
      const match = content.match(validityPattern);
      const passed = match !== null && parseInt(match[1]!, 10) >= 30;
      const detail = passed
        ? `投标有效期 ${match![1]} 天，满足最低要求`
        : match
          ? `投标有效期 ${match[1]} 天，建议 ≥ 30 天`
          : '未检测到投标有效期声明';
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    case 'rule-compliance-02': {
      // 保证金/保函信息
      const hasGuarantee = /保证金|保函|投标保证金|履约保证金/.test(content);
      const passed = hasGuarantee;
      const detail = passed
        ? '检测到保证金/保函信息'
        : '未检测到保证金或保函相关信息';
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, passed: true, detail: '未知子规则', fragmentId: fragment.id };
  }
}

/**
 * 质量检查。
 *
 * - rule-quality-01（无错别字/病句/格式错乱）：检测重复段落、短片段、格式问题
 */
function checkQuality(
  fragment: Fragment,
  rule: HarnessRule,
  content: string,
): RuleResult {
  switch (rule.id) {
    case 'rule-quality-01': {
      const issues: string[] = [];

      // 1. 重复段落检测（连续相同的非空行）
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      let hasDuplicate = false;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.trim() === lines[i - 1]!.trim()) {
          hasDuplicate = true;
          break;
        }
      }
      if (hasDuplicate) issues.push('存在重复段落');

      // 2. 片段内容过短（少于 15 个有效字符）
      const effectiveChars = content.replace(/[#*\s]/g, '').length;
      if (effectiveChars < 15) issues.push('片段内容过短');

      // 3. 首字母大写或明显格式错乱（Markdown 标题行未闭合）
      if (/^#{4,}\s/.test(content)) issues.push('标题层级过深（超过 ###）');

      // 4. 大段连续的空白行（超过 3 个空行）
      if (/\n{4,}/.test(content)) issues.push('存在连续 4 个以上空行');

      const passed = issues.length === 0;
      const detail = passed
        ? '未检测到明显的质量问题'
        : `发现质量问题：${issues.join('；')}`;
      return { ruleId: rule.id, ruleName: rule.name, passed, detail, fragmentId: fragment.id };
    }

    default:
      return { ruleId: rule.id, ruleName: rule.name, passed: true, detail: '未知子规则', fragmentId: fragment.id };
  }
}

// ─── 批量审核 ─────────────────────────────────────────────

/**
 * 对所有 fragment × 所有规则执行审核。
 *
 * @param db        - 数据库实例（用于读取项目轮次）
 * @param projectId - 投标项目 ID
 * @param rules     - 规则列表（通常从 loadActiveRules 获取）
 * @param fragments - 文档片段列表
 * @returns 审核报告
 */
export function runHarness(
  db: SqliteDb,
  projectId: string,
  rules: HarnessRule[],
  fragments: Fragment[],
): HarnessReport {
  // 读取当前审核轮次
  const project = db
    .prepare(
      'SELECT 当前审核轮次 FROM foxpre_projects WHERE id = ?',
    )
    .get(projectId) as { 当前审核轮次: number } | undefined;

  const round = project ? project.当前审核轮次 + 1 : 1;

  const results: RuleResult[] = [];

  for (const fragment of fragments) {
    for (const rule of rules) {
      const result = checkFragment(fragment, rule);
      results.push(result);
    }
  }

  return { projectId, round, results };
}

// ─── 报告生成与持久化 ──────────────────────────────────────

/**
 * 汇总审核结果，写入 foxpre_review_history 表，并返回摘要。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @param report    - runHarness 返回的审核报告
 * @returns 审核摘要
 */
export function generateReviewReport(
  db: SqliteDb,
  projectId: string,
  report: HarnessReport,
): HarnessSummary {
  const totalRules = report.results.length;
  const passedRules = report.results.filter((r) => r.passed).length;
  const failedRules = totalRules - passedRules;
  const overallPassed = failedRules === 0;

  const resultLines = report.results.map(
    (r) => `[${r.passed ? '✓' : '✗'}] ${r.ruleName}${r.passed ? '' : ` — ${r.detail}`}`,
  );

  const detail = resultLines.join('\n');

  // 原子写入 foxpre_review_history
  const historyId = crypto.randomUUID();
  const now = Date.now();

  const writeReport = db.transaction(() => {
    // 写入审核历史
    db.prepare(
      `INSERT INTO foxpre_review_history
         (id, project_id, round, passed, comments_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(historyId, projectId, report.round, overallPassed ? 1 : 0, JSON.stringify(report.results), now);

    // 更新项目轮次
    db.prepare(
      'UPDATE foxpre_projects SET 当前审核轮次 = ?, updated_at = ? WHERE id = ?',
    ).run(report.round, now, projectId);
  });

  writeReport();

  return { totalRules, passedRules, failedRules, detail };
}

/**
 * 便捷函数：加载规则 → 运行审核 → 生成报告。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @param fragments - 文档片段列表
 * @returns 审核摘要
 */
export function runFullHarness(
  db: SqliteDb,
  projectId: string,
  fragments: Fragment[],
): HarnessSummary {
  const rules = loadActiveRules(db);
  const report = runHarness(db, projectId, rules, fragments);
  return generateReviewReport(db, projectId, report);
}

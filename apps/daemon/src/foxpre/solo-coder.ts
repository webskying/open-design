/**
 * foxpre SOLO Coder 调度引擎
 *
 * 纯状态机实现，负责驱动整个投标工作流 DAG 执行。
 * 本阶段仅管理 SQLite 状态，不直接 spawn 进程（进程派遣由阶段六 HTTP API 完成）。
 *
 * DAG 结构：
 *   Step 1: Analyzer
 *       ↓
 *   Step 2: [TechWriter, BizWriter, QualWriter]（并行）
 *       ↓
 *   Step 3: HarnessRunner（门禁门）
 *       ↓
 *   Step 4: StyleChecker
 *       ↓
 *   Step 5: DocxAssembler（最终输出）
 *
 * 设计约束：
 *   - 同步 API，与 db.ts / harness-engine.ts 风格一致
 *   - DAG 硬编码，非通用工作流引擎
 *   - 幂等操作，重复调用不产生副作用
 *   - 无 HTTP 依赖，不调用 /api/runs
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Fragment } from './document-pipeline.js';
import { runFullHarness, type HarnessSummary } from './harness-engine.js';

type SqliteDb = Database.Database;

// ─── 工作流任务代码（大写，不含空格）─────────────────────────────────

/** 7 个参与 DAG 任务的 agent_code */
const DAG_AGENTS = [
  'Analyzer',
  'TechWriter',
  'BizWriter',
  'QualWriter',
  'HarnessRunner',
  'StyleChecker',
  'DocxAssembler',
] as const;

/** 工作流状态（供看板 UI 消费） */
export interface WorkflowState {
  projectStatus: string;
  reviewRound: number;
  tasks: Array<{
    id: string;
    agentCode: string;
    status: string;
    dependsOn: string[];
    outputPath: string | null;
    errorLog: string | null;
  }>;
}

// ─── 辅助函数 ─────────────────────────────────────────────────────—

/**
 * 从 contentMd 中提取 ## 标题作为 sectionTitle。
 * 无匹配时返回空字符串。
 */
function extractSectionTitle(contentMd: string): string {
  const firstLine = contentMd.split('\n')[0] ?? '';
  if (firstLine.startsWith('## ')) {
    return firstLine.replace(/^##\s+/, '').replace(/\r$/, '');
  }
  return '';
}

// ─── 1. createWorkflow ─────────────────────────────────────────────

/**
 * 为指定项目初始化工作流。
 *
 * 在 foxpre_agent_tasks 表中创建 7 条任务记录，状态均为 '排队中'。
 * Orchestrator 和 BidderManager 不创建任务记录。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @throws {Error} 项目不存在
 */
export function createWorkflow(
  db: SqliteDb,
  projectId: string,
): void {
  // 1. 确认项目存在
  const project = db
    .prepare('SELECT id FROM foxpre_projects WHERE id = ?')
    .get(projectId) as { id: string } | undefined;

  if (!project) {
    throw new Error('项目不存在: ' + projectId);
  }

  // 2. 幂等检查：已有任务则跳过
  const existingCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM foxpre_agent_tasks WHERE project_id = ?').get(projectId) as { cnt: number }
  ).cnt;

  if (existingCount > 0) {
    return;
  }

  // 3. 原子创建 7 条任务
  const now = Date.now();

  const createTasks = db.transaction(() => {
    // 先生成所有 ID，以便填充 depends_on
    const taskIds: Record<string, string> = {};
    for (const agent of DAG_AGENTS) {
      taskIds[agent] = crypto.randomUUID();
    }

    const stmt = db.prepare(
      `INSERT INTO foxpre_agent_tasks
         (id, project_id, agent_code, status, depends_on_json, commit_sha, output_path, error_log, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Analyzer — 无依赖
    stmt.run(taskIds['Analyzer'], projectId, 'Analyzer', '排队中', '[]', '', '', '', now, now);

    // TechWriter / BizWriter / QualWriter — 依赖 Analyzer
    const analyzerTaskId = taskIds['Analyzer'];
    const writerDep = JSON.stringify([analyzerTaskId]);
    stmt.run(taskIds['TechWriter'], projectId, 'TechWriter', '排队中', writerDep, '', '', '', now, now);
    stmt.run(taskIds['BizWriter'], projectId, 'BizWriter', '排队中', writerDep, '', '', '', now, now);
    stmt.run(taskIds['QualWriter'], projectId, 'QualWriter', '排队中', writerDep, '', '', '', now, now);

    // HarnessRunner — 依赖三个 Writer
    const writerIds = [taskIds['TechWriter'], taskIds['BizWriter'], taskIds['QualWriter']];
    const harnessDep = JSON.stringify(writerIds);
    stmt.run(taskIds['HarnessRunner'], projectId, 'HarnessRunner', '排队中', harnessDep, '', '', '', now, now);

    // StyleChecker — 依赖 HarnessRunner
    const styleDep = JSON.stringify([taskIds['HarnessRunner']]);
    stmt.run(taskIds['StyleChecker'], projectId, 'StyleChecker', '排队中', styleDep, '', '', '', now, now);

    // DocxAssembler — 依赖 StyleChecker
    const docxDep = JSON.stringify([taskIds['StyleChecker']]);
    stmt.run(taskIds['DocxAssembler'], projectId, 'DocxAssembler', '排队中', docxDep, '', '', '', now, now);
  });

  createTasks();
}

// ─── 2. advanceWorkflow ────────────────────────────────────────────

/**
 * 检查所有任务依赖关系，将满足条件的任务从 '排队中' 推进到 '执行中'。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @returns 状态变更信息
 */
export function advanceWorkflow(
  db: SqliteDb,
  projectId: string,
): { stateChanged: boolean; newStatus: string; readyTasks: string[] } {
  // 读取项目当前状态
  const project = db
    .prepare('SELECT 状态 FROM foxpre_projects WHERE id = ?')
    .get(projectId) as { 状态: string } | undefined;

  const currentStatus = project?.状态 ?? '待启动';

  // 读取所有任务
  const tasks = db
    .prepare('SELECT id, agent_code, status, depends_on_json FROM foxpre_agent_tasks WHERE project_id = ?')
    .all(projectId) as Array<{ id: string; agent_code: string; status: string; depends_on_json: string }>;

  // 构建 task 状态映射
  const taskStatusMap = new Map<string, string>();
  const taskAgentMap = new Map<string, string>();
  for (const t of tasks) {
    taskStatusMap.set(t.id, t.status);
    taskAgentMap.set(t.id, t.agent_code);
  }

  // 找到满足条件的 '排队中' 任务
  const readyTasks: string[] = [];

  for (const t of tasks) {
    if (t.status !== '排队中') continue;

    const deps: string[] = JSON.parse(t.depends_on_json);
    const allDepsCompleted = deps.length === 0 || deps.every((depId) => taskStatusMap.get(depId) === '已完成');

    if (allDepsCompleted) {
      readyTasks.push(t.id);
    }
  }

  // 推进任务
  if (readyTasks.length > 0) {
    const advance = db.transaction(() => {
      const stmt = db.prepare(
        'UPDATE foxpre_agent_tasks SET status = ?, updated_at = ? WHERE id = ?',
      );
      const now = Date.now();
      for (const taskId of readyTasks) {
        stmt.run('执行中', now, taskId);
      }
    });
    advance();
  }

  // 计算项目状态（基于当前所有任务完成情况）
  const completedTasks = tasks.filter((t) => t.status === '已完成').map((t) => t.agent_code);
  const readyTaskAgents = readyTasks.map((id) => taskAgentMap.get(id) ?? '');

  // 加上刚要推进的（已完成 → 执行中，但 advanceWorkflow 调用方会随后标记完成）
  // 实际项目状态靠已完成 + 刚推进的联合判断
  const allDoneOrAdvancing = new Set([...completedTasks, ...readyTaskAgents]);

  let newStatus = currentStatus;
  let stateChanged = false;

  // Analyzer 被推进或已完成 → 项目由 '待启动' 转 '进行中'
  if (currentStatus === '待启动' && (allDoneOrAdvancing.has('Analyzer'))) {
    newStatus = '进行中';
    stateChanged = true;
  }

  // 三个 Writer 全部完成 → 项目转 '等待审核'
  const writersCompleted = new Set(completedTasks);
  if (
    writersCompleted.has('TechWriter') &&
    writersCompleted.has('BizWriter') &&
    writersCompleted.has('QualWriter')
  ) {
    if (currentStatus === '进行中' || currentStatus === '待启动') {
      newStatus = '等待审核';
      stateChanged = true;
    }
  }

  if (stateChanged) {
    const now = Date.now();
    db.prepare('UPDATE foxpre_projects SET 状态 = ?, updated_at = ? WHERE id = ?')
      .run(newStatus, now, projectId);
  }

  return { stateChanged, newStatus, readyTasks };
}

// ─── 3. completeTask ──────────────────────────────────────────────

/**
 * 将指定任务标记为 '已完成'，可选记录输出路径。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @param taskId    - 任务 ID
 * @param outputPath - 可选输出文件路径
 * @throws {Error} 任务不存在
 */
export function completeTask(
  db: SqliteDb,
  projectId: string,
  taskId: string,
  outputPath?: string,
): void {
  const task = db
    .prepare('SELECT status FROM foxpre_agent_tasks WHERE id = ? AND project_id = ?')
    .get(taskId, projectId) as { status: string } | undefined;

  if (!task) {
    throw new Error('任务不存在: ' + taskId);
  }

  // 幂等：已是已完成直接返回
  if (task.status === '已完成') {
    return;
  }

  const now = Date.now();
  db.prepare(
    'UPDATE foxpre_agent_tasks SET status = ?, output_path = ?, updated_at = ? WHERE id = ?',
  ).run('已完成', outputPath ?? '', now, taskId);
}

// ─── 4. failTask ──────────────────────────────────────────────────

/**
 * 将指定任务标记为失败，记录错误日志，同时更新项目状态为 '需修改'。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @param taskId    - 任务 ID
 * @param errorLog  - 错误日志
 */
export function failTask(
  db: SqliteDb,
  projectId: string,
  taskId: string,
  errorLog: string,
): void {
  const now = Date.now();

  const fail = db.transaction(() => {
    // 更新任务状态
    const result = db.prepare(
      'UPDATE foxpre_agent_tasks SET status = ?, error_log = ?, updated_at = ? WHERE id = ? AND project_id = ?',
    ).run('失败', errorLog, now, taskId, projectId);

    if (result.changes === 0) {
      throw new Error('任务不存在: ' + taskId);
    }

    // 同步更新项目状态
    db.prepare('UPDATE foxpre_projects SET 状态 = ?, updated_at = ? WHERE id = ?')
      .run('需修改', now, projectId);
  });

  fail();
}

// ─── 5. triggerHarness ────────────────────────────────────────────

/**
 * 收集项目中所有文档片段，调用门禁引擎执行审核，根据结果流转项目状态。
 *
 * runFullHarness 内部已执行 generateReviewReport（写入 foxpre_review_history + 更新审核轮次）。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @returns 审核摘要 + 状态变更信息
 */
export function triggerHarness(
  db: SqliteDb,
  projectId: string,
): HarnessSummary & { stateChanged: boolean; newStatus: string } {
  // 1. 读取所有文档片段
  const rows = db
    .prepare(
      'SELECT id, content_md, order_index FROM foxpre_document_fragments WHERE project_id = ? ORDER BY order_index',
    )
    .all(projectId) as Array<{ id: string; content_md: string; order_index: number }>;

  const fragments: Fragment[] = rows.map((r) => ({
    id: r.id,
    sectionTitle: extractSectionTitle(r.content_md),
    contentMd: r.content_md,
    orderIndex: r.order_index,
  }));

  // 2. 调用门禁引擎
  const summary = runFullHarness(db, projectId, fragments);

  // 3. 根据审核结果更新项目状态
  let newStatus: string;
  if (summary.failedRules === 0) {
    newStatus = '等待审核';
  } else {
    newStatus = '需修改';
  }

  const now = Date.now();
  db.prepare('UPDATE foxpre_projects SET 状态 = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, now, projectId);

  // 4. 更新 HarnessRunner 任务状态为已完成
  const harnessTask = db
    .prepare(
      'SELECT id FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?',
    )
    .get(projectId, 'HarnessRunner') as { id: string } | undefined;

  if (harnessTask) {
    db.prepare(
      'UPDATE foxpre_agent_tasks SET status = ?, updated_at = ? WHERE id = ?',
    ).run('已完成', now, harnessTask.id);
  }

  return {
    ...summary,
    stateChanged: true,
    newStatus,
  };
}

// ─── 6. getWorkflowState ──────────────────────────────────────────

/**
 * 返回项目的完整工作流状态，供看板 UI 消费。
 *
 * @param db        - 数据库实例
 * @param projectId - 投标项目 ID
 * @throws {Error} 项目不存在
 */
export function getWorkflowState(
  db: SqliteDb,
  projectId: string,
): WorkflowState {
  // 读取项目
  const project = db
    .prepare('SELECT 状态, 当前审核轮次 FROM foxpre_projects WHERE id = ?')
    .get(projectId) as { 状态: string; 当前审核轮次: number } | undefined;

  if (!project) {
    throw new Error('项目不存在: ' + projectId);
  }

  // 读取所有任务
  const tasks = db
    .prepare(
      'SELECT id, agent_code, status, depends_on_json, output_path, error_log FROM foxpre_agent_tasks WHERE project_id = ? ORDER BY created_at ASC',
    )
    .all(projectId) as Array<{
    id: string;
    agent_code: string;
    status: string;
    depends_on_json: string;
    output_path: string;
    error_log: string;
  }>;

  return {
    projectStatus: project.状态,
    reviewRound: project.当前审核轮次,
    tasks: tasks.map((t) => ({
      id: t.id,
      agentCode: t.agent_code,
      status: t.status,
      dependsOn: JSON.parse(t.depends_on_json) as string[],
      outputPath: t.output_path || null,
      errorLog: t.error_log || null,
    })),
  };
}

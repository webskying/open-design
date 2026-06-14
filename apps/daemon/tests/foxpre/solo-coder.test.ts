/**
 * foxpre SOLO Coder 调度引擎单元测试
 *
 * 测试规格（12 个用例）：
 * 1. createWorkflow 创建 7 条任务
 * 2. createWorkflow 幂等
 * 3. createWorkflow 项目不存在时抛错
 * 4. createWorkflow 依赖关系正确
 * 5. advanceWorkflow 推进 Analyzer
 * 6. advanceWorkflow 推进 Writer（依赖满足时）
 * 7. advanceWorkflow 不推进未满足依赖
 * 8. completeTask 标记完成
 * 9. failTask 标记失败 + 项目状态流转
 * 10. triggerHarness 调用门禁引擎
 * 11. getWorkflowState 返回完整状态
 * 12. 全流程：创建 → 逐步推进 → 完成
 */

import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initFoxpreDatabase } from '../../src/foxpre/db.js';
import { importDocument, type Fragment } from '../../src/foxpre/document-pipeline.js';
import {
  advanceWorkflow,
  completeTask,
  createWorkflow,
  failTask,
  getWorkflowState,
  triggerHarness,
} from '../../src/foxpre/solo-coder.js';

type SqliteDb = Database.Database;

function createFreshDb(): SqliteDb {
  const dbPath = path.join(tempDir, 'test-solo-coder.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initFoxpreDatabase(db);
  return db;
}

function closeFreshDb(db: SqliteDb): void {
  db.close();
}

let tempDir: string;
let dbPath: string;

const PROJECT_ID = 'test-proj-001';
const PROJECT_NAME = '测试项目 001';

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'foxpre-solo-test-'));
  dbPath = path.join(tempDir, 'test-solo-coder.db');
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
});

/** 创建一个测试项目 */
function createTestProject(db: SqliteDb, projectId = PROJECT_ID): void {
  db.prepare(
    `INSERT INTO foxpre_projects (id, name, description, 状态, 当前审核轮次, created_at, updated_at)
     VALUES (?, ?, '', '待启动', 0, ?, ?)`,
  ).run(projectId, PROJECT_NAME, Date.now(), Date.now());
}

/** 创建测试片段（用于 triggerHarness） */
function createTestFragments(
  db: SqliteDb,
  projectId: string,
  contentMd: string,
): void {
  const fragment: Fragment = {
    id: crypto.randomUUID(),
    sectionTitle: '',
    contentMd,
    orderIndex: 0,
  };
  importDocument(db, projectId, [fragment]);
}

// ─── 基础设施 ─────────────────────────────────────────────────

describe('foxpre solo coder', () => {
  // ========== 用例 1-4: createWorkflow ==========

  it('1. createWorkflow 创建 7 条任务', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      const tasks = db
        .prepare('SELECT id, agent_code, status FROM foxpre_agent_tasks WHERE project_id = ? ORDER BY created_at')
        .all(PROJECT_ID) as Array<{ id: string; agent_code: string; status: string }>;

      expect(tasks).toHaveLength(7);

      // 所有 agent_code 不同
      const agentCodes = tasks.map((t) => t.agent_code);
      expect(new Set(agentCodes).size).toBe(7);

      // 所有任务初始状态为 '排队中'
      for (const t of tasks) {
        expect(t.status).toBe('排队中');
      }

      // 验证 7 个特定的 agent_code
      expect(agentCodes).toContain('Analyzer');
      expect(agentCodes).toContain('TechWriter');
      expect(agentCodes).toContain('BizWriter');
      expect(agentCodes).toContain('QualWriter');
      expect(agentCodes).toContain('HarnessRunner');
      expect(agentCodes).toContain('StyleChecker');
      expect(agentCodes).toContain('DocxAssembler');
    } finally {
      closeFreshDb(db);
    }
  });

  it('2. createWorkflow 幂等', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);

      // 两次调用
      createWorkflow(db, PROJECT_ID);
      createWorkflow(db, PROJECT_ID);

      const count = (
        db.prepare('SELECT COUNT(*) AS cnt FROM foxpre_agent_tasks WHERE project_id = ?')
          .get(PROJECT_ID) as { cnt: number }
      ).cnt;

      expect(count).toBe(7); // 不产生重复
    } finally {
      closeFreshDb(db);
    }
  });

  it('3. createWorkflow 项目不存在时抛错', () => {
    const db = createFreshDb();
    try {
      expect(() => createWorkflow(db, 'non-existent')).toThrow('项目不存在');
    } finally {
      closeFreshDb(db);
    }
  });

  it('4. createWorkflow 依赖关系正确', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      const tasks = db
        .prepare('SELECT agent_code, depends_on_json FROM foxpre_agent_tasks WHERE project_id = ?')
        .all(PROJECT_ID) as Array<{ agent_code: string; depends_on_json: string }>;

      const getTaskId = (code: string): string => {
        const rows = db
          .prepare('SELECT id FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
          .all(PROJECT_ID, code) as Array<{ id: string }>;
        return rows[0]?.id ?? '';
      };

      const analyzerId = getTaskId('Analyzer');
      const techWriterId = getTaskId('TechWriter');
      const bizWriterId = getTaskId('BizWriter');
      const qualWriterId = getTaskId('QualWriter');
      const harnessId = getTaskId('HarnessRunner');
      const styleId = getTaskId('StyleChecker');
      const docxId = getTaskId('DocxAssembler');

      for (const t of tasks) {
        const deps: string[] = JSON.parse(t.depends_on_json);
        switch (t.agent_code) {
          case 'Analyzer':
            expect(deps).toEqual([]);
            break;
          case 'TechWriter':
          case 'BizWriter':
          case 'QualWriter':
            expect(deps).toEqual([analyzerId]);
            break;
          case 'HarnessRunner':
            expect(deps).toEqual(
              expect.arrayContaining([techWriterId, bizWriterId, qualWriterId]),
            );
            expect(deps).toHaveLength(3);
            break;
          case 'StyleChecker':
            expect(deps).toEqual([harnessId]);
            break;
          case 'DocxAssembler':
            expect(deps).toEqual([styleId]);
            break;
        }
      }
    } finally {
      closeFreshDb(db);
    }
  });

  // ========== 用例 5-7: advanceWorkflow ==========

  it('5. advanceWorkflow 推进 Analyzer', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      // 第一次推进：Analyzer 无依赖 -> 应被推进
      const result = advanceWorkflow(db, PROJECT_ID);

      expect(result.stateChanged).toBe(true);
      expect(result.newStatus).toBe('进行中');
      expect(result.readyTasks).toHaveLength(1);

      const analyzer = db
        .prepare('SELECT status FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'Analyzer') as { status: string };
      expect(analyzer.status).toBe('执行中');

      // 项目状态已更新
      const project = db
        .prepare('SELECT 状态 FROM foxpre_projects WHERE id = ?')
        .get(PROJECT_ID) as { 状态: string };
      expect(project.状态).toBe('进行中');
    } finally {
      closeFreshDb(db);
    }
  });

  it('6. advanceWorkflow 推进 Writer（依赖满足时）', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      // 先推进 Analyzer
      advanceWorkflow(db, PROJECT_ID);

      // 手动标记 Analyzer 为已完成
      const analyzerTask = db
        .prepare('SELECT id FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'Analyzer') as { id: string };
      completeTask(db, PROJECT_ID, analyzerTask.id);

      // 第二次推进：三个 Writer 依赖已满足
      const result = advanceWorkflow(db, PROJECT_ID);

      expect(result.readyTasks).toHaveLength(3);

      const writers = db
        .prepare('SELECT agent_code, status FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code IN (?, ?, ?)')
        .all(PROJECT_ID, 'TechWriter', 'BizWriter', 'QualWriter') as Array<{ agent_code: string; status: string }>;

      for (const w of writers) {
        expect(w.status).toBe('执行中');
      }
    } finally {
      closeFreshDb(db);
    }
  });

  it('7. advanceWorkflow 不推进未满足依赖', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      // 不推进 Analyzer，直接尝试推进所有
      const result = advanceWorkflow(db, PROJECT_ID);

      // 只有 Analyzer 被推进
      expect(result.readyTasks).toHaveLength(1);

      const writer = db
        .prepare('SELECT status FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'TechWriter') as { status: string };
      expect(writer.status).toBe('排队中'); // 依赖未满足
    } finally {
      closeFreshDb(db);
    }
  });

  // ========== 用例 8-9: completeTask / failTask ==========

  it('8. completeTask 标记完成', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);
      advanceWorkflow(db, PROJECT_ID);

      const analyzerTask = db
        .prepare('SELECT id FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'Analyzer') as { id: string };

      // 标记完成，带输出路径
      completeTask(db, PROJECT_ID, analyzerTask.id, '/tmp/analyzer-output.md');

      const task = db
        .prepare('SELECT status, output_path FROM foxpre_agent_tasks WHERE id = ?')
        .get(analyzerTask.id) as { status: string; output_path: string };

      expect(task.status).toBe('已完成');
      expect(task.output_path).toBe('/tmp/analyzer-output.md');
    } finally {
      closeFreshDb(db);
    }
  });

  it('9. failTask 标记失败 + 项目状态流转', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      const analyzerTask = db
        .prepare('SELECT id FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'Analyzer') as { id: string };

      // 标记失败
      failTask(db, PROJECT_ID, analyzerTask.id, '分析阶段出错：无法解析招标文件');

      const task = db
        .prepare('SELECT status, error_log FROM foxpre_agent_tasks WHERE id = ?')
        .get(analyzerTask.id) as { status: string; error_log: string };

      expect(task.status).toBe('失败');
      expect(task.error_log).toContain('无法解析招标文件');

      // 项目状态同步更新
      const project = db
        .prepare('SELECT 状态 FROM foxpre_projects WHERE id = ?')
        .get(PROJECT_ID) as { 状态: string };
      expect(project.状态).toBe('需修改');
    } finally {
      closeFreshDb(db);
    }
  });

  // ========== 用例 10: triggerHarness ==========

  it('10. triggerHarness 调用门禁引擎', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      // 创建测试片段（含必要章节）
      createTestFragments(
        db,
        PROJECT_ID,
        '## 项目概述\n\n这是一个测试项目。\n\n## 技术方案\n\n采用微服务架构。',
      );

      // 执行门禁审核
      const result = triggerHarness(db, PROJECT_ID);

      // 返回结构体包含 HarnessSummary + stateChanged + newStatus
      expect(result).toHaveProperty('totalRules');
      expect(result).toHaveProperty('passedRules');
      expect(result).toHaveProperty('failedRules');
      expect(result).toHaveProperty('detail');
      expect(result).toHaveProperty('stateChanged');
      expect(result).toHaveProperty('newStatus');
      expect(result.stateChanged).toBe(true);

      // 项目状态已更新
      const project = db
        .prepare('SELECT 状态 FROM foxpre_projects WHERE id = ?')
        .get(PROJECT_ID) as { 状态: string };
      expect(['等待审核', '需修改']).toContain(project.状态);

      // HarnessRunner 任务已完成
      const harnessTask = db
        .prepare('SELECT status FROM foxpre_agent_tasks WHERE project_id = ? AND agent_code = ?')
        .get(PROJECT_ID, 'HarnessRunner') as { status: string };
      expect(harnessTask.status).toBe('已完成');
    } finally {
      closeFreshDb(db);
    }
  });

  // ========== 用例 11: getWorkflowState ==========

  it('11. getWorkflowState 返回完整状态', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      const state = getWorkflowState(db, PROJECT_ID);

      expect(state.projectStatus).toBe('待启动');
      expect(state.reviewRound).toBe(0);
      expect(state.tasks).toHaveLength(7);

      for (const task of state.tasks) {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('agentCode');
        expect(task).toHaveProperty('status');
        expect(task).toHaveProperty('dependsOn');
        expect(task).toHaveProperty('outputPath');
        expect(task).toHaveProperty('errorLog');
      }
    } finally {
      closeFreshDb(db);
    }
  });

  // ========== 用例 12: 全流程 ==========

  it('12. 全流程：创建 → 逐步推进 → 完成', () => {
    const db = createFreshDb();
    try {
      createTestProject(db);
      createWorkflow(db, PROJECT_ID);

      // ---- Phase 1: Analyzer ----
      let result = advanceWorkflow(db, PROJECT_ID);
      expect(result.readyTasks).toHaveLength(1);

      // 获取 Analyzer task id
      const tasks = db
        .prepare('SELECT id, agent_code FROM foxpre_agent_tasks WHERE project_id = ?')
        .all(PROJECT_ID) as Array<{ id: string; agent_code: string }>;
      const taskMap = new Map(tasks.map((t) => [t.agent_code, t.id]));

      // 完成 Analyzer
      completeTask(db, PROJECT_ID, taskMap.get('Analyzer')!);

      // ---- Phase 2: Three Writers ----
      result = advanceWorkflow(db, PROJECT_ID);
      expect(result.readyTasks).toHaveLength(3);

      // 完成三个 Writer
      completeTask(db, PROJECT_ID, taskMap.get('TechWriter')!);
      completeTask(db, PROJECT_ID, taskMap.get('BizWriter')!);
      completeTask(db, PROJECT_ID, taskMap.get('QualWriter')!);

      // ---- Phase 3: HarnessRunner ----
      result = advanceWorkflow(db, PROJECT_ID);
      expect(result.readyTasks).toHaveLength(1);

      // 创建片段并触发门禁
      createTestFragments(
        db,
        PROJECT_ID,
        '## 项目概述\n\n测试。\n\n## 技术方案\n\n方案内容。',
      );

      const harnessResult = triggerHarness(db, PROJECT_ID);
      expect(harnessResult.stateChanged).toBe(true);

      // ---- Phase 4: StyleChecker ----
      result = advanceWorkflow(db, PROJECT_ID);
      expect(result.readyTasks).toHaveLength(1);
      completeTask(db, PROJECT_ID, taskMap.get('StyleChecker')!);

      // ---- Phase 5: DocxAssembler ----
      result = advanceWorkflow(db, PROJECT_ID);
      expect(result.readyTasks).toHaveLength(1);
      completeTask(db, PROJECT_ID, taskMap.get('DocxAssembler')!);

      // ---- 验证最终状态 ----
      const finalState = getWorkflowState(db, PROJECT_ID);
      expect(finalState.tasks).toHaveLength(7);

      // 所有任务应为已完成
      const allCompleted = finalState.tasks.every((t) => t.status === '已完成');
      expect(allCompleted).toBe(true);
    } finally {
      closeFreshDb(db);
    }
  });
});

/**
 * foxpre 投标项目 CRUD + 工作流调度 + Kanban SSE 路由
 *
 * 端点清单（8 个）：
 *   POST   /api/foxpre/bid             创建投标项目
 *   GET    /api/foxpre/bid             列出所有投标项目
 *   GET    /api/foxpre/bid/:id         获取项目详情
 *   GET    /api/foxpre/bid/:id/status  获取工作流状态
 *   POST   /api/foxpre/bid/:id/start   启动工作流
 *   POST   /api/foxpre/bid/:id/harness 触发门禁审核
 *   GET    /api/foxpre/bid/:id/review  获取最新审核报告
 *   GET    /api/foxpre/bid/:id/events  Kanban SSE 实时流
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import {
  advanceWorkflow,
  completeTask,
  createWorkflow,
  getWorkflowState,
  triggerHarness,
} from './solo-coder.js';

type SqliteDb = any;

interface RegisterFoxpreBidRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids'> {}

const SSE_KEEPALIVE_INTERVAL_MS = 25_000;
const SSE_POLL_INTERVAL_MS = 2_000;

export function registerFoxpreBidRoutes(app: Express, ctx: RegisterFoxpreBidRoutesDeps): void {
  const { db } = ctx as { db: SqliteDb };
  const { createSseResponse, sendApiError } = ctx.http as {
    createSseResponse: (res: any, opts?: any) => any;
    sendApiError: (res: any, code: number, type: string, message: string) => void;
  };

  // ── POST /api/foxpre/bid — 创建投标项目 ──────────────────────────

  app.post('/api/foxpre/bid', (req, res) => {
    try {
      const body = req.body ?? {};
      const { name, description, 招标编号, 投标人ID, 样式模板ID, 引用项目ID列表 } = body;

      if (!name || typeof name !== 'string') {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'name 字段必填且为字符串');
        return;
      }

      const projectId = crypto.randomUUID();
      const now = Date.now();

      db.prepare(
        `INSERT INTO foxpre_projects
           (id, name, description, 招标编号, 投标人ID, 样式模板ID, 引用项目ID列表_json, 状态, 当前审核轮次, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '待启动', 0, ?, ?)`,
      ).run(
        projectId,
        name,
        description ?? '',
        招标编号 ?? '',
        投标人ID ?? '',
        样式模板ID ?? '',
        JSON.stringify(引用项目ID列表 ?? []),
        now,
        now,
      );

      res.status(201).json({ projectId, status: '待启动' });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bid — 列出投标项目 ──────────────────────────

  app.get('/api/foxpre/bid', (_req, res) => {
    try {
      const rows = db
        .prepare(
          'SELECT id, name, description, 招标编号, 状态, 当前审核轮次, created_at, updated_at FROM foxpre_projects ORDER BY created_at DESC',
        )
        .all();

      res.json({ projects: rows });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bid/:id — 获取项目详情 ──────────────────────

  app.get('/api/foxpre/bid/:id', (req, res) => {
    try {
      const { id } = req.params;

      const project = db
        .prepare(
          'SELECT id, name, description, 招标编号, 投标人ID, 样式模板ID, 引用项目ID列表_json, 状态, 当前审核轮次, created_at, updated_at FROM foxpre_projects WHERE id = ?',
        )
        .get(id) as Record<string, unknown> | undefined;

      if (!project) {
        sendApiError(res, 404, 'NOT_FOUND', '项目不存在');
        return;
      }

      const tasks = db
        .prepare(
          'SELECT id, agent_code, status, depends_on_json, output_path, error_log, created_at, updated_at FROM foxpre_agent_tasks WHERE project_id = ? ORDER BY created_at ASC',
        )
        .all(id);

      const fragmentCount = (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM foxpre_document_fragments WHERE project_id = ?')
          .get(id) as { cnt: number }
      ).cnt;

      // 解析 JSON 字段
      const 引用项目ID列表 = typeof project.引用项目ID列表_json === 'string'
        ? JSON.parse(project.引用项目ID列表_json)
        : project.引用项目ID列表_json;

      res.json({
        ...project,
        引用项目ID列表,
        tasks,
        fragmentCount,
      });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bid/:id/status — 工作流状态 ────────────────

  app.get('/api/foxpre/bid/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const state = getWorkflowState(db, id);
      res.json(state);
    } catch (err) {
      if (String(err).includes('项目不存在')) {
        sendApiError(res, 404, 'NOT_FOUND', '项目不存在');
        return;
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── POST /api/foxpre/bid/:id/start — 启动工作流 ────────────────

  app.post('/api/foxpre/bid/:id/start', (req, res) => {
    try {
      const { id } = req.params;

      // 检查项目存在
      const exists = db
        .prepare('SELECT id FROM foxpre_projects WHERE id = ?')
        .get(id) as { id: string } | undefined;
      if (!exists) {
        sendApiError(res, 404, 'NOT_FOUND', '项目不存在');
        return;
      }

      // 初始化工作流
      createWorkflow(db, id);
      // 推进第一轮
      advanceWorkflow(db, id);

      const state = getWorkflowState(db, id);
      res.json({ state });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── POST /api/foxpre/bid/:id/harness — 触发门禁审核 ──────────

  app.post('/api/foxpre/bid/:id/harness', (req, res) => {
    try {
      const { id } = req.params;

      const exists = db
        .prepare('SELECT id FROM foxpre_projects WHERE id = ?')
        .get(id) as { id: string } | undefined;
      if (!exists) {
        sendApiError(res, 404, 'NOT_FOUND', '项目不存在');
        return;
      }

      const result = triggerHarness(db, id);
      res.json(result);
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bid/:id/review — 获取最新审核报告 ─────────

  app.get('/api/foxpre/bid/:id/review', (req, res) => {
    try {
      const { id } = req.params;

      const row = db
        .prepare(
          'SELECT id, project_id, task_id, round, passed, comments_json, created_at FROM foxpre_review_history WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
        )
        .get(id) as Record<string, unknown> | undefined;

      if (!row) {
        res.json({ review: null });
        return;
      }

      res.json({
        review: {
          id: row.id,
          projectId: row.project_id,
          taskId: row.task_id,
          round: row.round,
          passed: row.passed,
          comments: typeof row.comments_json === 'string' ? JSON.parse(row.comments_json) : row.comments_json,
          createdAt: row.created_at,
        },
      });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bid/:id/events — Kanban SSE 实时流 ───────

  app.get('/api/foxpre/bid/:id/events', (req, res) => {
    try {
      const { id } = req.params;

      // 确认项目存在
      const exists = db
        .prepare('SELECT id FROM foxpre_projects WHERE id = ?')
        .get(id) as { id: string } | undefined;
      if (!exists) {
        sendApiError(res, 404, 'NOT_FOUND', '项目不存在');
        return;
      }

      const sse = createSseResponse(res);
      let lastStateJson = '';

      // 发送初始状态
      const initial = getWorkflowState(db, id);
      lastStateJson = JSON.stringify(initial);
      sse.send('state', initial);

      // 轮询
      const pollInterval = setInterval(() => {
        try {
          const current = getWorkflowState(db, id);
          const currentJson = JSON.stringify(current);
          if (currentJson !== lastStateJson) {
            lastStateJson = currentJson;
            sse.send('state', current);
          }
        } catch {
          // 查询失败时静默处理
        }
      }, SSE_POLL_INTERVAL_MS);

      // Keepalive
      const keepAliveInterval = setInterval(() => {
        try {
          sse.send('keepalive', { timestamp: Date.now() });
        } catch {
          // 连接已关闭
        }
      }, SSE_KEEPALIVE_INTERVAL_MS);

      res.on('close', () => {
        clearInterval(pollInterval);
        clearInterval(keepAliveInterval);
      });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });
}

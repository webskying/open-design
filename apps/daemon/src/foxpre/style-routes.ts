/**
 * foxpre 样式模板 CRUD 路由
 *
 * 端点清单（5 个）：
 *   GET    /api/foxpre/style        列出所有样式模板
 *   GET    /api/foxpre/style/:id    获取模板详情
 *   POST   /api/foxpre/style        创建自定义模板
 *   PATCH  /api/foxpre/style/:id    更新模板
 *   DELETE /api/foxpre/style/:id    删除模板
 *
 * 内置模板（is_builtin = 1）不可修改和删除。
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';

type SqliteDb = any;

interface RegisterFoxpreStyleRoutesDeps extends RouteDeps<'db' | 'http'> {}

export function registerFoxpreStyleRoutes(app: Express, ctx: RegisterFoxpreStyleRoutesDeps): void {
  const { db } = ctx as { db: SqliteDb };
  const { sendApiError } = ctx.http as {
    sendApiError: (res: any, code: number, type: string, message: string) => void;
  };

  // ── GET /api/foxpre/style — 列出所有样式模板 ──────────────────

  app.get('/api/foxpre/style', (_req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM foxpre_style_templates ORDER BY is_builtin DESC, name ASC')
        .all() as Array<Record<string, unknown>>;

      const templates = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        templatePath: r.template_path,
        formatSpec: typeof r.format_spec_json === 'string' ? JSON.parse(r.format_spec_json) : r.format_spec_json,
        isBuiltin: Boolean(r.is_builtin),
        createdAt: r.created_at,
      }));

      res.json({ templates });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/style/:id — 获取模板详情 ─────────────────

  app.get('/api/foxpre/style/:id', (req, res) => {
    try {
      const { id } = req.params;
      const row = db
        .prepare('SELECT * FROM foxpre_style_templates WHERE id = ?')
        .get(id) as Record<string, unknown> | undefined;

      if (!row) {
        sendApiError(res, 404, 'NOT_FOUND', '样式模板不存在');
        return;
      }

      const template = {
        id: row.id,
        name: row.name,
        description: row.description,
        templatePath: row.template_path,
        formatSpec: typeof row.format_spec_json === 'string' ? JSON.parse(row.format_spec_json) : row.format_spec_json,
        isBuiltin: Boolean(row.is_builtin),
        createdAt: row.created_at,
      };

      res.json({ template });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── POST /api/foxpre/style — 创建自定义模板 ─────────────────

  app.post('/api/foxpre/style', (req, res) => {
    try {
      const body = req.body ?? {};
      const { name, description, templatePath, formatSpec } = body;

      if (!name || typeof name !== 'string') {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'name 字段必填且为字符串');
        return;
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      db.prepare(
        `INSERT INTO foxpre_style_templates
           (id, name, description, template_path, format_spec_json, is_builtin, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(id, name, description ?? '', templatePath ?? '', JSON.stringify(formatSpec ?? {}), now);

      const template = {
        id,
        name,
        description: description ?? '',
        templatePath: templatePath ?? '',
        formatSpec: formatSpec ?? {},
        isBuiltin: false,
        createdAt: now,
      };

      res.status(201).json({ template });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── PATCH /api/foxpre/style/:id — 更新模板 ──────────────────

  app.patch('/api/foxpre/style/:id', (req, res) => {
    try {
      const { id } = req.params;

      const row = db
        .prepare('SELECT is_builtin FROM foxpre_style_templates WHERE id = ?')
        .get(id) as { is_builtin: number } | undefined;

      if (!row) {
        sendApiError(res, 404, 'NOT_FOUND', '样式模板不存在');
        return;
      }
      if (row.is_builtin === 1) {
        sendApiError(res, 400, 'FORBIDDEN', '内置模板不可修改');
        return;
      }

      const body = req.body ?? {};
      const { name, description, templatePath, formatSpec } = body;

      const sets: string[] = [];
      const params: unknown[] = [];

      if (name !== undefined) {
        sets.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        sets.push('description = ?');
        params.push(description);
      }
      if (templatePath !== undefined) {
        sets.push('template_path = ?');
        params.push(templatePath);
      }
      if (formatSpec !== undefined) {
        sets.push('format_spec_json = ?');
        params.push(JSON.stringify(formatSpec));
      }

      if (sets.length === 0) {
        sendApiError(res, 400, 'VALIDATION_ERROR', '请提供至少一个待更新字段');
        return;
      }

      params.push(id);
      db.prepare(`UPDATE foxpre_style_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      // 返回更新后的数据
      const updated = db
        .prepare('SELECT * FROM foxpre_style_templates WHERE id = ?')
        .get(id) as Record<string, unknown>;

      res.json({
        template: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          templatePath: updated.template_path,
          formatSpec: typeof updated.format_spec_json === 'string' ? JSON.parse(updated.format_spec_json) : updated.format_spec_json,
          isBuiltin: Boolean(updated.is_builtin),
          createdAt: updated.created_at,
        },
      });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── DELETE /api/foxpre/style/:id — 删除模板 ─────────────────

  app.delete('/api/foxpre/style/:id', (req, res) => {
    try {
      const { id } = req.params;

      const row = db
        .prepare('SELECT is_builtin FROM foxpre_style_templates WHERE id = ?')
        .get(id) as { is_builtin: number } | undefined;

      if (!row) {
        sendApiError(res, 404, 'NOT_FOUND', '样式模板不存在');
        return;
      }
      if (row.is_builtin === 1) {
        sendApiError(res, 400, 'FORBIDDEN', '内置模板不可修改');
        return;
      }

      // 检查是否有项目引用此模板
      const refCount = (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM foxpre_projects WHERE 样式模板ID = ?')
          .get(id) as { cnt: number }
      ).cnt;

      if (refCount > 0) {
        sendApiError(res, 400, 'REFERENCED', '该模板正在被项目使用，无法删除');
        return;
      }

      db.prepare('DELETE FROM foxpre_style_templates WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });
}

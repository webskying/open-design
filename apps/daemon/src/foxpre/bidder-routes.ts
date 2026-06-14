/**
 * foxpre 投标人信息库 CRUD 路由
 *
 * 端点清单（5 个）：
 *   POST  /api/foxpre/bidder       创建投标人
 *   GET   /api/foxpre/bidder       列出所有投标人
 *   GET   /api/foxpre/bidder/:id   获取投标人详情
 *   PATCH /api/foxpre/bidder/:id   更新投标人信息
 *   DELETE /api/foxpre/bidder/:id  删除投标人
 *
 * 敏感字段使用 AES-256-GCM 加密存储（_enc 后缀列）。
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { decrypt, encrypt } from './field-crypto.js';

type SqliteDb = any;

interface RegisterFoxpreBidderRoutesDeps extends RouteDeps<'db' | 'http'> {}

/** 需加密的字段 DTO */
interface EncryptedFields {
  统一社会信用代码?: string;
  法人代表?: string;
  联系电话?: string;
}

/**
 * 加密敏感字段，返回可直接写入数据库的行对象（带 _enc 后缀）。
 */
function encryptFields(fields: EncryptedFields): {
  统一社会信用代码_enc: string;
  法人代表_enc: string;
  联系电话_enc: string;
} {
  return {
    统一社会信用代码_enc: encrypt(fields.统一社会信用代码 ?? ''),
    法人代表_enc: encrypt(fields.法人代表 ?? ''),
    联系电话_enc: encrypt(fields.联系电话 ?? ''),
  };
}

/**
 * 解密数据库行中的加密字段，返回明文字段。
 */
function decryptRow(row: Record<string, unknown>): Record<string, unknown> {
  const result = { ...row };
  result.统一社会信用代码 = decrypt(String(row.统一社会信用代码_enc ?? ''));
  result.法人代表 = decrypt(String(row.法人代表_enc ?? ''));
  result.联系电话 = decrypt(String(row.联系电话_enc ?? ''));
  delete result.统一社会信用代码_enc;
  delete result.法人代表_enc;
  delete result.联系电话_enc;
  return result;
}

export function registerFoxpreBidderRoutes(app: Express, ctx: RegisterFoxpreBidderRoutesDeps): void {
  const { db } = ctx as { db: SqliteDb };
  const { sendApiError } = ctx.http as {
    sendApiError: (res: any, code: number, type: string, message: string) => void;
  };

  // ── POST /api/foxpre/bidder — 创建投标人 ──────────────────────

  app.post('/api/foxpre/bidder', (req, res) => {
    try {
      const body = req.body ?? {};
      const { name, 统一社会信用代码, 法人代表, 联系人, 联系电话 } = body;

      if (!name || typeof name !== 'string') {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'name 字段必填且为字符串');
        return;
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      const encrypted = encryptFields({ 统一社会信用代码, 法人代表, 联系电话 });

      db.prepare(
        `INSERT INTO foxpre_bidders
           (id, name, 统一社会信用代码_enc, 法人代表_enc, 联系人, 联系电话_enc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, name, encrypted.统一社会信用代码_enc, encrypted.法人代表_enc, 联系人 ?? '', encrypted.联系电话_enc, now, now);

      // 返回解密后的完整数据
      const row = db.prepare('SELECT * FROM foxpre_bidders WHERE id = ?').get(id) as Record<string, unknown>;
      const bidder = decryptRow(row);

      res.status(201).json({ bidder });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bidder — 列出投标人 ──────────────────────

  app.get('/api/foxpre/bidder', (_req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM foxpre_bidders ORDER BY created_at DESC')
        .all() as Array<Record<string, unknown>>;

      const bidders = rows.map(decryptRow);
      res.json({ bidders });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── GET /api/foxpre/bidder/:id — 获取投标人详情 ─────────────

  app.get('/api/foxpre/bidder/:id', (req, res) => {
    try {
      const { id } = req.params;

      const row = db.prepare('SELECT * FROM foxpre_bidders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!row) {
        sendApiError(res, 404, 'NOT_FOUND', '投标人不存在');
        return;
      }

      const qualifications = db
        .prepare('SELECT * FROM foxpre_bidder_qualifications WHERE bidder_id = ?')
        .all(id);

      const projects = db
        .prepare('SELECT * FROM foxpre_bidder_projects WHERE bidder_id = ?')
        .all(id);

      const bidder = decryptRow(row);
      res.json({ bidder, qualifications, projects });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── PATCH /api/foxpre/bidder/:id — 更新投标人信息 ──────────

  app.patch('/api/foxpre/bidder/:id', (req, res) => {
    try {
      const { id } = req.params;

      const existing = db.prepare('SELECT id FROM foxpre_bidders WHERE id = ?').get(id) as { id: string } | undefined;
      if (!existing) {
        sendApiError(res, 404, 'NOT_FOUND', '投标人不存在');
        return;
      }

      const body = req.body ?? {};
      const { name, 统一社会信用代码, 法人代表, 联系人, 联系电话 } = body;
      const now = Date.now();

      // 构建 SET 子句
      const sets: string[] = [];
      const params: unknown[] = [];

      if (name !== undefined) {
        sets.push('name = ?');
        params.push(name);
      }
      if (统一社会信用代码 !== undefined) {
        sets.push('统一社会信用代码_enc = ?');
        params.push(encrypt(统一社会信用代码));
      }
      if (法人代表 !== undefined) {
        sets.push('法人代表_enc = ?');
        params.push(encrypt(法人代表));
      }
      if (联系人 !== undefined) {
        sets.push('联系人 = ?');
        params.push(联系人);
      }
      if (联系电话 !== undefined) {
        sets.push('联系电话_enc = ?');
        params.push(encrypt(联系电话));
      }

      if (sets.length === 0) {
        sendApiError(res, 400, 'VALIDATION_ERROR', '请提供至少一个待更新字段');
        return;
      }

      sets.push('updated_at = ?');
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE foxpre_bidders SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      // 返回更新后的数据
      const updated = db.prepare('SELECT * FROM foxpre_bidders WHERE id = ?').get(id) as Record<string, unknown>;
      const bidder = decryptRow(updated);

      res.json({ bidder });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // ── DELETE /api/foxpre/bidder/:id — 删除投标人 ────────────

  app.delete('/api/foxpre/bidder/:id', (req, res) => {
    try {
      const { id } = req.params;

      const existing = db.prepare('SELECT id FROM foxpre_bidders WHERE id = ?').get(id) as { id: string } | undefined;
      if (!existing) {
        sendApiError(res, 404, 'NOT_FOUND', '投标人不存在');
        return;
      }

      // 级联删除
      const del = db.transaction(() => {
        db.prepare('DELETE FROM foxpre_bidder_qualifications WHERE bidder_id = ?').run(id);
        db.prepare('DELETE FROM foxpre_bidder_projects WHERE bidder_id = ?').run(id);
        db.prepare('DELETE FROM foxpre_bidders WHERE id = ?').run(id);
      });

      del();
      res.status(204).json({ ok: true });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });
}

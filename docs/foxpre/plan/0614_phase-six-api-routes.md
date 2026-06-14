# foxpre 阶段六开发提示词：Daemon API 路由 + CLI 命令

**日期**：2026-06-14
**状态**：下发给 atomcode
**分支**：`foxpre/v0.10/phase-six`（从 `foxpre/v0.10/dev` 切出）
**基线**：`dceed21`（主计划刷新后）

---

## 0. 前置状态（请勿修改）

| 名称 | 状态 |
|------|------|
| OD 基线 | v0.10.0 tag `3c3d45a` |
| foxpre 分支 | `foxpre/v0.10/dev` @ `dceed21` |
| contracts/foxpre/api.ts | ✅ 完整类型（BidProjectMetadata, AgentTask, ReviewReport, StyleTemplate, Bidder 等） |
| contracts/foxpre/constants.ts | ✅ AGENT_CODES, BID_PROJECT_STATUS, TASK_STATUS |
| foxpre/db.ts | ✅ 11 张表 + 种子数据 + initFoxpreDatabase |
| foxpre/harness-engine.ts | ✅ loadActiveRules, runFullHarness, generateReviewReport |
| foxpre/document-pipeline.ts | ✅ parseDocument, importDocument, Fragment |
| foxpre/solo-coder.ts | ✅ createWorkflow, advanceWorkflow, completeTask, failTask, triggerHarness, getWorkflowState |
| skills/foxpre-*/SKILL.md | ✅ 9 Agent Skills（阶段四） |
| server.ts | ✅ initFoxpreDatabase 已注册（line 449 import, line 4969 调用） |

---

## 1. 目标与范围

注册 foxpre 的 HTTP API 端点，实现 CLI 命令行接口，构建加密工具层。**foxtpre 对外 API 面的全部实现。**

**新增 5 个文件，修改 3 个文件**：

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `apps/daemon/src/foxpre/field-crypto.ts` | AES-256-GCM 加密/解密工具 |
| 新增 | `apps/daemon/src/foxpre/bid-routes.ts` | 投标项目 CRUD + 工作流调度 + Kanban SSE |
| 新增 | `apps/daemon/src/foxpre/bidder-routes.ts` | 投标人信息库 CRUD |
| 新增 | `apps/daemon/src/foxpre/style-routes.ts` | 样式模板 CRUD |
| 新增 | `apps/daemon/src/foxpre/foxpre-routes.ts` | 统一注册入口（聚合 3 个路由文件） |
| 修改 | `apps/daemon/src/server.ts` | import + 注册调用（1 行替换） |
| 修改 | `apps/daemon/src/cli.ts` | SUBCOMMAND_MAP 追加 + 4 个命令函数 |
| 修改 | `apps/daemon/src/server-context.ts` | ServerContext 追加 foxpre 上下文 key |

**不改动任何其他文件。**

### 分支工作流

```bash
# atomcode 执行：
git checkout foxpre/v0.10/dev
git checkout -b foxpre/v0.10/phase-six
# 开发 8 个文件 ...
git push origin foxpre/v0.10/phase-six

# 架构师审查通过后，由架构师执行：
git checkout foxpre/v0.10/dev
git merge foxpre/v0.10/phase-six --no-ff
```

---

## 2. 改动清单

### 2.1 field-crypto.ts（AES-256-GCM 加密工具）

**文件**：`apps/daemon/src/foxpre/field-crypto.ts`

#### 设计约束

| 约束 | 说明 |
|------|------|
| 密钥来源 | Node.js 内置 `crypto` 模块 |
| 加密算法 | `aes-256-gcm` |
| 密钥长度 | 32 字节（256 位） |
| IV | 每次加密随机生成 16 字节，拼接在密文前 |
| 认证标签 | 16 字节 GCM auth tag，拼接在 IV 后、密文前 |
| 输出编码 | hex（hex 编码密文块，格式：`iv:authTag:ciphertext`，中间无原始二进制）→ 实际使用 base64 编码 |
| 密钥存储 | 从环境变量 `FOXPRE_ENCRYPTION_KEY` 读取；不设置时使用派生密钥（`crypto.scryptSync('foxpre-default-salt', 'foxpre', 32)`） |
| 数据库存储 | `TEXT` 列，存储 base64 编码的完整密文 |

#### 函数签名

##### `encrypt(plaintext: string, key?: Buffer): string`

```typescript
/**
 * AES-256-GCM 加密。
 *
 * 密文格式：将 IV (16B) + authTag (16B) + ciphertext 拼接为 Buffer，
 * 返回 base64 编码字符串。
 *
 * @param plaintext - 明文（为空时返回空字符串）
 * @param key       - 可选 32 字节密钥，不传则使用默认派生密钥
 * @returns base64 编码的密文
 */
export function encrypt(plaintext: string, key?: Buffer): string;
```

**实现要求**：
1. `plaintext` 为空字符串时直接返回 `''`
2. 调用 `crypto.randomBytes(16)` 生成随机 IV
3. 使用 `crypto.createCipheriv('aes-256-gcm', key ?? DEFAULT_KEY, iv)`
4. 获取 `cipher.getAuthTag()` (16 字节)
5. 返回 `Buffer.concat([iv, authTag, ciphertext]).toString('base64')`

##### `decrypt(encoded: string, key?: Buffer): string`

```typescript
/**
 * AES-256-GCM 解密。
 *
 * @param encoded - base64 编码的密文（为空时返回空字符串）
 * @param key     - 可选 32 字节密钥
 * @throws {Error} 解密失败（密钥不匹配或数据损坏）
 * @returns 明文
 */
export function decrypt(encoded: string, key?: Buffer): string;
```

**实现要求**：
1. `encoded` 为空字符串时直接返回 `''`
2. `Buffer.from(encoded, 'base64')` 解码
3. 从 buffer 提取前 16 字节为 IV，接下来 16 字节为 authTag，剩余为 ciphertext
4. 使用 `crypto.createDecipheriv('aes-256-gcm', key ?? DEFAULT_KEY, iv)` 并 `decipher.setAuthTag(authTag)`
5. 解密失败（`authTag` 不匹配）时抛出 `new Error('解密失败：密钥不匹配或数据已损坏')`

##### `getEncryptionKey(): Buffer`

```typescript
/**
 * 返回当前使用的加密密钥。
 *
 * 优先级：FOXPRE_ENCRYPTION_KEY 环境变量 → scrypt 派生密钥
 */
export function getEncryptionKey(): Buffer;
```

**实现要求**：
1. 检查 `process.env.FOXPRE_ENCRYPTION_KEY`
2. 若有值，使用 `crypto.scryptSync(value, 'foxpre-salt', 32)` 派生
3. 若无值，使用 `crypto.scryptSync('foxpre-default-salt', 'foxpre', 32)` 派生默认密钥

**实现模式**：密钥在模块加载时计算一次（`const DEFAULT_KEY = getEncryptionKey()`），所有 `encrypt`/`decrypt` 调用共享。

---

### 2.2 bid-routes.ts（投标项目 API + 工作流调度 + Kanban SSE）

**文件**：`apps/daemon/src/foxpre/bid-routes.ts`

#### 路由注册模式

**参照**：`apps/daemon/src/routes/routine.ts` 的行文风格。

```typescript
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import type { RouteDeps } from '../server-context.js';

type SqliteDb = Database.Database;

interface RegisterFoxpreBidRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids'> {}

export function registerFoxpreBidRoutes(app: Express, ctx: RegisterFoxpreBidRoutesDeps): void {
  const { db } = ctx as { db: SqliteDb };
  const { createSseResponse, sendApiError } = ctx.http as {
    createSseResponse: (res: any, opts?: any) => any;
    sendApiError: (res: any, code: number, type: string, message: string) => void;
  };
  // ... 路由定义
}
```

**注意**：由于 `RouteDeps` 内字段类型为 `any`，实际使用时需要类型断言。参照 routine.ts 的模式：直接从 ctx 解构，用 `as` 断言具体类型。

#### 端点清单

| 方法 | 路径 | 说明 | `--json` CLI |
|------|------|------|:--:|
| POST | `/api/foxpre/bid` | 创建投标项目 | ✅ |
| GET | `/api/foxpre/bid` | 列出所有投标项目 | ✅ |
| GET | `/api/foxpre/bid/:id` | 获取项目详情 | ✅ |
| GET | `/api/foxpre/bid/:id/status` | 获取工作流状态 | ✅ |
| POST | `/api/foxpre/bid/:id/start` | 启动工作流（createWorkflow + advanceWorkflow） | ✅ |
| POST | `/api/foxpre/bid/:id/harness` | 触发门禁审核（triggerHarness） | ✅ |
| GET | `/api/foxpre/bid/:id/review` | 获取最新审核报告 | ✅ |
| GET | `/api/foxpre/bid/:id/events` | Kanban SSE 实时流 | — |

#### 各端点实现要求

##### POST `/api/foxpre/bid` — 创建投标项目

1. 接收 JSON body（与 `CreateBidProjectRequest` 一致）：
   ```json
   { "name": "项目名称", "description": "", "招标编号": "", "投标人ID": "", "样式模板ID": "" }
   ```
2. 生成 `crypto.randomUUID()` 作为 project id
3. INSERT 到 `foxpre_projects` 表（状态 = `'待启动'`，审核轮次 = 0）
4. 返回 `{ projectId, status: '待启动' }`（status 201）
5. 请求体校验失败返回 400

##### GET `/api/foxpre/bid` — 列出投标项目

1. `SELECT * FROM foxpre_projects ORDER BY created_at DESC`
2. 返回 `{ projects: [...] }`
3. 每个项目包含 `id, name, description, 招标编号, 状态, 当前审核轮次, created_at, updated_at`

##### GET `/api/foxpre/bid/:id` — 获取项目详情

1. 从 `foxpre_projects` 查询单条记录
2. 同时返回关联数据：`foxpre_agent_tasks` 任务列表、`foxpre_document_fragments` 片段数
3. 项目不存在返回 404

##### GET `/api/foxpre/bid/:id/status` — 工作流状态

1. 直接调用 `getWorkflowState(db, projectId)` 并返回结果
2. 项目不存在返回 404

##### POST `/api/foxpre/bid/:id/start` — 启动工作流

1. 调用 `createWorkflow(db, projectId)` 初始化 7 条任务
2. 调用 `advanceWorkflow(db, projectId)` 推进第一轮（Analyzer → '执行中'）
3. 返回 `{ state }`（来自 getWorkflowState）
4. 项目不存在返回 404

##### POST `/api/foxpre/bid/:id/harness` — 触发门禁

1. 调用 `triggerHarness(db, projectId)`
2. 返回审核摘要 + 状态变更信息
3. 项目不存在返回 404

##### GET `/api/foxpre/bid/:id/review` — 审核报告

1. 从 `foxpre_review_history` 查询最新记录（`ORDER BY created_at DESC LIMIT 1`）
2. 解析 `comments_json` JSON 字段
3. 返回 `{ review: { id, round, passed, comments, createdAt } }`
4. 无记录返回 `{ review: null }`

##### GET `/api/foxpre/bid/:id/events` — Kanban SSE

1. 使用 `createSseResponse(res)` 建立 SSE 连接
2. 发送初始状态：`sse.send('state', await getWorkflowState(db, projectId))`
3. 设置定时器每 2 秒轮询 `getWorkflowState`，仅在有变更时推送 `sse.send('state', newState)`
4. 客户端断开时清除定时器：`res.on('close', () => clearInterval(interval))`
5. 发送 keepalive 每 25 秒（复用 SS 的 SSE_KEEPALIVE_INTERVAL_MS）

---

### 2.3 bidder-routes.ts（投标人信息库 CRUD）

**文件**：`apps/daemon/src/foxpre/bidder-routes.ts`

#### 端点清单

| 方法 | 路径 | 说明 | `--json` CLI |
|------|------|------|:--:|
| POST | `/api/foxpre/bidder` | 创建投标人 | ✅ |
| GET | `/api/foxpre/bidder` | 列出所有投标人 | ✅ |
| GET | `/api/foxpre/bidder/:id` | 获取投标人详情 | ✅ |
| PATCH | `/api/foxpre/bidder/:id` | 更新投标人信息 | ✅ |
| DELETE | `/api/foxpre/bidder/:id` | 删除投标人 | ✅ |

#### 各端点实现要求

##### POST `/api/foxpre/bidder` — 创建

1. 接收 JSON body：
   ```json
   { "name": "XX科技有限公司", "统一社会信用代码": "91110000...", "法人代表": "张三", "联系人": "", "联系电话": "" }
   ```
2. 敏感字段加密：
   - `统一社会信用代码` → `encrypt(统一社会信用代码)` → 存入 `统一社会信用代码_enc`
   - `法人代表` → `encrypt(法人代表)` → 存入 `法人代表_enc`
   - `联系电话` → `encrypt(联系电话)` → 存入 `联系电话_enc`
3. 其他字段（name、联系人）明文存储
4. 生成 `crypto.randomUUID()` 作为 id
5. 返回 `{ bidder }`（解密后的完整数据），status 201

##### GET `/api/foxpre/bidder` — 列表

1. `SELECT * FROM foxpre_bidders ORDER BY created_at DESC`
2. 敏感字段解密后返回（`decrypt(统一社会信用代码_enc)` 等）
3. `enc` 字段为空时解密返回空字符串

##### GET `/api/foxpre/bidder/:id` — 详情

1. 查询 `foxpre_bidders` + 关联 `foxpre_bidder_qualifications` + `foxpre_bidder_projects`
2. 返回 `{ bidder, qualifications: [...], projects: [...] }`
3. 不存在返回 404

##### PATCH `/api/foxpre/bidder/:id` — 更新

1. 接收 JSON body（部分字段）
2. 若提供敏感字段值，加密后更新 `_enc` 列
3. `updated_at` 更新为 `Date.now()`
4. 不存在返回 404

##### DELETE `/api/foxpre/bidder/:id` — 删除

1. DELETE 级联：删除 `foxpre_bidder_qualifications` 和 `foxpre_bidder_projects` 中对应 `bidder_id` 的记录
2. 删除 `foxpre_bidders` 记录
3. 不存在返回 404
4. 返回 `{ ok: true }`，status 204

---

### 2.4 style-routes.ts（样式模板 CRUD）

**文件**：`apps/daemon/src/foxpre/style-routes.ts`

#### 端点清单

| 方法 | 路径 | 说明 | `--json` CLI |
|------|------|------|:--:|
| GET | `/api/foxpre/style` | 列出所有样式模板 | ✅ |
| GET | `/api/foxpre/style/:id` | 获取模板详情 | ✅ |
| POST | `/api/foxpre/style` | 创建自定义模板 | ✅ |
| PATCH | `/api/foxpre/style/:id` | 更新模板 | ✅ |
| DELETE | `/api/foxpre/style/:id` | 删除模板 | ✅ |

#### 各端点实现要求

##### GET `/api/foxpre/style` — 列表

1. `SELECT * FROM foxpre_style_templates ORDER BY is_builtin DESC, name ASC`
2. `format_spec_json` 解析为 JSON 对象
3. 返回 `{ templates: [...] }`

##### POST `/api/foxpre/style` — 创建

1. 接收 JSON body：
   ```json
   { "name": "自定义模板", "description": "", "templatePath": "", "formatSpec": {} }
   ```
2. `is_builtin = 0`，生成 `crypto.randomUUID()` 作为 id
3. `format_spec_json` 序列化为 JSON 字符串存储

##### PATCH `/api/foxpre/style/:id` — 更新

1. 仅允许更新 `is_builtin = 0` 的模板（内置模板不可修改）
2. 尝试更新内置模板返回 400 `{ error: '内置模板不可修改' }`

##### DELETE `/api/foxpre/style/:id` — 删除

1. 仅允许删除 `is_builtin = 0` 的模板
2. 删除前检查是否有项目引用此模板（`SELECT COUNT(*) FROM foxpre_projects WHERE 样式模板ID = ?`）
3. 有引用返回 400 `{ error: '该模板正在被项目使用，无法删除' }`
4. 无引用则执行 DELETE

---

### 2.5 foxpre-routes.ts（统一注册入口）

**文件**：`apps/daemon/src/foxpre/foxpre-routes.ts`

聚合 3 个路由文件，提供单一注册函数给 server.ts 使用：

```typescript
import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { registerFoxpreBidRoutes } from './bid-routes.js';
import { registerFoxpreBidderRoutes } from './bidder-routes.js';
import { registerFoxpreStyleRoutes } from './style-routes.js';

export function registerFoxpreRoutes(app: Express, ctx: RouteDeps<'db' | 'http' | 'paths' | 'ids'>): void {
  registerFoxpreBidRoutes(app, ctx);
  registerFoxpreBidderRoutes(app, ctx);
  registerFoxpreStyleRoutes(app, ctx);
}
```

---

### 2.6 server.ts（修改）

**文件**：`apps/daemon/src/server.ts`

#### 2.6.1 import 修改

**位置**：line 449 附近

将现有单行 import：
```typescript
import { initFoxpreDatabase } from './foxpre/db.js';
```

替换为：
```typescript
import { initFoxpreDatabase } from './foxpre/db.js';
import { registerFoxpreRoutes } from './foxpre/foxpre-routes.js';
```

即追加一行新的 import，紧接在 `initFoxpreDatabase` import 之后。

#### 2.6.2 路由注册

**位置**：line 6225 之后（`registerMediaRoutes` 调用闭括号之后、`app.delete('/api/projects/:id'` 之前）

在 `registerMediaRoutes(app, { ... });` 的调用块之后（约 line 6226），插入：

```typescript
  registerFoxpreRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
  });
```

**关键**：foxpre routes 的 ctx 需要 4 个 key：`db`, `http`, `paths`, `ids`。必须与 `registerFoxpreRoutes` 的类型签名以及各子路由文件的 deps 类型一致。

---

### 2.7 server-context.ts（修改）

**文件**：`apps/daemon/src/server-context.ts`

在 `ServerContext` 接口中已存在 `db`, `http`, `paths`, `ids` 等 key，无需新增。但需要确认 `RouteDeps` 类型可以接受 `'db' | 'http' | 'paths' | 'ids'` 联合作为泛型参数。

**验证**：`RouteDeps<'db' | 'http' | 'paths' | 'ids'>` 是否能通过类型检查。如果 server-context.ts 中的 `RouteDeps` 定义为 `Pick<ServerContext, K>` 且 `ServerContext` 包含这 4 个 key，则可以直接使用。实际不需要修改 server-context.ts——直接在各路由文件中使用 `RouteDeps<'db' | 'http' | 'paths' | 'ids'>` 即可。

---

### 2.8 cli.ts（修改 + 追加 4 个命令函数）

**文件**：`apps/daemon/src/cli.ts`

#### 2.8.1 SUBCOMMAND_MAP 追加

将以下条目按字母序插入 `SUBCOMMAND_MAP`（`bid` 在 `automation` 之前，`bidder` 在 `bid` 之后，`style` 在 `status` 之前）：

```typescript
const SUBCOMMAND_MAP = {
  artifacts: runArtifacts,
  // ... 现有条目 ...
  bid: runBid,           // ← 新增（字母序在 automation 之前）
  bidder: runBidder,     // ← 新增
  // ... 现有条目 ...
  style: runStyle,       // ← 新增（字母序在 status 之前）
  status: runStatus,
  // ...
};
```

#### 2.8.2 4 个命令函数（定义在 cli.ts 末尾，其他命令函数附近）

##### `runBid(args)` — `od bid` 命令组

```typescript
async function runBid(args) {
  // 帮助信息
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: od bid <action> [options]`);
    console.log(`Actions:`);
    console.log(`  create  创建投标项目`);
    console.log(`  list    列出投标项目`);
    console.log(`  status  查看项目工作流状态`);
    console.log(`  start   启动工作流`);
    console.log(`  harness 触发门禁审核`);
    console.log(`  review  查看审核报告`);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { boolean: new Set(['json']), string: new Set(['name', 'body-file']) });
  const base = await cliDaemonBaseUrl(flags);
  const writeJson = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  switch (sub) {
    case 'create': {
      const name = flags.name ?? rest[0];
      if (!name) { console.error('Usage: od bid create --name <name>'); process.exit(2); }
      const resp = await fetch(`${base}/api/foxpre/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      writeJson(data);
      return;
    }
    case 'list': {
      const resp = await fetch(`${base}/api/foxpre/bid`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return writeJson(data);
      const projects = data.projects ?? [];
      if (projects.length === 0) { console.log('No bid projects.'); return; }
      console.log('id\tname\tstatus');
      for (const p of projects) console.log(`${p.id}\t${p.name}\t${p.状态}`);
      return;
    }
    case 'status': {
      const id = rest[0];
      if (!id) { console.error('Usage: od bid status <id>'); process.exit(2); }
      const resp = await fetch(`${base}/api/foxpre/bid/${encodeURIComponent(id)}/status`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      writeJson(data);
      return;
    }
    case 'start': {
      const id = rest[0];
      if (!id) { console.error('Usage: od bid start <id>'); process.exit(2); }
      const resp = await fetch(`${base}/api/foxpre/bid/${encodeURIComponent(id)}/start`, { method: 'POST' });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      writeJson(data);
      return;
    }
    case 'harness': {
      const id = rest[0];
      if (!id) { console.error('Usage: od bid harness <id>'); process.exit(2); }
      const resp = await fetch(`${base}/api/foxpre/bid/${encodeURIComponent(id)}/harness`, { method: 'POST' });
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      writeJson(data);
      return;
    }
    case 'review': {
      const id = rest[0];
      if (!id) { console.error('Usage: od bid review <id>'); process.exit(2); }
      const resp = await fetch(`${base}/api/foxpre/bid/${encodeURIComponent(id)}/review`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      writeJson(data);
      return;
    }
    default:
      console.error(`unknown subcommand: od bid ${sub}`);
      process.exit(2);
  }
}
```

##### `runBidder(args)` — `od bidder` 命令组

支持 `list`, `add`, `get`, `delete` 子命令，全部支持 `--json`。模式同上（fetch + writeJson）。

`add` 子命令：通过 `--name` 和 `--body-file` 或 stdin 读取 JSON body，POST 到 `/api/foxpre/bidder`。
`list`：GET，非 json 模式输出 `id\tname` 表格。
`get`：GET，需要 `<id>` 位置参数。
`delete`：DELETE，需要 `<id>`。

##### `runStyle(args)` — `od style` 命令组

支持 `list`, `create`, `get`, `delete` 子命令，全部支持 `--json`。模式同上。

`create`：通过 `--name` 和 `--body-file/stdin` 读取 JSON body。
`list`：非 json 模式输出 `id\tname\tis_builtin` 表格。

**实现指引**：参照 `runAutomation`（cli.ts line 7372）的代码结构 —— help 处理、parseFlags、fetch + writeJson，保持相同风格。

---

## 3. 通用规则

1. **文件约束**：仅修改 8 个文件（5 新增 + 3 修改），不得触碰其他文件
2. **类型约束**：所有请求/响应使用 `packages/contracts/src/foxpre/api.ts` 中的类型，不自行定义相同结构的类型
3. **密码学约束**：field-crypto.ts 使用 Node.js 内置 `crypto` 模块，不得安装第三方加密依赖
4. **路由注册约束**：遵循 `register*Routes(app, ctx)` 纯函数模式，ctx 类型来自 `RouteDeps`
5. **错误处理约束**：统一使用 `ctx.http.sendApiError(res, code, type, message)` 返回错误
6. **数据库约束**：所有 SQL 操作仅限 `foxpre_` 前缀表
7. **CLI 约束**：命令函数定义在 cli.ts 内部（内联），不创建新的 commands/ 目录
8. **SSE 约束**：使用 `ctx.http.createSseResponse(res)` 建立 SSE 流，不自行设置 header

---

## 4. 验证关口（逐项检查）

| # | 检查项 | 方法 |
|---|--------|------|
| 1 | `pnpm guard` 零错误 | `pnpm guard` |
| 2 | `pnpm typecheck` 零错误（contracts + daemon） | `pnpm typecheck` |
| 3 | 仅修改 8 个文件 | `git diff --stat foxpre/v0.10/dev` |
| 4 | field-crypto 加密/解密循环通过 | `encrypt('hello') → decrypt(encoded) === 'hello'` |
| 5 | bid-routes 全部 8 个端点可访问 | `curl` 逐个端点 |
| 6 | bidder-routes 敏感字段加密存储 | 查数据库列值非明文 |
| 7 | style-routes 内置模板不可删除 | DELETE 内置模板返回 400 |
| 8 | Kanban SSE 推送状态变更 | 连接 SSE → 变更状态 → 收到推送 |
| 9 | CLI `od bid create --name test` 成功 | `node dist/daemon/cli.js bid create --name test` |
| 10 | CLI `od bid list` / `od bid status <id>` 有输出 | 同上 |
| 11 | CLI `od bidder add/list` / `od style list` 有输出 | 同上 |
| 12 | `pnpm --filter @open-design/daemon test tests/foxpre/` 全部通过 | 53 + 新增用例 |
| 13 | 未修改现有 foxpre 源文件（db.ts 等） | `git diff` 确认 |
| 14 | 分支 `foxpre/v0.10/phase-six`，非 `foxpre/v0.10/dev` | `git branch --show-current` |

---

## 5. 操作指南

```bash
# 第零步：切出阶段六开发分支
git checkout foxpre/v0.10/dev
git checkout -b foxpre/v0.10/phase-six

# 第一步：编写 field-crypto.ts（纯工具，无外部依赖）

# 第二步：编写 bid-routes.ts（规模最大的文件）

# 第三步：编写 bidder-routes.ts

# 第四步：编写 style-routes.ts

# 第五步：编写 foxpre-routes.ts（聚合 + 统一注册）

# 第六步：修改 server.ts（1 行 import + 1 处 registerFoxpreRoutes 调用）

# 第七步：修改 cli.ts（追加 SUBCOMMAND_MAP 条目 + 4 个函数）

# 第八步：自检
pnpm guard
pnpm typecheck
# 启动 daemon 做手动端到端验证

# 第九步：推送
git push origin foxpre/v0.10/phase-six

# 第十步：通知架构师审查
# 审查通过后由架构师合入 foxpre/v0.10/dev
```

---

## 6. 架构师备注（供审查用）

1. **foxpre-routes.ts 聚合文件**避免 server.ts 中出现 3 个独立 import + 3 个 register 调用，将扩展面控制在 1 行 import + 1 处注册。

2. **SoloCoder 函数不直接暴露为 HTTP 端点**：`createWorkflow`/`advanceWorkflow`/`completeTask`/`failTask` 等调度函数通过 bid-routes 的 `/start` 和 `/harness` 端点间接调用，不提供裸的 `/api/foxpre/solo-coder/*` 端点。单个 `completeTask`/`failTask` 级别操作在 MVP 阶段由 Orchestrator Skill（LLM）通过 `/api/runs` 机制完成。

3. **bid-routes 默认不实现请求校验中间件**，遵循 routine.ts 和 media-routes.ts 的轻量约定（handler 内校验 + sendApiError）。

4. **Kanban SSE 使用轮询而非事件驱动**：MVP 阶段每 2 秒查询一次 `getWorkflowState`，简化实现。阶段九可升级为 EventEmitter 驱动。

5. **CLI 命令内联**：不创建独立 `commands/` 文件，保持与现有 `runAutomation`、`runResearch` 等 20+ 个命令一致的风格。

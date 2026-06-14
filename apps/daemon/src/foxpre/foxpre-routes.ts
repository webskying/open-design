/**
 * foxpre 路由统一注册入口
 *
 * 聚合 3 个路由文件，提供单一注册函数给 server.ts 使用。
 * 将扩展面控制在 1 行 import + 1 处注册。
 */

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

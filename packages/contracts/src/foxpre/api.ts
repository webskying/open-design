import type { ProjectMetadata } from '../api/projects.js';
import type { BidProjectStatus, FoxpreTaskStatus } from './constants.js';

/** bid 类项目的扩展元数据 */
export interface BidProjectMetadata extends ProjectMetadata {
  kind: 'bid';
  /** 招标文件名 */
  招标文件名?: string;
  /** 招标编号 */
  招标编号?: string;
  /** 关联投标人 ID */
  投标人ID?: string;
  /** 样式模板 ID */
  样式模板ID?: string;
  /** 引用项目 ID 列表 */
  引用项目ID列表?: string[];
  /** 当前审核轮次 */
  当前审核轮次?: number;
}

/** 智能体任务 */
export interface AgentTask {
  id: string;
  projectId: string;
  agentCode: string;
  status: FoxpreTaskStatus;
  /** Git commit SHA */
  commitSha?: string;
  /** 输出文件路径 */
  outputPath?: string;
  /** 依赖任务 ID 列表 */
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

/** 审核报告 */
export interface ReviewReport {
  id: string;
  projectId: string;
  taskId: string;
  round: number;
  passed: boolean;
  /** 审核意见 */
  comments: ReviewComment[];
  createdAt: string;
}

export interface ReviewComment {
  rule: string;
  passed: boolean;
  detail: string;
  suggestion?: string;
}

/** 门禁单条检查结果 */
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  detail: string;
  /** 关联的文档片段 ID */
  fragmentId: string;
}

/** 样式模板 */
export interface StyleTemplate {
  id: string;
  name: string;
  description?: string;
  /** 模板文件路径（空白 DOCX） */
  templatePath: string;
  /** 格式规范 JSON */
  formatSpec: Record<string, unknown>;
  isBuiltin: boolean;
  createdAt: string;
}

/** 投标人信息 */
export interface Bidder {
  id: string;
  name: string;
  /** 统一社会信用代码（加密存储） */
  统一社会信用代码?: string;
  /** 法人代表（加密存储） */
  法人代表?: string;
  createdAt: string;
}

/** 招标文件引用（纯数据 DTO，不含浏览器 API） */
export interface BidDocumentRef {
  name: string;
  size: number;
  type: string;
}

/** API 请求/响应类型 */
export interface CreateBidProjectRequest {
  name: string;
  description?: string;
  /** 招标文件引用（纯数据 DTO，非浏览器 File） */
  招标文件?: BidDocumentRef;
  招标编号?: string;
  投标人ID?: string;
  样式模板ID?: string;
  引用项目ID列表?: string[];
}

export interface CreateBidProjectResponse {
  projectId: string;
  status: BidProjectStatus;
}

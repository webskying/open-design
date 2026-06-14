/** foxpre 智能体代号（按 DAG 执行顺序） */
export const AGENT_CODES = {
  ANALYZER: 'Analyzer',
  TECH_WRITER: 'TechWriter',
  BIZ_WRITER: 'BizWriter',
  QUAL_WRITER: 'QualWriter',
  HARNESS_RUNNER: 'HarnessRunner',
  STYLE_CHECKER: 'StyleChecker',
  DOCX_ASSEMBLER: 'DocxAssembler',
  ORCHESTRATOR: 'Orchestrator',
  BIDDER_MANAGER: 'BidderManager',
} as const;

export type AgentCode = (typeof AGENT_CODES)[keyof typeof AGENT_CODES];

/** 投标项目状态 */
export const BID_PROJECT_STATUS = {
  PENDING: '待启动',
  IN_PROGRESS: '进行中',
  REVIEW: '审核中',
  REJECTED: '已驳回',
  COMPLETED: '已完成',
} as const;

export type BidProjectStatus = (typeof BID_PROJECT_STATUS)[keyof typeof BID_PROJECT_STATUS];

/** 智能体任务状态 */
export const TASK_STATUS = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
} as const;

export type FoxpreTaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** 看板列 */
export const KANBAN_COLUMNS = {
  TODO: '待启动',
  IN_PROGRESS: '进行中',
  REVIEW: '等待审核',
  NEEDS_REVISION: '需修改',
  DONE: '已完成',
} as const;

export type KanbanColumn = (typeof KANBAN_COLUMNS)[keyof typeof KANBAN_COLUMNS];

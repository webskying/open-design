import React from 'react';

interface AgentTask {
  id: string;
  agentCode: string;
  status: string;
  dependsOn: string[];
  outputPath: string | null;
  errorLog: string | null;
  updatedAt?: number | string;
}

interface KanbanCardProps {
  task: AgentTask;
  onSelect: (agentCode: string) => void;
}

const AGENT_LABELS: Record<string, string> = {
  Analyzer: '📊 招标分析',
  TechWriter: '📝 技术方案撰写',
  BizWriter: '💼 商务方案撰写',
  QualWriter: '📋 资质文件整理',
  HarnessRunner: '🔍 门禁审核',
  StyleChecker: '🎨 样式检查',
  DocxAssembler: '📄 文档组装',
  Orchestrator: '⚙️ 调度器',
  BidderManager: '👤 投标人管理',
};

const AGENT_LABELS_EN: Record<string, string> = {
  Analyzer: '📊 Bid Analysis',
  TechWriter: '📝 Technical Writing',
  BizWriter: '💼 Business Writing',
  QualWriter: '📋 Qualification',
  HarnessRunner: '🔍 Harness Review',
  StyleChecker: '🎨 Style Check',
  DocxAssembler: '📄 Document Assembly',
  Orchestrator: '⚙️ Orchestrator',
  BidderManager: '👤 Bidder Manager',
};

const STATUS_COLORS: Record<string, string> = {
  '排队中': 'bg-gray-200',
  '执行中': 'bg-yellow-400 animate-pulse',
  '已完成': 'bg-green-500',
  '失败': 'bg-red-500',
  '已取消': 'bg-gray-500',
};

function formatTime(ts: number | string | undefined): string {
  if (!ts) return '';
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(n)) return '';
  return new Date(n).toLocaleTimeString();
}

export function KanbanCard({ task, onSelect }: KanbanCardProps) {
  const statusColor = STATUS_COLORS[task.status] ?? 'bg-gray-200';
  const label = AGENT_LABELS[task.agentCode] ?? AGENT_LABELS_EN[task.agentCode] ?? task.agentCode;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
        <span className="text-xs font-medium text-gray-600 truncate">{task.agentCode}</span>
      </div>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="text-xs text-gray-500 mb-2">
        状态: {task.status}
        {task.updatedAt && ` · ${formatTime(task.updatedAt)}`}
      </div>
      <button
        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
        onClick={() => onSelect(task.agentCode)}
      >
        对话
      </button>
    </div>
  );
}

import React from 'react';
import { KanbanCard } from './KanbanCard';

interface AgentTask {
  id: string;
  agentCode: string;
  status: string;
  dependsOn: string[];
  outputPath: string | null;
  errorLog: string | null;
}

interface KanbanBoardProps {
  tasks: AgentTask[];
  onSelectAgent: (agentCode: string) => void;
}

const COLUMNS = ['待启动', '进行中', '等待审核', '需修改', '已完成'] as const;

function mapStatusToKanbanColumn(taskStatus: string): string {
  switch (taskStatus) {
    case '排队中': return '待启动';
    case '执行中': return '进行中';
    case '已完成': return '等待审核';
    case '失败': return '需修改';
    case '已取消': return '已完成';
    default: return '待启动';
  }
}

export function KanbanBoard({ tasks, onSelectAgent }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto p-4 h-full">
      {COLUMNS.map((col) => {
        const cards = tasks.filter((t) => mapStatusToKanbanColumn(t.status) === col);
        return (
          <div key={col} className="flex flex-col gap-2 min-w-[200px] w-[200px]">
            <h3 className="text-sm font-semibold px-2 py-1 bg-gray-100 rounded">
              {col} ({cards.length})
            </h3>
            {cards.map((task) => (
              <KanbanCard key={task.id} task={task} onSelect={onSelectAgent} />
            ))}
            {cards.length === 0 && (
              <div className="text-xs text-gray-400 px-2 py-4 text-center border-dashed border border-gray-200 rounded">
                无任务
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

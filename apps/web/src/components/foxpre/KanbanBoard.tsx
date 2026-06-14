import React from 'react';
import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
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

const COLUMN_KEYS: (keyof Dict)[] = [
  'foxpre.todo',
  'foxpre.inProgress',
  'foxpre.review',
  'foxpre.needsRevision',
  'foxpre.done',
];

function mapStatusToKanbanColumn(taskStatus: string): string {
  switch (taskStatus) {
    case '排队中': return 'foxpre.todo';
    case '执行中': return 'foxpre.inProgress';
    case '已完成': return 'foxpre.review';
    case '失败': return 'foxpre.needsRevision';
    case '已取消': return 'foxpre.done';
    default: return 'foxpre.todo';
  }
}

export function KanbanBoard({ tasks, onSelectAgent }: KanbanBoardProps) {
  const t = useT();
  const columns = COLUMN_KEYS.map(k => t(k));

  return (
    <div className="flex gap-4 overflow-x-auto p-4 h-full">
      {columns.map((col, index) => {
        const key = COLUMN_KEYS[index];
        const cards = tasks.filter((t) => mapStatusToKanbanColumn(t.status) === key);
        return (
          <div key={key} className="flex flex-col gap-2 min-w-[200px] w-[200px]">
            <h3 className="text-sm font-semibold px-2 py-1 bg-gray-100 rounded">
              {col} ({cards.length})
            </h3>
            {cards.map((task) => (
              <KanbanCard key={task.id} task={task} onSelect={onSelectAgent} />
            ))}
            {cards.length === 0 && (
              <div className="text-xs text-gray-400 px-2 py-4 text-center border-dashed border border-gray-200 rounded">
                {t('foxpre.noTasks')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

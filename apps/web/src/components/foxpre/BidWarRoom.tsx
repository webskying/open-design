import React, { useCallback, useEffect, useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { DocumentPreview } from './DocumentPreview';
import { AgentChatDrawer } from './AgentChatDrawer';
import { BidSettingsPanel } from './BidSettingsPanel';
import { useT } from '../../i18n';

interface WorkflowTask {
  id: string;
  agentCode: string;
  status: string;
  dependsOn: string[];
  outputPath: string | null;
  errorLog: string | null;
  updatedAt?: number | string;
}

interface WorkflowState {
  projectStatus: string;
  reviewRound: number;
  tasks: WorkflowTask[];
}

interface BidProjectMetadata {
  kind: 'bid';
  招标文件名?: string;
  招标编号?: string;
  投标人ID?: string;
  样式模板ID?: string;
  引用项目ID列表?: string[];
  当前审核轮次?: number;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  '招标编号'?: string;
  投标人ID?: string;
  样式模板ID?: string;
  '状态'?: string;
  当前审核轮次?: number;
  tasks?: WorkflowTask[];
  fragmentCount?: number;
}

interface BidWarRoomProps {
  projectId: string;
  metadata?: BidProjectMetadata | null;
}

export function BidWarRoom({ projectId, metadata }: BidWarRoomProps) {
  const t = useT();
  const [kanbanState, setKanbanState] = useState<WorkflowState | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [selectedFragment, setSelectedFragment] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Data loading
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/foxpre/bid/${projectId}`).then((r) => r.json()),
      fetch(`/api/foxpre/bid/${projectId}/status`).then((r) => r.json()),
    ])
      .then(([projectData, statusData]) => {
        setProject(projectData as ProjectDetail);
        setKanbanState(statusData as WorkflowState);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [projectId]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource(`/api/foxpre/bid/${projectId}/events`);
    es.addEventListener('state', (e: MessageEvent) => {
      try {
        setKanbanState(JSON.parse(e.data) as WorkflowState);
      } catch {}
    });
    return () => es.close();
  }, [projectId]);

  const handleStartWorkflow = useCallback(async () => {
    setActionLoading('start');
    try {
      const resp = await fetch(`/api/foxpre/bid/${projectId}/start`, { method: 'POST' });
      if (!resp.ok) throw new Error('启动失败');
      const data = await resp.json() as { state: WorkflowState };
      setKanbanState(data.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(null);
    }
  }, [projectId]);

  const handleTriggerHarness = useCallback(async () => {
    setActionLoading('harness');
    try {
      const resp = await fetch(`/api/foxpre/bid/${projectId}/harness`, { method: 'POST' });
      if (!resp.ok) throw new Error('触发门禁失败');
      const data = await resp.json();
      if (data.kanbanState) setKanbanState(data.kanbanState as WorkflowState);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(null);
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">{t('foxpre.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-blue-600">📋 foxpre</span>
          <span className="text-sm font-medium text-gray-700">
            {project?.name ?? projectId}
          </span>
          {kanbanState && (
            <span className="text-xs text-gray-500">{t('foxpre.kanban')}: {kanbanState.reviewRound}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            onClick={() => setShowSettings(true)}
          >
            {t('foxpre.projectSettings')}
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            onClick={handleStartWorkflow}
            disabled={actionLoading === 'start'}
          >
            {actionLoading === 'start' ? t('foxpre.startWorkflow') + '...' : t('foxpre.startWorkflow')}
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
            onClick={handleTriggerHarness}
            disabled={actionLoading === 'harness'}
          >
            {actionLoading === 'harness' ? t('foxpre.triggerHarness') + '...' : t('foxpre.triggerHarness')}
          </button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Kanban */}
        <div className="w-80 flex-shrink-0 border-r overflow-y-auto bg-gray-50">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 pt-3 pb-1">
            {t('foxpre.kanban')}
          </h3>
          <KanbanBoard
            tasks={kanbanState?.tasks ?? []}
            onSelectAgent={setActiveAgent}
          />
        </div>

        {/* Center: Document Preview */}
        <div className="flex-1 overflow-y-auto">
          <DocumentPreview
            projectId={projectId}
            selectedAgent={activeAgent}
            tasks={kanbanState?.tasks ?? []}
          />
        </div>

        {/* Right: Agent Chat trigger (drawer opens on top) */}
        <div className="w-12 flex-shrink-0 border-l flex flex-col items-center py-4 bg-gray-50">
          {kanbanState?.tasks.map((t) => (
            <button
              key={t.id}
              className={`w-8 h-8 rounded-full mb-2 text-xs font-medium transition-colors ${
                activeAgent === t.agentCode
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              onClick={() => setActiveAgent(t.agentCode)}
              title={t.agentCode}
            >
              {t.agentCode.charAt(0)}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Chat Drawer */}
      <AgentChatDrawer
        projectId={projectId}
        agentCode={activeAgent}
        onClose={() => setActiveAgent(null)}
      />

      {/* Settings Panel */}
      {showSettings && (
        <BidSettingsPanel
          projectId={projectId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

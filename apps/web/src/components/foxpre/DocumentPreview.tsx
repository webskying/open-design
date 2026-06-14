import React, { useEffect, useState } from 'react';
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

interface DocumentPreviewProps {
  projectId: string;
  selectedAgent: string | null;
  tasks: WorkflowTask[];
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  '招标编号'?: string;
  '状态'?: string;
  fragmentCount?: number;
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

export function DocumentPreview({ projectId, selectedAgent, tasks }: DocumentPreviewProps) {
  const t = useT();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [agentContent, setAgentContent] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load project overview
  useEffect(() => {
    if (!selectedAgent) {
      fetch(`/api/foxpre/bid/${projectId}`)
        .then((r) => r.json())
        .then((data) => setProject(data as ProjectDetail))
        .catch(() => {});
    }
  }, [projectId, selectedAgent]);

  // Load agent output when agent selected
  useEffect(() => {
    if (!selectedAgent || tasks.length === 0) return;

    const task = tasks.find((t) => t.agentCode === selectedAgent);
    if (!task) {
      setAgentStatus(null);
      setAgentError(t('foxpre.noAgentFound'));
      setAgentContent(null);
      return;
    }

    setAgentStatus(task.status);
    setAgentError(task.errorLog);

    if (task.status === '执行中' || task.status === '排队中') {
      setAgentContent(null);
      return;
    }

    if (task.status === '失败') {
      setAgentContent(null);
      return;
    }

    if (task.status === '已完成' || task.status === '已取消') {
      if (task.outputPath) {
        setLoading(true);
        fetch(`/api/foxpre/bid/${encodeURIComponent(projectId)}/output?taskId=${encodeURIComponent(task.id)}`)
          .then((r) => r.text())
          .then((text) => {
            setAgentContent(text);
          })
          .catch(() => {
            setAgentContent(null);
            setAgentError(t('foxpre.loadOutputFailed'));
          })
          .finally(() => setLoading(false));
      }
    }
  }, [selectedAgent, projectId, tasks, t]);

  // Project overview (no agent selected)
  if (!selectedAgent) {
    return (
      <div className="p-6">
        {project ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">{project.name}</h2>
            {project['招标编号'] && (
              <p className="text-sm text-gray-600 mb-2">{t('foxpre.bidNumber')}: {project['招标编号']}</p>
            )}
            {project.description && (
              <p className="text-sm text-gray-600 mb-2">{project.description}</p>
            )}
            <p className="text-sm text-gray-500 mb-2">{t('foxpre.status')}: {project['状态'] ?? t('foxpre.noAgentFound')}</p>
            {project.fragmentCount !== undefined && (
              <p className="text-sm text-gray-500">{t('foxpre.documentPreview')}: {project.fragmentCount}</p>
            )}
          </div>
        ) : (
          <div className="text-gray-400">{t('foxpre.loading')}</div>
        )}
      </div>
    );
  }

  // Agent-specific preview
  const agentLabel = AGENT_LABELS[selectedAgent] ?? selectedAgent;

  return (
    <div className="p-6">
      <h3 className="text-lg font-medium mb-4">{agentLabel} {t('foxpre.documentPreview')}</h3>

      {/* Error state */}
      {agentError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4">
          {agentError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-sm text-gray-400">{t('foxpre.loading')}</div>
      )}

      {/* Running/pending state */}
      {!agentError && !loading && !agentContent && agentStatus === '执行中' && (
        <div className="text-sm text-gray-500">
          <span className="inline-block w-3 h-3 bg-yellow-400 rounded-full animate-pulse mr-2" />
          {t('foxpre.generating')}
        </div>
      )}

      {!agentError && !loading && !agentContent && agentStatus === '排队中' && (
        <div className="text-sm text-gray-400">{t('foxpre.pendingDispatch')}</div>
      )}

      {/* Content */}
      {!loading && agentContent && (
        <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded border overflow-auto max-h-[60vh]">
          {agentContent}
        </pre>
      )}

      {/* Completed but no output */}
      {!loading && !agentContent && !agentError && agentStatus === '已完成' && (
        <div className="text-sm text-gray-400">{t('foxpre.outputNotReady')}</div>
      )}
    </div>
  );
}

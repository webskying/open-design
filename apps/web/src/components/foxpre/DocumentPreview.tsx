import React, { useEffect, useState } from 'react';

interface DocumentPreviewProps {
  projectId: string;
  selectedAgent: string | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  '招标编号'?: string;
  '状态'?: string;
  fragmentCount?: number;
}

export function DocumentPreview({ projectId, selectedAgent }: DocumentPreviewProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedAgent) {
      // Load project overview when no agent selected
      fetch(`/api/foxpre/bid/${projectId}`)
        .then((r) => r.json())
        .then((data) => setProject(data as ProjectDetail))
        .catch(() => {});
    }
  }, [projectId, selectedAgent]);

  if (!selectedAgent) {
    // Project overview
    return (
      <div className="p-6">
        {project ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">{project.name}</h2>
            {project['招标编号'] && (
              <p className="text-sm text-gray-600 mb-2">招标编号: {project['招标编号']}</p>
            )}
            {project.description && (
              <p className="text-sm text-gray-600 mb-2">{project.description}</p>
            )}
            <p className="text-sm text-gray-500 mb-2">状态: {project['状态'] ?? '未知'}</p>
            {project.fragmentCount !== undefined && (
              <p className="text-sm text-gray-500">文档片段: {project.fragmentCount}</p>
            )}
          </div>
        ) : (
          <div className="text-gray-400">加载中...</div>
        )}
      </div>
    );
  }

  // Agent-specific preview
  return (
    <div className="p-6">
      <h3 className="text-lg font-medium mb-4">{selectedAgent} 输出</h3>
      <div className="text-sm text-gray-500">
        <p>正在生成...</p>
        <pre className="mt-4 bg-gray-50 p-4 rounded border text-xs overflow-auto max-h-[60vh]">
          {`Agent: ${selectedAgent}\nProject: ${projectId}\nStatus: Generating...`}
        </pre>
      </div>
    </div>
  );
}

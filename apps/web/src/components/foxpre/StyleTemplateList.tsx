import React, { useEffect, useState } from 'react';

interface StyleTemplateListProps {
  onSelect: (templateId: string) => void;
}

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  isBuiltin: boolean;
}

export function StyleTemplateList({ onSelect }: StyleTemplateListProps) {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/foxpre/style')
      .then((r) => r.json())
      .then((data) => {
        setTemplates((data as { templates: TemplateItem[] }).templates ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-400 p-4">加载中...</div>;

  return (
    <div className="p-4">
      <h4 className="font-medium text-sm mb-3">样式模板</h4>
      {templates.length === 0 ? (
        <div className="text-sm text-gray-400">暂无模板</div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(t.id)}
            >
              <div>
                <span className="text-sm font-medium">
                  {t.isBuiltin ? '🔒 ' : ''}{t.name}
                </span>
                {t.description && (
                  <span className="text-xs text-gray-500 ml-2">{t.description}</span>
                )}
              </div>
              {t.isBuiltin && <span className="text-xs text-gray-400">内置</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

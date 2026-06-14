import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n';

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
  const t = useT();
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

  if (loading) return <div className="text-sm text-gray-400 p-4">{t('foxpre.loading')}</div>;

  return (
    <div className="p-4">
      <h4 className="font-medium text-sm mb-3">{t('foxpre.styleTemplate')}</h4>
      {templates.length === 0 ? (
        <div className="text-sm text-gray-400">{t('foxpre.noTemplates')}</div>
      ) : (
        <div className="space-y-2">
          {templates.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(item.id)}
            >
              <div>
                <span className="text-sm font-medium">
                  {item.isBuiltin ? '🔒 ' : ''}{item.name}
                </span>
                {item.description && (
                  <span className="text-xs text-gray-500 ml-2">{item.description}</span>
                )}
              </div>
              {item.isBuiltin && <span className="text-xs text-gray-400">{t('foxpre.builtin')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

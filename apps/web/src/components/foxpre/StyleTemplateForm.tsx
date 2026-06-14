import React, { useState } from 'react';
import { useT } from '../../i18n';

interface StyleTemplateFormProps {
  templateId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function StyleTemplateForm({ templateId, onSaved, onCancel }: StyleTemplateFormProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templatePath, setTemplatePath] = useState('');
  const [formatSpec, setFormatSpec] = useState('{}');
  const [formatError, setFormatError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFormatSpec = (): boolean => {
    try {
      JSON.parse(formatSpec);
      setFormatError(null);
      return true;
    } catch {
      setFormatError(t('foxpre.jsonInvalid'));
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (!validateFormatSpec()) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsedSpec = JSON.parse(formatSpec);
      const body = {
        name: name.trim(),
        description: description || undefined,
        templatePath: templatePath || undefined,
        formatSpec: parsedSpec,
      };
      const url = templateId
        ? `/api/foxpre/style/${encodeURIComponent(templateId)}`
        : '/api/foxpre/style';
      const method = templateId ? 'PATCH' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errData = await resp.json() as { message?: string };
        throw new Error(errData.message ?? t('foxpre.operationFailed'));
      }
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 p-4 max-w-sm">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('foxpre.templateName')} *</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">描述</label>
        <textarea
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">模板路径</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={templatePath}
          onChange={(e) => setTemplatePath(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          格式规范 (JSON)
          {formatError && <span className="text-red-500 ml-2 text-xs">{formatError}</span>}
        </label>
        <textarea
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
          rows={3}
          value={formatSpec}
          onChange={(e) => setFormatSpec(e.target.value)}
          onBlur={validateFormatSpec}
        />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button
          className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
        >
          {submitting ? '保存中...' : '保存'}
        </button>
        <button
          className="px-4 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}

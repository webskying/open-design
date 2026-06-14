import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface CreateBidFormProps {
  projectName: string;
  onCreated: (projectId: string) => void;
}

interface BidderOption {
  id: string;
  name: string;
}

interface StyleOption {
  id: string;
  name: string;
}

export function CreateBidForm({ projectName, onCreated }: CreateBidFormProps) {
  const t = useT();
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState('');
  const [bidNumber, setBidNumber] = useState('');
  const [bidderId, setBidderId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [bidders, setBidders] = useState<BidderOption[]>([]);
  const [templates, setTemplates] = useState<StyleOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/foxpre/bidder')
      .then((r) => r.json())
      .then((data) => setBidders((data as { bidders: BidderOption[] }).bidders ?? []))
      .catch(() => {});
    fetch('/api/foxpre/style')
      .then((r) => r.json())
      .then((data) => setTemplates((data as { templates: StyleOption[] }).templates ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch('/api/foxpre/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description,
          招标编号: bidNumber,
          投标人ID: bidderId || undefined,
          样式模板ID: templateId || undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json() as { message?: string };
        throw new Error(errData.message ?? '创建失败');
      }
      const data = await resp.json() as { projectId: string };
      onCreated(data.projectId);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('foxpre.projectName')}</label>
        <input
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('foxpre.description')}</label>
        <textarea
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('foxpre.bidNumber')}</label>
        <input
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          value={bidNumber}
          onChange={(e) => setBidNumber(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">投标人</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          value={bidderId}
          onChange={(e) => setBidderId(e.target.value)}
        >
          <option value="">请选择投标人</option>
          {bidders.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">样式模板</label>
        <select
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">请选择模板</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        className="w-full px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
        onClick={handleSubmit}
        disabled={submitting || !name.trim()}
      >
        {submitting ? '创建中...' : '创建投标项目'}
      </button>
    </div>
  );
}

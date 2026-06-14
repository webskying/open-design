import React, { useState } from 'react';
import { useT } from '../../i18n';

interface BidderFormProps {
  bidderId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function BidderForm({ bidderId, onSaved, onCancel }: BidderFormProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [creditCode, setCreditCode] = useState('');
  const [legalRep, setLegalRep] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        统一社会信用代码: creditCode || undefined,
        法人代表: legalRep || undefined,
        联系人: contact || undefined,
        联系电话: phone || undefined,
      };
      const url = bidderId
        ? `/api/foxpre/bidder/${encodeURIComponent(bidderId)}`
        : '/api/foxpre/bidder';
      const method = bidderId ? 'PATCH' : 'POST';
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
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('foxpre.bidderName')} *</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{t('foxpre.creditCode')}</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={creditCode}
          onChange={(e) => setCreditCode(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">法人代表</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={legalRep}
          onChange={(e) => setLegalRep(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">联系人</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">联系电话</label>
        <input
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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

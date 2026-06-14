import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface BidderListProps {
  onSelect: (bidderId: string) => void;
  onAdd: () => void;
}

interface BidderItem {
  id: string;
  name: string;
  联系人?: string;
  updatedAt?: number;
}

export function BidderList({ onSelect, onAdd }: BidderListProps) {
  const t = useT();
  const [bidders, setBidders] = useState<BidderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/foxpre/bidder')
      .then((r) => r.json())
      .then((data) => {
        setBidders((data as { bidders: BidderItem[] }).bidders ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/api/foxpre/bidder/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (resp.ok) load();
    } catch {}
  };

  if (loading) return <div className="text-sm text-gray-400 p-4">{t('foxpre.loading')}</div>;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-sm">{t('foxpre.bidderList')}</h4>
        <button
          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
          onClick={onAdd}
        >
          {t('foxpre.add')}
        </button>
      </div>
      {bidders.length === 0 ? (
        <div className="text-sm text-gray-400">暂无投标人</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">名称</th>
              <th className="pb-2 font-medium">联系人</th>
              <th className="pb-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {bidders.map((b) => (
              <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2">{b.name}</td>
                <td className="py-2 text-gray-500">{b.联系人 ?? '-'}</td>
                <td className="py-2">
                  <button
                    className="text-blue-600 hover:underline mr-2 text-xs"
                    onClick={() => onSelect(b.id)}
                  >
                    编辑
                  </button>
                  <button
                    className="text-red-600 hover:underline text-xs"
                    onClick={() => handleDelete(b.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { BidderList } from './BidderList';
import { BidderForm } from './BidderForm';
import { StyleTemplateList } from './StyleTemplateList';

interface BidSettingsPanelProps {
  projectId: string;
  onClose: () => void;
}

export function BidSettingsPanel({ projectId, onClose }: BidSettingsPanelProps) {
  const [showBidderForm, setShowBidderForm] = useState(false);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-50 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-medium">项目设置</h2>
          <button
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1">
          {/* Section 1: 投标人管理 */}
          <div className="border-b">
            <div className="px-4 py-3 bg-gray-50">
              <h3 className="font-medium text-sm">投标人管理</h3>
            </div>
            {showBidderForm ? (
              <BidderForm
                onSaved={() => setShowBidderForm(false)}
                onCancel={() => setShowBidderForm(false)}
              />
            ) : (
              <BidderList
                onSelect={() => {}}
                onAdd={() => setShowBidderForm(true)}
              />
            )}
          </div>

          {/* Section 2: 样式模板 */}
          <div>
            <div className="px-4 py-3 bg-gray-50">
              <h3 className="font-medium text-sm">样式模板</h3>
            </div>
            <StyleTemplateList
              onSelect={async (templateId) => {
                try {
                  await fetch(`/api/foxpre/bid/${encodeURIComponent(projectId)}/start`, {
                    method: 'POST',
                  });
                  // PATCH project to update style template
                } catch {}
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

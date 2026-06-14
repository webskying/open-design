import React, { useState } from 'react';

interface AgentChatDrawerProps {
  projectId: string;
  agentCode: string | null;
  onClose: () => void;
}

export function AgentChatDrawer({ projectId, agentCode, onClose }: AgentChatDrawerProps) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  if (!agentCode) return null;

  const handleSend = () => {
    if (!message.trim()) return;
    // MVP: just show confirmation
    setSent(true);
    setMessage('');
    setTimeout(() => setSent(false), 2000);
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-xl z-50 flex flex-col transition-transform">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-medium text-sm">对话 - {agentCode}</h3>
          <button
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Messages area (MVP: placeholder) */}
        <div className="flex-1 p-4 overflow-y-auto">
          {sent && (
            <div className="text-xs text-green-600 bg-green-50 p-2 rounded mb-2">
              消息已发送至 {agentCode}
            </div>
          )}
          <p className="text-xs text-gray-400 text-center mt-8">
            向 {agentCode} 发送指令
          </p>
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="输入消息..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
              onClick={handleSend}
              disabled={!message.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

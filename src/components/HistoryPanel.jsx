"use client";
import {
  Clock, Trash2, ChevronLeft, ChevronRight,
  ImageIcon, Search, X,
} from "lucide-react";

export default function HistoryPanel({
  messages,
  onSelectHistory,
  onClearHistory,
  collapsed,
  onCollapsedChange,
  search,
  onSearchChange,
}) {

  const completedMsgs = messages.filter(
    (m) => m.role === "assistant" && m.status === "completed" && m.urls?.length > 0
  );

  const filtered = search.trim()
    ? completedMsgs.filter((m) =>
        m.text?.toLowerCase().includes(search.toLowerCase()) ||
        m.modelLabel?.toLowerCase().includes(search.toLowerCase())
      )
    : completedMsgs;

  const reversed = [...filtered].reverse();

  if (collapsed) {
    return (
      <div className="w-10 bg-bg-secondary border-r border-border-primary flex flex-col items-center pt-3 flex-shrink-0">
        <button
          onClick={() => onCollapsedChange?.(false)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
          title="展开历史记录"
        >
          <ChevronRight size={16} />
        </button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary mt-1">
          <Clock size={14} />
        </div>
        {completedMsgs.length > 0 && (
          <span className="text-[9px] text-text-tertiary mt-0.5">{completedMsgs.length}</span>
        )}
      </div>
    );
  }

  return (
    <div className="w-[220px] bg-bg-secondary border-r border-border-primary flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-border-primary flex-shrink-0">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-text-tertiary" />
          <span className="text-xs font-medium text-text-primary">历史记录</span>
          {completedMsgs.length > 0 && (
            <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded-md">
              {completedMsgs.length}
            </span>
          )}
        </div>
        <button
          onClick={() => onCollapsedChange?.(true)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
          title="收起"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Search */}
      {completedMsgs.length > 3 && (
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-bg-tertiary border border-border-primary rounded-lg px-2 py-1.5">
            <Search size={12} className="text-text-tertiary flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="搜索历史..."
              className="flex-1 bg-transparent text-[11px] text-text-primary placeholder-text-tertiary outline-none"
            />
            {search && (
              <button onClick={() => onSearchChange?.("")} className="text-text-tertiary hover:text-text-primary">
                <X size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* History items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0 scrollbar-thin">
        {reversed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <ImageIcon size={24} className="text-text-tertiary opacity-30 mb-2" />
            <p className="text-[11px] text-text-tertiary opacity-50">
              {search ? "没有匹配的记录" : "暂无生图记录"}
            </p>
          </div>
        )}

        {reversed.map((msg) => {
          const firstUrl = msg.urls?.[0];
          const time = msg.id ? new Date(parseInt(msg.id.replace("ai-", ""))).toLocaleString("zh-CN", {
            month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
          }) : "";

          return (
            <button
              key={msg.id}
              onClick={() => onSelectHistory?.(msg)}
              className="w-full rounded-xl overflow-hidden bg-bg-tertiary border border-border-primary hover:border-accent/30 transition-all group text-left"
            >
              {firstUrl && (
                <div className="w-full aspect-square overflow-hidden">
                  <img
                    src={firstUrl}
                    alt={msg.text}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="px-2.5 py-2">
                <p className="text-[11px] text-text-primary leading-snug line-clamp-2">
                  {msg.text}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] text-text-tertiary">{msg.modelLabel}</span>
                  {msg.urls?.length > 1 && (
                    <span className="text-[9px] text-accent">{msg.urls.length}张</span>
                  )}
                  <span className="text-[9px] text-text-tertiary ml-auto">{time}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer with clear */}
      {completedMsgs.length > 0 && (
        <div className="px-3 py-2 border-t border-border-primary flex-shrink-0">
          <button
            onClick={onClearHistory}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 size={12} />
            清空记录
          </button>
        </div>
      )}
    </div>
  );
}

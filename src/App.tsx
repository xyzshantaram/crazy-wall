import { useEffect, useState } from "react";
import { useGraphStore } from "./stores/graphStore";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ChatCanvas } from "./components/canvas/ChatCanvas";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SharePanel } from "./components/canvas/SharePanel";
import { ToastHost } from "./components/common/ToastHost";
import { ConfirmationHost } from "./components/dashboard/ConfirmationHost";
import { useSettingsStore } from "./stores/settingsStore";

function App() {
  const hydrated = useGraphStore((s) => s.hydrated);
  const hydrate = useGraphStore((s) => s.hydrate);
  const chatOrder = useGraphStore((s) => s.chatOrder);
  const activeChatId = useGraphStore((s) => s.activeChatId);
  const createChat = useGraphStore((s) => s.createChat);
  const chats = useGraphStore((s) => s.chats);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareChatId, setShareChatId] = useState<string | null>(null);
  const isConfigured = useSettingsStore((s) => s.isConfigured());

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && chatOrder.length === 0) {
      createChat();
    }
  }, [hydrated, chatOrder.length, createChat]);

  // Auto-collapse the sidebar once the active chat has started (per the
  // requested UX: input morphs into a node, sidebar slides away to reveal canvas).
  useEffect(() => {
    if (!activeChatId) return;
    const chat = chats[activeChatId];
    if (chat?.started) setSidebarCollapsed(true);
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!isConfigured) setSettingsOpen(true);
  }, [isConfigured]);

  if (!hydrated) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-void">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex bg-void">
      <Sidebar
        collapsed={sidebarCollapsed}
        onExpand={() => setSidebarCollapsed((c) => !c)}
        onOpenSettings={() => setSettingsOpen(true)}
        onShare={(id) => setShareChatId(id)}
      />

      <div className="relative flex-1 min-w-0">
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Show sidebar"
            className="absolute top-4 left-4 z-30 w-8 h-8 flex items-center justify-center rounded-lg bg-surface/80 border border-border-soft text-ink-faint hover:text-ink hover:bg-surface transition-colors backdrop-blur-sm"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M12 3v10M7 6l-3 2 3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {activeChatId ? (
          <ChatCanvas key={activeChatId} chatId={activeChatId} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-faint text-[13px]">
            Pick a wall or start a new one
          </div>
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {shareChatId && <SharePanel chatId={shareChatId} onClose={() => setShareChatId(null)} />}
      <ConfirmationHost />
      <ToastHost />
    </div>
  );
}

export default App;

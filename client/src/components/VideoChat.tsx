import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../socket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useDistortedStream } from '../hooks/useDistortedStream';
import type { Player } from '../types';

interface ChatMsg {
  from: string;
  name: string;
  text: string;
  ts: number;
}

interface JCoopComm {
  level: 100 | 200 | 300 | 400 | 500 | null;
  activeId: string | null;
  allowedSpeakers: string[] | null;
  distorted: boolean;
}

interface VideoChatProps {
  players: Record<string, Player>;
  myId: string;
  isolationMode?: boolean;
  onCollapse?: () => void;
}

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  isMuted?: boolean;
  isMe?: boolean;
  distorted?: boolean;
  isActive?: boolean;
  isHelper?: boolean;
  isForcedSilent?: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
}

function VideoTile({
  stream,
  label,
  isMuted,
  isMe,
  distorted = false,
  isActive = false,
  isHelper = false,
  isForcedSilent = false,
  hidden = false,
  onToggleHidden,
}: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const processedStream = useDistortedStream(stream, distorted && !isMe && !hidden);
  const playStream = hidden ? null : (processedStream ?? stream);

  useEffect(() => {
    if (ref.current && playStream) {
      ref.current.srcObject = playStream;
    }
  }, [playStream]);

  const borderClass = isActive
    ? 'ring-2 ring-amber-400/80'
    : isHelper
      ? 'ring-2 ring-emerald-400/70'
      : '';

  // Collapsed view when the user has hidden this tile.
  if (hidden) {
    return (
      <div className={`relative rounded-lg overflow-hidden bg-gray-900/80 border border-gray-700/40 px-2 py-1.5 flex items-center gap-2 ${borderClass}`}>
        <span className="text-lg">{isMe ? '🪞' : '👤'}</span>
        <span className="flex-1 truncate text-[11px] text-gray-300">
          {isActive && '🎯 '}
          {isHelper && '🤝 '}
          {label}
        </span>
        {distorted && !isMe && <span className="text-[9px] text-fuchsia-300">🌀</span>}
        {isForcedSilent && <span className="text-[9px] text-slate-300">🔇</span>}
        {isMuted && <span className="text-[9px] text-red-300">🔇</span>}
        {onToggleHidden && (
          <button
            onClick={onToggleHidden}
            title="Показать видео"
            className="text-[10px] px-1 py-0.5 rounded bg-gray-700/70 text-gray-200 hover:bg-gray-600"
          >
            👁
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden bg-gray-800/80 w-full ${borderClass}`}>
      {playStream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isMe}
          className="w-full h-full object-cover transition-[filter] duration-300"
          style={
            distorted && !isMe
              ? {
                  filter: 'blur(8px) hue-rotate(150deg) saturate(2.4) contrast(1.4)',
                  transform: 'scale(1.05)',
                }
              : undefined
          }
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-800/60 min-h-[80px]">👤</div>
      )}
      <div className="absolute top-1 right-1">
        {onToggleHidden && (
          <button
            onClick={onToggleHidden}
            title="Скрыть видео"
            className="bg-black/60 hover:bg-black/80 rounded-md text-white text-[10px] px-1.5 py-0.5"
          >
            🙈
          </button>
        )}
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
        <span className="bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded truncate max-w-[80%]">
          {isActive && '🎯 '}
          {isHelper && '🤝 '}
          {label}
        </span>
        <div className="flex gap-0.5">
          {distorted && !isMe && (
            <span className="bg-fuchsia-700/80 text-white text-[9px] px-1 py-0.5 rounded">🌀</span>
          )}
          {isForcedSilent && (
            <span className="bg-slate-700/90 text-white text-[9px] px-1 py-0.5 rounded">🔇</span>
          )}
          {isMuted && (
            <span className="bg-red-600/80 text-white text-[9px] px-1 py-0.5 rounded">🔇</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VideoChat({ players, myId, isolationMode, onCollapse }: VideoChatProps) {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [comm, setComm] = useState<JCoopComm | null>(null);
  const [hiddenPeers, setHiddenPeers] = useState<Set<string>>(new Set());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const forceMuted = !!comm && comm.allowedSpeakers !== null && !comm.allowedSpeakers.includes(myId);
  const effectiveMuted = muted || forceMuted;

  const playerIds = Object.keys(players);
  const { localStream, remoteStreams, mediaError } = useWebRTC(
    playerIds,
    myId,
    effectiveMuted,
    cameraOff,
  );

  useEffect(() => {
    const handler = (msg: ChatMsg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
      if (!chatOpen && msg.from !== myId) setUnreadChat((n) => n + 1);
    };
    socket.on('chat-message', handler);
    return () => { socket.off('chat-message', handler); };
  }, [chatOpen, myId]);

  useEffect(() => {
    const handler = (next: JCoopComm) => setComm(next);
    socket.on('mode-jcoop-comm' as any, handler);
    return () => { socket.off('mode-jcoop-comm' as any, handler); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chatOpen) setUnreadChat(0);
  }, [chatOpen]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    socket.emit('chat-message', text);
    setDraft('');
  }, [draft]);

  const otherPlayers = playerIds.filter((id) => id !== myId);

  const activeId = comm?.activeId ?? null;
  const allowedSpeakers = comm?.allowedSpeakers ?? null;
  const distortMode = !!comm?.distorted;
  const level = comm?.level ?? null;

  const helperIds = (() => {
    if (!allowedSpeakers || !activeId) return new Set<string>();
    return new Set(allowedSpeakers.filter((id) => id !== activeId));
  })();

  let commBanner: { text: string; tone: 'neutral' | 'mute' | 'distort' | 'helper' | 'active' } | null = null;
  if (level !== null) {
    if (myId === activeId) {
      commBanner = { text: '🎯 Твой ход — отвечай', tone: 'active' };
    } else if (forceMuted) {
      commBanner = { text: '🔇 Ты на мьюте этим раундом', tone: 'mute' };
    } else if (distortMode) {
      commBanner = { text: '🌀 Голос искажён — говори, если поможет', tone: 'distort' };
    } else if (helperIds.has(myId)) {
      commBanner = { text: '🤝 Ты помогаешь активному игроку', tone: 'helper' };
    } else {
      commBanner = { text: '🤝 Помогай команде голосом', tone: 'helper' };
    }
  }

  const bannerClasses: Record<NonNullable<typeof commBanner>['tone'], string> = {
    neutral: 'bg-slate-800/60 text-slate-200 border-slate-600/40',
    mute:    'bg-slate-900/80 text-slate-300 border-slate-700/60',
    distort: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60',
    helper:  'bg-emerald-900/40 text-emerald-200 border-emerald-700/50',
    active:  'bg-amber-900/40 text-amber-200 border-amber-600/60',
  };

  function togglePeerHidden(pid: string) {
    setHiddenPeers((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  // The panel itself. On mobile it's a fixed slide-in drawer; on desktop a
  // sidebar inside the flex layout.
  const panelInner = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 shrink-0">
        <span className="text-xs font-bold text-gray-400">📹 Связь</span>
        <div className="flex gap-1">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`relative text-xs px-2 py-0.5 rounded ${chatOpen ? 'bg-[var(--color-dungeon-accent)] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            💬
            {!chatOpen && unreadChat > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center">{unreadChat}</span>
            )}
          </button>
          {/* Mobile-only close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-xs px-2 py-0.5 text-gray-400 hover:text-white"
            title="Свернуть панель"
          >
            ↘
          </button>
          {/* Desktop-only collapse */}
          {onCollapse && (
            <button onClick={onCollapse} className="hidden md:block text-xs px-2 py-0.5 text-gray-400 hover:text-white">✕</button>
          )}
        </div>
      </div>

      {commBanner && (
        <div className={`border-b px-3 py-1.5 text-center shrink-0 border ${bannerClasses[commBanner.tone]}`}>
          <span className="text-[10px] font-bold">{commBanner.text}</span>
        </div>
      )}

      {isolationMode && (
        <div className="bg-purple-900/60 border-b border-purple-600/50 px-3 py-1.5 text-center shrink-0">
          <span className="text-purple-300 text-[10px] font-bold">🔇 Связь заблокирована</span>
        </div>
      )}

      {/* Video tiles */}
      <div className={`flex-1 flex flex-col gap-1.5 p-2 min-h-0 overflow-y-auto ${isolationMode ? 'opacity-20 pointer-events-none blur-sm' : ''}`}>
        <VideoTile
          stream={localStream}
          label="Ты"
          isMe
          isMuted={effectiveMuted}
          isActive={activeId === myId}
          isHelper={helperIds.has(myId)}
          isForcedSilent={forceMuted}
          hidden={hiddenPeers.has(myId)}
          onToggleHidden={() => togglePeerHidden(myId)}
        />
        {otherPlayers.map((pid) => {
          const peerForcedSilent =
            allowedSpeakers !== null && !allowedSpeakers.includes(pid);
          const peerDistort = distortMode && pid !== activeId;
          return (
            <VideoTile
              key={pid}
              stream={remoteStreams.get(pid) ?? null}
              label={players[pid]?.name ?? '?'}
              distorted={peerDistort}
              isActive={pid === activeId}
              isHelper={helperIds.has(pid)}
              isForcedSilent={peerForcedSilent}
              hidden={hiddenPeers.has(pid)}
              onToggleHidden={() => togglePeerHidden(pid)}
            />
          );
        })}
      </div>

      <div className={`flex justify-center gap-2 py-2 border-t border-gray-700/50 shrink-0 ${isolationMode ? 'opacity-30 pointer-events-none' : ''}`}>
        <button
          onClick={() => setMuted(!muted)}
          disabled={forceMuted}
          title={forceMuted ? 'Сейчас тебе нельзя говорить' : undefined}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            forceMuted
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : muted
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {effectiveMuted ? '🔇 Мик выкл' : '🎙️ Мик'}
        </button>
        <button
          onClick={() => setCameraOff(!cameraOff)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cameraOff ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        >
          {cameraOff ? '📷 Выкл' : '📹'}
        </button>
      </div>

      {mediaError && (
        <div className="px-3 py-1.5 text-center shrink-0">
          <div className="text-[10px] text-yellow-400">
            {mediaError === 'camera' ? '⚠️ Камера недоступна' : '⚠️ Нет доступа к медиа'}
          </div>
        </div>
      )}

      {chatOpen && (
        <div className={`flex flex-col border-t border-gray-700/50 shrink-0 ${isolationMode ? 'opacity-20 pointer-events-none' : ''}`}>
          <div className="overflow-y-auto p-2 space-y-1 max-h-36">
            {messages.length === 0 && (
              <div className="text-center text-[10px] text-gray-500 py-3">Нет сообщений</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-[10px] ${m.from === myId ? 'text-right' : ''}`}>
                <span className="text-[var(--color-dungeon-gold)] font-bold">{m.from === myId ? 'Ты' : m.name}: </span>
                <span className="text-gray-300">{m.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-1 p-2 border-t border-gray-700/30">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Сообщение..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-white outline-none focus:border-[var(--color-dungeon-accent)]"
            />
            <button onClick={sendMessage} className="px-2 py-1 bg-[var(--color-dungeon-accent)] rounded-lg text-[10px] text-white font-bold">→</button>
          </div>
        </div>
      )}
    </>
  );

  // Total unread/notification badge for the mobile floating button.
  const totalUnread = unreadChat;

  return (
    <>
      {/* Mobile-only floating button to open the drawer */}
      <button
        onClick={() => setMobileOpen(true)}
        className={`md:hidden fixed bottom-3 right-3 z-50 h-12 w-12 rounded-full flex items-center justify-center text-xl shadow-lg
          glass-panel border border-gray-600/50 hover:border-gray-400/50 transition-all
          ${mobileOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        title="Открыть видео-чат"
      >
        📹
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{totalUnread}</span>
        )}
      </button>

      {/* Mobile backdrop while drawer is open */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Panel — desktop sidebar OR mobile drawer */}
      <div
        className={`
          flex flex-col h-full bg-[var(--color-dungeon-bg)] border-l border-gray-700/50
          md:relative md:w-72 md:shrink-0 md:flex
          fixed top-0 right-0 z-50 w-72 max-w-[85vw] transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
      >
        {panelInner}
      </div>
    </>
  );
}

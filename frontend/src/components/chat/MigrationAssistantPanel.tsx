import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Send, Loader2, Sparkles, PanelRightClose, PanelRightOpen, Trash2,
} from 'lucide-react';
import { api } from '../../services/api';
import { usePageContext } from '../../hooks/usePageContext';
import { useAiActivity } from '../../context/AiActivityContext';
import { useAssistantHistory } from '../../context/AssistantHistoryContext';
import { useAiPageSync } from '../../hooks/useAiPageSync';
import { cn } from '../../utils/cn';
import { AiModeBadge } from './AiModeBadge';
import { ActivityCard } from './ActivityFeed';

interface MigrationAssistantPanelProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  /** Controlled width in px when expanded */
  width?: number;
  onWidthChange?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MigrationAssistantPanel({
  collapsed = false,
  onToggleCollapse,
  className,
  width = 380,
  onWidthChange,
  minWidth = 280,
  maxWidth = 640,
}: MigrationAssistantPanelProps) {
  const { projectId, pagePath, pageLabel, pageKey } = usePageContext();
  const { events, startAgent, addThought, addAction, completeAgent, failAgent, updateEvent } = useAiActivity();
  const {
    entries,
    appendUser,
    appendAssistant,
    appendSystem,
    clearHistory,
    buildLlmHistory,
    buildActivityDigest,
  } = useAssistantHistory();
  useAiPageSync(projectId);

  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [streamingReply, setStreamingReply] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRunRef = useRef<string | null>(null);
  const lastPageRef = useRef<string | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onWidthChange) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !onWidthChange) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = Math.min(maxWidth, Math.max(minWidth, dragRef.current.startWidth + delta));
    onWidthChange(next);
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.getAiStatus(),
    staleTime: 60_000,
  });

  // Record page moves as system notes in history (context), without wiping chat
  useEffect(() => {
    if (lastPageRef.current === pageKey) return;
    const prev = lastPageRef.current;
    lastPageRef.current = pageKey;
    if (prev != null) {
      appendSystem(`Moved to ${pageLabel}`, pageKey);
    }
  }, [pageKey, pageLabel, appendSystem]);

  const liveEvent = useMemo(
    () => events.find((e) => e.id === chatRunRef.current) ?? events.find((e) => e.status === 'running'),
    [events],
  );

  /** Real wait states only — no fake timed “thinking” script. */
  const beginChatRun = (text: string) => {
    const runId = startAgent(
      'Migration Assistant',
      `Answering: “${text.slice(0, 72)}${text.length > 72 ? '…' : ''}”`,
      pageKey,
    );
    chatRunRef.current = runId;
    addThought(runId, `Using page context: ${pageLabel}`, 'complete');
    addThought(
      runId,
      projectId
        ? 'Including project workflow + recent agent activity in LLM context'
        : 'Including general migration workflow knowledge in LLM context',
      'complete',
    );
    addAction(
      runId,
      aiStatus?.provider === 'cursor'
        ? `Streaming Cursor agent (${aiStatus.model || 'auto'})…`
        : 'Generating reply (mock mode)…',
      'running',
    );
    return runId;
  };

  /** Real Cursor stream — thinking deltas + token deltas into activity + reply. */
  const chatMutation = useMutation({
    mutationFn: async (text: string) => {
      appendUser(text, pageKey, pageLabel);
      const runId = beginChatRun(text);
      setStreamingReply('');
      setStreamingThinking('');
      const history = buildLlmHistory(events, 30);
      const activityDigest = buildActivityDigest(events, 12);

      let reply = '';
      let thinkingBuf = '';
      let suggestionsOut: string[] = [];
      let thinkingStarted = false;

      try {
        for await (const event of api.streamChat({
          projectId,
          message: text,
          page_path: pagePath,
          history,
          activity_context: activityDigest,
        })) {
          if (event.type === 'meta') {
            suggestionsOut = event.suggestions ?? [];
          } else if (event.type === 'status' && event.text) {
            addAction(runId, event.text, event.status === 'complete' ? 'complete' : 'running');
          } else if (event.type === 'thinking' && event.text) {
            thinkingBuf += event.text;
            setStreamingThinking(thinkingBuf);
            if (!thinkingStarted) {
              thinkingStarted = true;
              addThought(runId, 'Cursor thinking (live stream)', 'running');
            }
            updateEvent(runId, { detail: thinkingBuf.slice(-200) });
          } else if (event.type === 'token' && event.text) {
            reply += event.text;
            setStreamingReply(reply);
            addAction(runId, 'Streaming assistant tokens…', 'running');
          } else if (event.type === 'tool' && event.text) {
            addAction(runId, event.text, event.status === 'complete' ? 'complete' : 'running');
          } else if (event.type === 'error' && event.text) {
            addAction(runId, `Stream error: ${event.text}`, 'error');
          } else if (event.type === 'done') {
            if (event.text) {
              reply = event.text;
              setStreamingReply(reply);
            }
            if (thinkingStarted) {
              addThought(runId, 'Cursor thinking (live stream)', 'complete');
            }
            addAction(runId, 'Cursor stream finished', 'complete');
          }
        }

        if (!reply.trim()) {
          throw new Error('Empty streamed reply');
        }
        completeAgent(runId, 'Streamed reply added to chat history');
        return { reply, suggestions: suggestionsOut, runId };
      } catch (err) {
        failAgent(runId, (err as Error).message);
        throw err;
      } finally {
        chatRunRef.current = null;
        setStreamingThinking('');
      }
    },
    onSuccess: ({ reply, suggestions: nextSuggestions, runId }) => {
      appendAssistant(reply, { activityId: runId, pageKey, pageLabel });
      setSuggestions(nextSuggestions ?? []);
      setStreamingReply('');
      setInput('');
    },
    onError: () => setStreamingReply(''),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length, liveEvent?.steps?.length, liveEvent?.status, chatMutation.isPending, streamingReply, streamingThinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;
    chatMutation.mutate(trimmed);
  };

  const defaultSuggestions = projectId
    ? [`Explain ${pageLabel}`, 'What should I do next?', 'Summarize what we did so far']
    : ['What is the migration workflow?', 'How do I start?', 'Where is sample-data?'];

  const quickPrompts = suggestions.length > 0 ? suggestions : defaultSuggestions;
  const runningCount = events.filter((e) => e.status === 'running').length;

  if (collapsed) {
    return (
      <aside className={cn('w-12 shrink-0 border-l border-border bg-white flex flex-col items-center py-3 gap-3', className)}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-lg text-primary hover:bg-pink-50"
          title="Expand AI assistant"
        >
          <PanelRightOpen size={18} />
        </button>
        <div className="relative">
          <Sparkles size={18} className="text-primary" />
          {runningCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width }}
      className={cn(
        'relative shrink-0 border-l border-border bg-white flex flex-col min-h-0',
        className,
      )}
    >
      {onWidthChange && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          className="absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 active:bg-primary/40"
        />
      )}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-ink text-white shrink-0">
        <Sparkles size={16} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">Migration Assistant</p>
            <AiModeBadge status={aiStatus} compact />
          </div>
          <p className="text-[10px] text-pink-100 truncate">
            {projectId ? `${pageLabel} · full history` : 'General · chat + activity'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearHistory()}
          className="p-1 hover:bg-white/20 rounded-lg shrink-0"
          title="Clear chat history"
        >
          <Trash2 size={14} />
        </button>
        {onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} className="p-1 hover:bg-white/20 rounded-lg shrink-0">
            <PanelRightClose size={16} />
          </button>
        )}
      </div>

      {/* Unified chronological history */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-surface/40 space-y-2.5">
        {entries.length === 0 && !chatMutation.isPending && (
          <div className="text-center py-10 px-3">
            <p className="text-sm text-gray-600 mb-1">Chat & activity history</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Every agent thought, action, and reply stays here step-by-step — and is sent back to the LLM as context.
            </p>
            {aiStatus && (
              <div className="mt-4 flex justify-center">
                <AiModeBadge status={aiStatus} />
              </div>
            )}
          </div>
        )}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="flex flex-col items-end gap-0.5">
                <div className="max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap bg-primary text-white">
                  {entry.content}
                </div>
                <span className="text-[9px] text-gray-400 px-1">
                  {entry.pageLabel ? `${entry.pageLabel} · ` : ''}{formatTime(entry.timestamp)}
                </span>
              </div>
            );
          }

          if (entry.kind === 'assistant') {
              const linked = entry.activityId
                ? (eventsById.get(entry.activityId) ?? entries.find((e) => e.activityId === entry.activityId)?.activitySnapshot)
                : undefined;
              const activityAlreadyListed = entry.activityId
                ? entries.some((e) => e.kind === 'activity' && e.activityId === entry.activityId)
                : false;
              return (
                <div key={entry.id} className="flex flex-col items-start gap-1.5">
                  <div className="max-w-[95%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap bg-white border border-border text-gray-700">
                    {entry.content}
                  </div>
                  {linked && !activityAlreadyListed && (linked.steps?.length ?? 0) > 0 && (
                    <div className="max-w-[95%] w-full">
                      <ActivityCard event={linked} />
                    </div>
                  )}
                  <span className="text-[9px] text-gray-400 px-1">{formatTime(entry.timestamp)}</span>
                </div>
              );
          }

          if (entry.kind === 'system') {
            return (
              <div key={entry.id} className="flex justify-center">
                <span className="text-[10px] text-gray-400 bg-white/80 border border-border rounded-full px-2.5 py-0.5">
                  {entry.content}
                </span>
              </div>
            );
          }

          if (entry.kind === 'activity' && entry.activityId) {
            const event = eventsById.get(entry.activityId) ?? entry.activitySnapshot;
            if (!event) return null;
            return (
              <div key={entry.id} className="w-full">
                <ActivityCard event={event} />
              </div>
            );
          }

          return null;
        })}

        {chatMutation.isPending && (
          <div className="space-y-2">
            {streamingThinking && (
              <div className="mr-auto max-w-[95%] rounded-lg px-3 py-2 text-[11px] whitespace-pre-wrap bg-slate-50 border border-border text-ink-muted">
                <span className="font-semibold uppercase tracking-wide text-[9px] block mb-1">Thinking</span>
                {streamingThinking.slice(-500)}
              </div>
            )}
            {streamingReply ? (
              <div className="mr-auto max-w-[95%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap bg-white border border-border text-gray-700">
                {streamingReply}
                <span className="inline-block w-1.5 h-3 ml-0.5 bg-primary animate-pulse align-middle" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Streaming from Cursor…
              </div>
            )}
            {liveEvent && !entries.some((e) => e.activityId === liveEvent.id) && (
              <ActivityCard event={liveEvent} />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-2 py-2 border-t border-border bg-white flex flex-wrap gap-1 shrink-0">
        {quickPrompts.slice(0, 3).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            disabled={chatMutation.isPending}
            className="text-[10px] px-2 py-1 rounded-full border border-border text-gray-600 hover:border-primary hover:text-primary transition-colors truncate max-w-full"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 p-2 border-t border-border bg-white shrink-0"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <input
          className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder={`Ask about ${pageLabel}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={chatMutation.isPending}
        />
        <button
          type="submit"
          disabled={!input.trim() || chatMutation.isPending}
          className="p-2 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-pink-700 transition-colors shrink-0"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}

'use client';

/**
 * Message UI shared by stranger chat and DMs: the paddle-style bubble plus
 * WhatsApp/iMessage-style features — reply (quote), reactions, copy, edit,
 * unsend, read receipts — and the composer's reply/edit bar and emoji picker.
 */
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Copy, CornerUpLeft, Pencil, Plus, Smile, Trash2, X } from 'lucide-react';
import { Modal } from '@/components/ui';
import { clockTime } from '@/lib/format';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🙏'];
export const ALL_REACTIONS = [...QUICK_REACTIONS, '👎', '😅', '🤔', '😎', '🥲', '🤯', '💯', '🎉'];
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface Quote {
  author: string;
  text: string;
  deleted?: boolean;
  targetId?: string;
}

export interface ReactionChip {
  emoji: string;
  count: number;
  mine: boolean;
}

interface Props {
  domId?: string;
  mine: boolean;
  text: string;
  at: number | string;
  deleted?: boolean;
  edited?: boolean;
  status?: 'sending' | 'sent' | 'rejected' | 'failed';
  reason?: string;
  quote?: Quote | null;
  reactions?: ReactionChip[];
  receipt?: 'sent' | 'seen' | null;
  myReaction?: string | null;
  canInteract?: boolean;
  canEdit?: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onEdit?: () => void;
  onUnsend?: () => void;
}

/** Scroll to a quoted message and flash it. */
export function jumpTo(domId?: string) {
  if (!domId) return;
  const el = document.getElementById(domId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.dataset.flash = '1';
  setTimeout(() => delete el.dataset.flash, 1200);
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc closes the popover only — it mustn't also arm "skip" in stranger chat.
      e.stopPropagation();
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);
  return ref;
}

function ReactionPalette({ onPick, mine }: { onPick: (e: string) => void; mine?: string | null }) {
  const [all, setAll] = useState(false);
  const list = all ? ALL_REACTIONS : QUICK_REACTIONS;
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className={clsx('flex h-9 w-9 items-center justify-center text-lg hover:bg-raised', mine === e && 'bg-fg/15 outline outline-2 outline-ball')}
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
      {!all ? (
        <button type="button" onClick={() => setAll(true)} className="flex h-9 w-9 items-center justify-center text-muted hover:bg-raised hover:text-fg" aria-label="More reactions">
          <Plus size={16} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

function ToolButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx('flex h-8 w-8 items-center justify-center text-muted hover:bg-raised', danger ? 'hover:text-danger' : 'hover:text-fg')}
    >
      {children}
    </button>
  );
}

export function ChatMessage(p: Props) {
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState(false);
  const pickerRef = useOutsideClose(picker, () => setPicker(false));
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();

  const rejected = p.status === 'rejected' || p.status === 'failed';
  const interactive = p.canInteract && !p.deleted && !rejected && p.status !== 'sending';

  const copy = () => void navigator.clipboard?.writeText(p.text).catch(() => {});
  const react = (e: string) => {
    p.onReact?.(e);
    setPicker(false);
    setSheet(false);
  };

  // Long-press on touch screens opens the action sheet (like WhatsApp/iMessage).
  const touch = {
    onTouchStart: () => {
      if (!interactive) return;
      pressTimer.current = setTimeout(() => setSheet(true), 450);
    },
    onTouchEnd: () => clearTimeout(pressTimer.current),
    onTouchMove: () => clearTimeout(pressTimer.current),
    onContextMenu: (e: React.MouseEvent) => {
      if (interactive && window.matchMedia('(pointer: coarse)').matches) {
        e.preventDefault();
        setSheet(true);
      }
    },
  };

  const toolbar = interactive ? (
    <div
      className={clsx(
        // Padding (not margin) bridges the gap so the toolbar stays open while the mouse moves onto it.
        'absolute top-0 z-20 hidden group-hover:flex group-focus-within:flex',
        p.mine ? 'right-full pr-2' : 'left-full pl-2',
        picker && 'flex',
      )}
    >
      <div className="flex items-center border-2 border-line-strong bg-bg">
      {p.onReply ? <ToolButton label="Reply" onClick={p.onReply}><CornerUpLeft size={15} strokeWidth={2.5} /></ToolButton> : null}
      {p.onReact ? <ToolButton label="React" onClick={() => setPicker((v) => !v)}><Smile size={15} strokeWidth={2.5} /></ToolButton> : null}
      <ToolButton label="Copy" onClick={copy}><Copy size={14} strokeWidth={2.5} /></ToolButton>
      {p.canEdit && p.onEdit ? <ToolButton label="Edit" onClick={p.onEdit}><Pencil size={14} strokeWidth={2.5} /></ToolButton> : null}
      {p.mine && p.onUnsend ? <ToolButton label="Unsend for everyone" onClick={p.onUnsend} danger><Trash2 size={14} strokeWidth={2.5} /></ToolButton> : null}
      </div>
    </div>
  ) : null;

  return (
    <div
      id={p.domId}
      className={clsx('group/msg flex py-1 transition-colors data-[flash]:bg-fg/10', p.mine ? 'justify-end' : 'justify-start')}
    >
      <div className={clsx('flex max-w-[85%] flex-col sm:max-w-[45%]', p.mine ? 'items-end' : 'items-start')}>
        <div className="group relative" {...touch}>
          {toolbar}
          {picker ? (
            <div ref={pickerRef} className={clsx('absolute bottom-full z-30 mb-2 w-max max-w-[19rem] border-2 border-fg bg-bg p-1', p.mine ? 'right-0' : 'left-0')}>
              <ReactionPalette onPick={react} mine={p.myReaction} />
            </div>
          ) : null}

          <div
            className={clsx(
              'animate-fade-up bg-bg py-1',
              p.mine ? 'border-r-4 pr-3 text-right' : 'border-l-4 pl-3',
              rejected ? 'border-danger' : p.deleted ? 'border-line-strong' : p.mine ? 'border-ball' : 'border-fg',
              p.status === 'sending' && 'opacity-50',
            )}
          >
            {p.quote && !p.deleted ? (
              <button
                type="button"
                onClick={() => jumpTo(p.quote?.targetId)}
                className={clsx('mb-1 block max-w-xs truncate text-xs text-faint hover:text-muted', p.mine ? 'ml-auto text-right' : 'text-left')}
                title="Go to message"
              >
                ↩ {p.quote.author}: {p.quote.deleted ? 'message unsent' : p.quote.text}
              </button>
            ) : null}
            {p.deleted ? (
              <p className="text-[14px] italic text-faint">message unsent</p>
            ) : (
              <p className={clsx('whitespace-pre-wrap break-words text-[15px] leading-[1.5]', rejected ? 'text-faint line-through' : 'text-fg')}>
                {p.text}
              </p>
            )}
          </div>
        </div>

        {p.reactions?.length ? (
          <div className={clsx('mt-1 flex flex-wrap gap-1', p.mine ? 'justify-end' : 'justify-start')}>
            {p.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => interactive && p.onReact?.(r.emoji)}
                className={clsx('flex items-center gap-1 border-2 bg-bg px-1.5 py-px text-sm', r.mine ? 'border-ball' : 'border-line')}
                title={r.mine ? 'Remove your reaction' : 'React'}
              >
                <span>{r.emoji}</span>
                {r.count > 1 ? <span className="text-[10px] font-bold">{r.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {rejected ? (
          <p className="mt-1 max-w-xs bg-bg text-right text-xs text-danger">not delivered: {p.reason}</p>
        ) : (
          <span className="flex h-4 items-center gap-2 px-1 text-[10px] uppercase tracking-[0.08em] text-faint">
            {/* Time only on hover; "edited" and receipts stay visible. */}
            <span className="hidden group-hover/msg:inline">{clockTime(p.at)}</span>
            {p.edited && !p.deleted ? <span>edited</span> : null}
            {p.mine && p.receipt ? <span className={p.receipt === 'seen' ? 'text-ball' : ''}>{p.receipt}</span> : null}
          </span>
        )}
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title="Message" width="max-w-sm">
        <div className="space-y-4">
          {p.onReact ? <ReactionPalette onPick={react} mine={p.myReaction} /> : null}
          <div className="grid gap-1 border-t-2 border-line pt-3 text-sm font-bold uppercase tracking-[0.1em]">
            {p.onReply ? <SheetAction onClick={() => { setSheet(false); p.onReply?.(); }}><CornerUpLeft size={15} /> Reply</SheetAction> : null}
            <SheetAction onClick={() => { copy(); setSheet(false); }}><Copy size={15} /> Copy</SheetAction>
            {p.canEdit && p.onEdit ? <SheetAction onClick={() => { setSheet(false); p.onEdit?.(); }}><Pencil size={15} /> Edit</SheetAction> : null}
            {p.mine && p.onUnsend ? (
              <SheetAction danger onClick={() => { setSheet(false); p.onUnsend?.(); }}><Trash2 size={15} /> Unsend for everyone</SheetAction>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SheetAction({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex items-center gap-3 px-2 py-2.5 text-left hover:bg-raised', danger ? 'text-danger' : 'text-fg')}>
      {children}
    </button>
  );
}

// ── Composer helpers ─────────────────────────────────────────────────────────

/** "Replying to …" / "Editing message" bar above the composer. */
export function ComposerBar({ mode, author, text, onCancel }: { mode: 'reply' | 'edit'; author?: string; text: string; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-start gap-3 border-2 border-line bg-bg px-3 py-2">
      {mode === 'reply' ? <CornerUpLeft size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ball" /> : <Pencil size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ball" />}
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-bold uppercase tracking-[0.1em] text-muted">{mode === 'reply' ? `Replying to ${author}` : 'Editing message'}</p>
        <p className="truncate text-faint">{text}</p>
      </div>
      <button type="button" onClick={onCancel} className="p-0.5 text-faint hover:text-fg" aria-label="Cancel">
        <X size={15} strokeWidth={2.5} />
      </button>
    </div>
  );
}

const EMOJI_GROUPS: [string, string[]][] = [
  ['Smileys', ['😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🤓', '🧐', '🤔', '🤨', '😐', '😶', '🙄', '😏', '😬', '😌', '😴', '🥱', '😮', '😯', '😲', '🥺', '😢', '😭', '😤', '😡', '🤯', '😳', '🥲', '😅', '🫠']],
  ['Gestures', ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '🤙', '✌️', '🤞', '👌', '🤌', '💪', '🫡', '🤷', '🤦']],
  ['Hearts', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '✨', '🔥', '⭐', '🎉', '🎊', '💥']],
  ['Things', ['🏓', '🎮', '🎧', '🎬', '📚', '☕', '🍕', '🍜', '🍰', '⚽', '🏏', '🎸', '✈️', '🌍', '🐶', '🐱', '🌧️', '☀️', '🌙', '🍿']],
];

/** Emoji button + popover for the composer. Inserts at the caret. */
export function EmojiButton({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative self-stretch">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex h-full items-center px-2.5 text-faint hover:text-ball disabled:opacity-40 disabled:hover:text-faint"
        aria-label="Emoji"
        title="Emoji"
      >
        <Smile size={18} strokeWidth={2.25} />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-3 max-h-72 w-[19.5rem] overflow-y-auto border-2 border-fg bg-bg p-2 sm:w-[21rem]">
          {EMOJI_GROUPS.map(([name, list]) => (
            <div key={name} className="mb-2">
              <p className="label mb-1 px-1">{name}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {list.map((e) => (
                  <button
                    key={e}
                    type="button"
                    // Keep focus (and the caret) in the message box, like WhatsApp's picker.
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => onPick(e)}
                    className="flex h-9 items-center justify-center text-xl hover:bg-raised"
                    aria-label={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Insert text at the caret of a textarea and return the new value. */
export function insertAtCaret(el: HTMLTextAreaElement | null, value: string, insert: string): string {
  if (!el) return value + insert;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insert + value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + insert.length;
  });
  return next;
}

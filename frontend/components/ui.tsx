'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { MAX_INTERESTS } from '@/lib/config';

// ── Button ───────────────────────────────────────────────────────────────────
// Square, 2px, uppercase. Hover inverts — the way a cabinet menu highlights.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'border-2 border-ball bg-ball text-ball-ink hover:border-fg hover:bg-fg disabled:border-line-strong disabled:bg-transparent disabled:text-faint',
  secondary:
    'border-2 border-fg text-fg hover:bg-fg hover:text-bg disabled:border-line-strong disabled:text-faint disabled:hover:bg-transparent',
  ghost: 'border-2 border-transparent text-muted hover:text-fg disabled:text-faint',
  danger: 'border-2 border-danger text-danger hover:bg-danger hover:text-bg disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px] gap-1.5',
  md: 'h-10 px-4 text-xs gap-2',
  lg: 'h-12 px-6 text-[13px] gap-2.5',
};

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center whitespace-nowrap font-mono font-bold uppercase tracking-[0.1em] transition-colors duration-75 disabled:cursor-not-allowed';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading} className={clsx(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)} {...props}>
      {loading ? <Spinner className="h-3 w-3" /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  href, variant = 'secondary', size = 'md', className, children,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={clsx(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}

// ── Form bits ────────────────────────────────────────────────────────────────

export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="label block text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  checked, onChange, children, id,
}: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[13px] leading-5 text-muted">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={clsx(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ball',
          checked ? 'border-ball bg-ball text-ball-ink' : 'border-fg',
        )}
      >
        {checked ? <Check size={12} strokeWidth={4} /> : null}
      </span>
      <span>{children}</span>
    </label>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'danger' | 'ok'; children: React.ReactNode; className?: string }) {
  const tones = {
    info: 'border-line-strong text-muted',
    warning: 'border-warn text-warn',
    danger: 'border-danger text-danger',
    ok: 'border-ok text-ok',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('border-2 bg-bg px-3 py-2.5 text-[13px] leading-5', tones[tone], className)}>
      {children}
    </div>
  );
}

// ── Brand ────────────────────────────────────────────────────────────────────

/** The Pong ball: a square. */
export function Ball({ size = 10, bouncing, className, color = 'fg' }: { size?: number; bouncing?: boolean; className?: string; color?: 'fg' | 'ball' }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block shrink-0', color === 'ball' ? 'bg-ball' : 'bg-fg', bouncing && 'animate-bounce', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={clsx('pixel inline-flex items-center text-fg', lg ? 'text-2xl' : 'text-[13px]', className)}>
      PING
      <span aria-hidden className={clsx('bg-ball', lg ? 'mx-2 h-3 w-3' : 'mx-1.5 h-2 w-2')} />
      PONG
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('inline-block animate-blink bg-current', className ?? 'h-3 w-3')} />;
}

export function Avatar({ name, src, size = 32, online }: { name: string; src?: string | null; size?: number; online?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full border-2 border-line-strong object-cover grayscale" />
      ) : (
        <span className="pixel flex h-full w-full items-center justify-center border-2 border-line-strong text-fg" style={{ fontSize: size * 0.36 }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {online !== undefined ? (
        <span
          className={clsx('absolute -bottom-1 -right-1 h-2.5 w-2.5 border-2 border-bg', online ? 'bg-ok' : 'bg-line-strong')}
          aria-label={online ? 'Online' : 'Offline'}
        />
      ) : null}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="border-2 border-line-strong px-1.5 py-px font-mono text-[10px] font-bold uppercase text-muted">{children}</kbd>;
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-10">
      <Ball size={10} className="mb-3" />
      <p className="font-bold uppercase tracking-wide text-fg">{title}</p>
      {children ? <p className="max-w-sm text-[13px] leading-5 text-muted">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-4 border-b-2 border-line px-5 sm:px-8">
      <h1 className="pixel text-[13px]">{title}</h1>
      {children}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children, width = 'max-w-md',
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx('w-[calc(100%-2rem)] border-2 border-fg bg-bg p-0 text-fg backdrop:bg-black/85', width)}
    >
      {open ? (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-line pb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em]">{title}</h2>
            <button onClick={onClose} className="-m-1 p-1 text-faint hover:text-fg" aria-label="Close">
              <X size={16} strokeWidth={3} />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

// ── Interests input ──────────────────────────────────────────────────────────

export function InterestInput({
  value, onChange, placeholder = 'Add an interest and press Enter', disabled,
}: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
    if (tag.length < 2 || value.includes(tag) || value.length >= MAX_INTERESTS) return;
    onChange([...value, tag]);
  };

  return (
    <div
      className={clsx(
        'flex min-h-11 w-full flex-wrap items-center gap-1.5 border-2 border-line-strong bg-bg px-2 py-1.5 transition-colors hover:border-muted focus-within:border-fg',
        disabled && 'opacity-60',
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1.5 bg-fg py-0.5 pl-2 pr-1 text-xs font-bold uppercase tracking-wide text-bg">
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="p-0.5 hover:bg-bg hover:text-fg"
            aria-label={`Remove ${tag}`}
          >
            <X size={11} strokeWidth={3} />
          </button>
        </span>
      ))}
      {value.length < MAX_INTERESTS ? (
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
              setDraft('');
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft) {
              add(draft);
              setDraft('');
            }
          }}
          placeholder={value.length ? '' : placeholder}
          maxLength={24}
          aria-label="Interests"
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-[15px] text-fg placeholder:text-faint focus:outline-none"
        />
      ) : null}
    </div>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

/** In-theme replacement for window.confirm(). Render `dialog` once; `ask()` resolves true/false. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const ask = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  const finish = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = (
    <Modal open={state !== null} onClose={() => finish(false)} title={state?.title ?? ''} width="max-w-sm">
      {state?.body ? <div className="mb-6 text-sm leading-6 text-muted">{state.body}</div> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => finish(false)}>Cancel</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
          {state?.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Modal>
  );

  return { ask, dialog };
}

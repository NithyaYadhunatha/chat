'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Alert, Button, Checkbox, Modal } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { REPORT_REASONS, type ReportReason } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Stranger chat: report by session. DMs: report by user id. */
  target: { sessionId: string } | { userId: string; conversationId?: string; username: string };
  onDone?: (blocked: boolean) => void;
}

export function ReportDialog({ open, onClose, target, onDone }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isStranger = 'sessionId' in target;

  const close = () => {
    onClose();
    setTimeout(() => {
      setReason(null);
      setDetails('');
      setDone(false);
      setError(null);
    }, 200);
  };

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      if (isStranger) {
        await api('/stranger/report', { method: 'POST', body: { session_id: target.sessionId, reason, details: details || null, block } });
      } else {
        await api('/reports/user', {
          method: 'POST',
          body: { user_id: target.userId, conversation_id: target.conversationId, reason, details: details || null },
        });
        if (block) await api(`/users/${target.userId}/block`, { method: 'POST' });
      }
      setDone(true);
      onDone?.(block);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={isStranger ? 'Report this stranger' : `Report ${target.username}`}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted">
            Thanks. A moderator will review the conversation{block ? ', and you won’t be matched with this person again' : ''}.
          </p>
          <Button variant="primary" className="w-full" onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-5 text-muted">
            {isStranger
              ? 'The last part of this chat is attached automatically. The stranger won’t know who reported them.'
              : 'Your recent messages with this person are attached for the moderator.'}
          </p>
          <fieldset className="space-y-1" aria-label="Reason">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  reason === r.value ? 'border-ball/60 bg-raised' : 'border-transparent hover:bg-raised',
                )}
              >
                <input type="radio" name="reason" value={r.value} checked={reason === r.value}
                  onChange={() => setReason(r.value)} className="mt-1 accent-[#FF7A1A]" />
                <span>
                  <span className="block text-sm">{r.label}</span>
                  {r.hint ? <span className="block text-xs text-faint">{r.hint}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Anything else the moderator should know? (optional)"
            className="field h-auto resize-none py-2"
          />
          <Checkbox id="report-block" checked={block} onChange={setBlock}>
            Also block them
          </Checkbox>
          {reason === 'minor' ? (
            <Alert tone="warning">Thank you. Reports about minors are reviewed first.</Alert>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={!reason} loading={busy}>Send report</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

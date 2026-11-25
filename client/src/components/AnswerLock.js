import React from 'react';
import { Lock } from 'lucide-react';
import { Button, Modal } from './ui';

// Shown in place of the answer box when somebody else has the question open. It says who, so
// the next move is to go and talk to them rather than to wonder whether the page is broken.
export function LockedNotice({ lockedBy }) {
  if (!lockedBy) return null;
  return (
    <div className="callout callout-gold mb-2">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Lock size={16} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <strong>{lockedBy.name} is writing this answer.</strong>
          <div className="small mt-1">
            The box is read-only so the two of you do not write over each other. It opens on its
            own within a few seconds of them closing the question.
          </div>
        </div>
      </div>
    </div>
  );
}

// The popup the server's refusal earns: this answer moved on while they were typing, so saving
// would bury somebody else's work. Refreshing is the primary action, and overwriting stays
// available but has to be chosen on purpose.
export function ConflictModal({ open, onClose, onRefresh, onOverwrite, busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Someone else changed this answer"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Keep writing</Button>
        {onOverwrite && <Button variant="secondary" onClick={onOverwrite} loading={busy}>Save mine anyway</Button>}
        <Button onClick={onRefresh}>Show me the latest</Button>
      </>}
    >
      <p>
        This answer was saved by someone else while you were writing, so what is stored is newer
        than the version you started from.
      </p>
      <p className="small muted">
        <strong>Show me the latest</strong> replaces what is in your box with theirs, so copy
        anything you want to keep first. <strong>Save mine anyway</strong> keeps your text and
        replaces theirs. <strong>Keep writing</strong> closes this and changes nothing.
      </p>
    </Modal>
  );
}

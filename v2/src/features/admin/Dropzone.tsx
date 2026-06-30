import { useRef, useState } from 'react';
import { uploadImage } from '@/api/uploads';

interface DropzoneProps {
  /** Called with the public URL once an upload succeeds. */
  readonly onUploaded: (url: string) => void;
  /** Called with a user-friendly message when validation/upload fails. */
  readonly onError?: (message: string) => void;
  readonly label?: string;
}

/** Click-or-drag image uploader → returns a public URL via onUploaded. */
export function Dropzone({ onUploaded, onError, label = 'Drop image or click to upload' }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle(file: File | null | undefined) {
    if (!file || busy) return;
    setBusy(true);
    try {
      onUploaded(await uploadImage(file));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`dropzone ${drag ? 'is-drag' : ''} ${busy ? 'is-busy' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-busy={busy}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
      />
      <span aria-hidden="true">{busy ? '⏳' : '⬆'}</span>
      <span>{busy ? 'Uploading…' : label}</span>
    </div>
  );
}

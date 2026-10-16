import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { ALLOWED_UPLOAD_MIME_TYPES } from '../partner/portalHelpers';

interface PartnerFileDropzoneProps {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onFile: (file: File) => void;
}

/** File selection only: the parent owns validation and the private-bucket write. */
export function PartnerFileDropzone({ busy, disabled, onFile }: PartnerFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = busy || disabled;
  return (
    <div
      className={`dropzone ${dragging ? 'is-drag' : ''} ${busy ? 'is-busy' : ''}`}
      role="button" tabIndex={blocked ? -1 : 0} aria-disabled={blocked} aria-busy={busy}
      aria-label="Upload partner file"
      onClick={() => { if (!blocked) inputRef.current?.click(); }}
      onKeyDown={(event) => { if (!blocked && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(event) => { event.preventDefault(); if (!blocked) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (!blocked && file) onFile(file); }}
    >
      <input ref={inputRef} type="file" hidden disabled={blocked} accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
      <Upload size={20} aria-hidden="true" />
      <span>{busy ? 'Uploading…' : 'Drop a file or click to upload'}</span>
      <span className="hint">PDF, ZIP, PNG, JPEG, WebP, MP4 or TXT · up to 50 MB</span>
    </div>
  );
}

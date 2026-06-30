import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { SECTIONS, fetchSiteContent, saveSection, importDefaultContent, type ContentMap, type FieldDef, type SectionSchema, type SectionValue } from '@/api/siteContent';
import { lines } from '@/shared/utils/text';
import { ConfirmDialog } from './ConfirmDialog';
import { Dropzone } from './Dropzone';
import { useToast } from './Toast';
import { useUnsaved } from './Unsaved';

function blankItem(fields: readonly FieldDef[]): SectionValue {
  return Object.fromEntries(fields.map((f) => {
    if (f.type === 'number') return [f.key, 0];
    if (f.type === 'tags' || f.type === 'bullets') return [f.key, []];
    if (f.type === 'select') return [f.key, f.options?.[0] ?? ''];
    return [f.key, ''];
  }));
}

/** Coerce a tags/bullets value to an editable array WITHOUT trimming/filtering,
 *  so empty rows and in-progress whitespace survive while editing. */
function toEditableList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return v != null && v !== '' ? String(v).split('\n') : [];
}

/** Clean a section's value for persistence: trim/drop-empty tags & bullets,
 *  coerce number fields from their raw input strings, recurse into list items. */
function normalizeForSave(fields: readonly FieldDef[], value: SectionValue): SectionValue {
  const out: SectionValue = { ...value };
  for (const f of fields) {
    const v = out[f.key];
    if (f.type === 'number') {
      const raw = String(v ?? '').trim();
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n)) delete out[f.key]; // omit → code default re-applies on merge
      else out[f.key] = n;
    }
    else if (f.type === 'tags' || f.type === 'bullets') { out[f.key] = lines(v); }
    else if (f.type === 'list') { out[f.key] = (Array.isArray(v) ? v : []).map((item) => normalizeForSave(f.fields ?? [], item as SectionValue)); }
  }
  return out;
}

// ─── Textarea that grows with its content ────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder }: { readonly value: string; readonly onChange: (v: string) => void; readonly placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={2} className="textarea textarea--auto" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

// ─── LinkedIn-style chip / pill input for short tokens ───────────────────────
function TagInput({ value, onChange, label, hint }: { readonly value: unknown; readonly onChange: (v: string[]) => void; readonly label: string; readonly hint?: string }) {
  const tags = lines(value);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) {
      const next = tags.slice();
      for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
      if (next.length !== tags.length) { onChange(next); setLive(`Added. ${next.length} total.`); }
    }
    setDraft('');
  };
  const removeAt = (i: number) => { const t = tags[i]; onChange(tags.filter((_, j) => j !== i)); setLive(`Removed ${t ?? ''}.`); inputRef.current?.focus(); };

  return (
    <div className="field col-span">
      <label>{label}{hint && <span className="hint" style={{ marginLeft: 8, fontWeight: 400 }}>{hint}</span>}</label>
      <div className="chip-input" onClick={() => inputRef.current?.focus()} role="group" aria-label={label}>
        {tags.map((t, i) => (
          <span className="chip-tag" key={`${t}-${i}`}>
            {t}
            <button type="button" className="chip-tag__x" onMouseDown={(e) => e.preventDefault()} onClick={() => removeAt(i)} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          ref={inputRef} className="chip-input__field" value={draft}
          placeholder={tags.length ? 'Add…' : 'Type and press Enter…'}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(e) => {
            if (composing.current) return;
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(draft); }
            else if (e.key === 'Backspace' && draft === '' && tags.length) { e.preventDefault(); removeAt(tags.length - 1); }
          }}
          onPaste={(e) => { const txt = e.clipboardData.getData('text'); if (/[,\n]/.test(txt)) { e.preventDefault(); commit(draft + txt); } }}
          onBlur={() => { if (!composing.current) commit(draft); }}
        />
      </div>
      <span className="sr-only" aria-live="polite">{live}</span>
    </div>
  );
}

// ─── Per-row bullet editor for full-sentence lists ───────────────────────────
function BulletEditor({ value, onChange, label, hint, itemLabel }: { readonly value: unknown; readonly onChange: (v: string[]) => void; readonly label: string; readonly hint?: string; readonly itemLabel?: string }) {
  const items = toEditableList(value); // raw array — empty rows + in-progress whitespace survive
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const noun = itemLabel?.toLowerCase() ?? 'item';
  const set = (next: string[], focus?: number) => { onChange(next); if (focus != null) setTimeout(() => refs.current[focus]?.focus(), 0); };
  const addAfter = (i: number) => { const n = items.slice(); n.splice(i + 1, 0, ''); set(n, i + 1); };
  const removeAt = (i: number) => set(items.filter((_, j) => j !== i), Math.max(0, i - 1));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; const a = items[i]; const b = items[j]; if (a == null || b == null) return; const n = items.slice(); n[i] = b; n[j] = a; set(n, j); };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, i: number) => {
    const txt = e.clipboardData.getData('text');
    if (!txt.includes('\n')) return;
    e.preventDefault();
    const parts = txt.split('\n').map((s) => s.trim()).filter(Boolean);
    const cur = items[i] ?? '';
    const n = items.slice();
    n.splice(i, 1, ...(cur && parts[0] ? [`${cur} ${parts[0]}`, ...parts.slice(1)] : (cur ? [cur, ...parts] : parts)));
    set(n);
  };

  return (
    <div className="field col-span">
      <label>{label}{hint && <span className="hint" style={{ marginLeft: 8, fontWeight: 400 }}>{hint}</span>}</label>
      <div className="bullets">
        {items.length === 0 && <div className="list-empty">No {noun}s yet.</div>}
        {items.map((it, i) => (
          <div className="bullet-row" key={i}>
            <span className="bullet-row__dot" aria-hidden="true">•</span>
            <input
              ref={(el) => { refs.current[i] = el; }} className="input bullet-row__input" value={it}
              placeholder={`${itemLabel ?? 'Item'} ${i + 1}`}
              onChange={(e) => set(items.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addAfter(i); }
                else if (e.key === 'Backspace' && it === '' && items.length > 1) { e.preventDefault(); removeAt(i); }
              }}
              onPaste={(e) => onPaste(e, i)}
            />
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${noun} ${i + 1} up`}><span aria-hidden="true">↑</span></button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${noun} ${i + 1} down`}><span aria-hidden="true">↓</span></button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => removeAt(i)} aria-label={`Remove ${noun} ${i + 1}`}><span aria-hidden="true">×</span></button>
          </div>
        ))}
        <button type="button" className="btn btn--sm" onClick={() => addAfter(items.length - 1)}>+ Add {noun}</button>
      </div>
    </div>
  );
}

// ─── Image URL with a live preview thumbnail ─────────────────────────────────
function ImageField({ value, onChange, label, hint }: { readonly value: unknown; readonly onChange: (v: string) => void; readonly label: string; readonly hint?: string }) {
  const url = String(value ?? '');
  const [broken, setBroken] = useState(false);
  const { toast } = useToast();
  useEffect(() => { setBroken(false); }, [url]);
  return (
    <div className="field col-span">
      <label>{label}</label>
      <div className="image-field">
        {url && !broken
          ? <img className="image-field__preview" src={url} alt="" onError={() => setBroken(true)} />
          : <span className="image-field__broken" role="img" aria-label={url ? 'Image failed to load' : 'No image'}>{url ? '⚠' : '🖼'}</span>}
        <input className="input" type="text" value={url} placeholder="https://…" onChange={(e) => onChange(e.target.value)} />
      </div>
      <Dropzone onUploaded={(u) => { onChange(u); toast('Image uploaded — remember to Save.'); }} onError={(m) => toast(m, 'err')} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ─── Fixed-choice dropdown (e.g. milestone status) ───────────────────────────
function SelectField({ value, onChange, label, hint, options }: { readonly value: unknown; readonly onChange: (v: string) => void; readonly label: string; readonly hint?: string; readonly options: readonly string[] }) {
  const v = String(value ?? '');
  const known = options.includes(v);
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={known ? v : ''} onChange={(e) => onChange(e.target.value)}>
        {/* Surface an empty or legacy/typo'd value so it's visible until a valid one is picked. */}
        {!known && <option value="" disabled>{v ? `${v} — pick a valid value` : 'Select…'}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ─── Quarter + year period picker (roadmap timelines: "Q3 2023", "2025", "2026+") ───
function PeriodField({ value, onChange, label, hint }: { readonly value: unknown; readonly onChange: (v: string) => void; readonly label: string; readonly hint?: string }) {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^(Q[1-4])\s+(.*)$/i); // "Q3 2023" → quarter + remainder; else year-only
  const quarter = m ? (m[1] ?? '').toUpperCase() : '';
  const year = m ? (m[2] ?? '') : raw;
  const compose = (q: string, y: string) => (q ? `${q} ${y}`.trim() : y.trim());
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="select" style={{ flex: '0 0 132px' }} value={quarter} onChange={(e) => onChange(compose(e.target.value, year))} aria-label={`${label} — quarter`}>
          <option value="">— (year only)</option>
          <option value="Q1">Q1</option>
          <option value="Q2">Q2</option>
          <option value="Q3">Q3</option>
          <option value="Q4">Q4</option>
        </select>
        <input className="input" style={{ flex: 1 }} type="text" value={year} placeholder="2025 · 2026+" onChange={(e) => onChange(compose(quarter, e.target.value))} aria-label={`${label} — year`} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ─── Repeatable list with COLLAPSIBLE items ──────────────────────────────────
// Each item is a collapsible card showing a summary (its first text field) when
// closed, so a long per-item form (e.g. a full team-member profile) isn't an
// overwhelming wall of inputs. A single-item list opens by default; multi-item
// lists start collapsed.
function ListField({ def, value, onChange }: { readonly def: FieldDef; readonly value: unknown; readonly onChange: (v: unknown) => void }) {
  const items = (Array.isArray(value) ? value : []) as SectionValue[];
  const noun = def.itemLabel?.toLowerCase() ?? 'item';
  const [open, setOpen] = useState<Set<number>>(() => new Set(items.length <= 1 ? [0] : []));
  const toggle = (i: number) => setOpen((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const setItem = (i: number, item: SectionValue) => onChange(items.map((x, j) => (j === i ? item : x)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    const a = items[i]; const b = items[j];
    if (!a || !b) return;
    const next = items.slice(); next[i] = b; next[j] = a; onChange(next);
  };
  const add = () => { onChange([...items, blankItem(def.fields ?? [])]); setOpen((prev) => new Set(prev).add(items.length)); };
  const summaryOf = (item: SectionValue): string => {
    for (const f of def.fields ?? []) { const v = item[f.key]; if (typeof v === 'string' && v.trim()) return v.trim(); }
    return '';
  };

  return (
    <div className="field col-span">
      <label>{def.label}{def.hint && <span className="hint" style={{ marginLeft: 8, fontWeight: 400 }}>{def.hint}</span>}</label>
      <div className="list-editor">
        {items.length === 0 && <div className="list-empty">No {noun}s yet.</div>}
        {items.map((item, i) => {
          const isOpen = open.has(i);
          const summary = summaryOf(item);
          return (
            <div className="list-item" key={i}>
              <div className="list-item__head">
                <button type="button" className="list-item__toggle" onClick={() => toggle(i)} aria-expanded={isOpen}>
                  <span className="field-group__caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  <span>{def.itemLabel ?? 'Item'} {i + 1}</span>
                  {summary && <span className="list-item__summary">{summary}</span>}
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
              {isOpen && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  {(def.fields ?? []).map((sf) => (
                    <Field key={sf.key} def={sf} value={item[sf.key]} onChange={(v) => setItem(i, { ...item, [sf.key]: v })} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="btn btn--sm" onClick={add}>+ Add {noun}</button>
      </div>
    </div>
  );
}

function Field({ def, value, onChange }: { readonly def: FieldDef; readonly value: unknown; readonly onChange: (v: unknown) => void }) {
  if (def.type === 'period') return <PeriodField value={value} onChange={onChange} label={def.label} hint={def.hint} />;
  if (def.type === 'select') return <SelectField value={value} onChange={onChange} label={def.label} hint={def.hint} options={def.options ?? []} />;
  if (def.type === 'tags') return <TagInput value={value} onChange={onChange} label={def.label} hint={def.hint} />;
  if (def.type === 'bullets') return <BulletEditor value={value} onChange={onChange} label={def.label} hint={def.hint} itemLabel={def.itemLabel} />;
  if (def.type === 'image') return <ImageField value={value} onChange={onChange} label={def.label} hint={def.hint} />;
  if (def.type === 'list') return <ListField def={def} value={value} onChange={onChange} />;
  if (def.type === 'textarea') {
    return (
      <div className="field col-span">
        <label>{def.label}</label>
        <AutoTextarea value={String(value ?? '')} onChange={onChange} />
        {def.hint && <span className="hint">{def.hint}</span>}
      </div>
    );
  }
  // number stays a raw string while typing (so '97.', '-', '' survive); coerced at save.
  return (
    <div className="field">
      <label>{def.label}</label>
      <input
        className="input"
        type="text"
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
      {def.hint && <span className="hint">{def.hint}</span>}
    </div>
  );
}

// Collapsible accordion for sections with many fields (e.g. Team's lead profile).
function FieldGroup({ title, defaultOpen, children }: { readonly title: string; readonly defaultOpen?: boolean; readonly children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="field-group col-span">
      <button type="button" className="field-group__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="field-group__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>{title}
      </button>
      {open && <div className="form-grid field-group__body">{children}</div>}
    </div>
  );
}

// Render fields, collapsing consecutive same-group fields into one accordion.
function renderSectionFields(fields: readonly FieldDef[], value: SectionValue, onField: (key: string, v: unknown) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const cur = fields[i];
    if (!cur) break;
    if (cur.group) {
      const g = cur.group;
      const groupFields: FieldDef[] = [];
      let open = false;
      while (i < fields.length) {
        const f = fields[i];
        if (!f || f.group !== g) break;
        if (f.groupOpen) open = true;
        groupFields.push(f);
        i++;
      }
      out.push(
        <FieldGroup key={`group-${g}`} title={g} defaultOpen={open}>
          {groupFields.map((gf) => <Field key={gf.key} def={gf} value={value[gf.key]} onChange={(v) => onField(gf.key, v)} />)}
        </FieldGroup>,
      );
    } else {
      out.push(<Field key={cur.key} def={cur} value={value[cur.key]} onChange={(v) => onField(cur.key, v)} />);
      i++;
    }
  }
  return out;
}

function SectionCard({ schema, initial }: { readonly schema: SectionSchema; readonly initial: SectionValue }) {
  const { toast } = useToast();
  const { setDirty } = useUnsaved();
  // Normalise the seed so value & saved start in the canonical shape (arrays for
  // tags/bullets, numbers for number fields) and the dirty-check compares like-for-like.
  const [value, setValue] = useState<SectionValue>(() => normalizeForSave(schema.fields, initial));
  const [saved, setSaved] = useState<SectionValue>(() => normalizeForSave(schema.fields, initial));
  const [saving, setSaving] = useState(false);
  // Compare canonical (normalized) shapes so typing a number back to its original isn't "dirty".
  const dirty = JSON.stringify(normalizeForSave(schema.fields, value)) !== JSON.stringify(saved);

  // Surface this section's dirty state to the cross-tab unsaved-changes guard.
  useEffect(() => { setDirty(schema.key, dirty); }, [dirty, schema.key, setDirty]);

  async function save() {
    setSaving(true);
    try {
      const clean = normalizeForSave(schema.fields, value);
      await saveSection(schema.key, clean);
      setValue(clean); setSaved(clean);
      toast(`${schema.label} saved — live now.`);
    } catch (e) { toast(e instanceof Error ? e.message : 'Save failed', 'err'); }
    finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <span className="toolbar__title" style={{ fontSize: 15 }}>{schema.label}</span>
        <div className="admin__spacer" />
        {dirty && <span className="tag" style={{ color: 'var(--a-gold)', borderColor: '#fedf89', background: 'var(--a-gold-weak)' }}>Unsaved</span>}
        <button className="btn btn--primary btn--sm" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
      </div>
      <div className="form-grid">
        {renderSectionFields(schema.fields, value, (k, v) => setValue((p) => ({ ...p, [k]: v })))}
      </div>
    </div>
  );
}

export function ContentPanel() {
  const { clear } = useUnsaved();
  const [data, setData] = useState<ContentMap | null>(null);
  const [nonce, setNonce] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [active, setActive] = useState<string>(SECTIONS[0]?.key ?? '');

  const reload = () => fetchSiteContent().then((d) => { setData(d); setNonce((n) => n + 1); });
  useEffect(() => { reload(); }, []);
  // Discard the unsaved-changes flags when leaving the Content tab (edits are dropped).
  useEffect(() => () => clear(), [clear]);

  async function doImport() {
    setImporting(true); setMsg(null);
    try {
      const n = await importDefaultContent();
      await reload();
      setConfirm(false);
      setMsg({ kind: 'ok', text: `Imported defaults for ${n} sections (existing edits kept).` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setImporting(false);
    }
  }

  if (!data) return <div className="center-note">Loading…</div>;
  const activeSchema = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0];
  return (
    <div>
      <div className="toolbar">
        <span className="toolbar__title">Page content</span>
        <div className="admin__spacer" />
        <button className="btn" onClick={() => setConfirm(true)}>Import current content</button>
      </div>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg--ok' : 'msg--err'}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      <div className="content-layout">
        <nav className="content-menu" aria-label="Pages">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" className={`content-menu__item ${s.key === active ? 'is-active' : ''}`} onClick={() => setActive(s.key)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="content-body">
          {activeSchema && <SectionCard key={`${activeSchema.key}-${nonce}`} schema={activeSchema} initial={data[activeSchema.key] ?? activeSchema.default} />}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Import current content"
          message="Seed the database with the current default content for any section not yet stored. Sections you've already edited are kept as-is."
          confirmLabel="Import" busy={importing}
          onConfirm={doImport} onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

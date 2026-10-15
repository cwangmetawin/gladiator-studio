import { useEffect, useRef, useState } from 'react';
import { EditorialChapter, EditorialIndex } from '@/features/arena-page/Editorial';
import { DecodedKey } from '@/features/arena-page/DecodedKey';
import { safeHref } from '@/shared/utils/text';
import { docsParagraphs, fileSizeLabel, fileTypeLabel, maskApiKey } from './portalHelpers';
import { createPartnerDownload } from './portalStorage';
import { usePortalData } from './usePortalData';
import type { PortalDataProps, PortalResource } from './usePortalData';
import type { PartnerFile } from './portalTypes';

const SECTIONS = [
  { id: 'partner-docs', label: 'Integration docs' },
  { id: 'partner-credentials', label: 'Sandbox keys' },
  { id: 'partner-assets', label: 'Game assets' },
  { id: 'partner-games', label: 'Games & certificates' },
] as const;

/** The arena page renders immediately; each resource supplies its own loading/error affordance. */
export function PortalSections(props: PortalDataProps) {
  const data = usePortalData(props);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [copyError, setCopyError] = useState('');
  const [downloads, setDownloads] = useState<Record<string, boolean>>({});
  const [downloadError, setDownloadError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function copyValue(value: string, field: string) {
    setCopied('');
    setCopiedField('');
    setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (mounted.current) { setCopied('Copied'); setCopiedField(field); }
    } catch {
      if (mounted.current) setCopyError('Copy could not complete. Select and copy the value manually.');
    }
  }

  async function download(file: PartnerFile) {
    setDownloadError('');
    setDownloads(current => ({ ...current, [file.path]: true }));
    try {
      // Signed URLs are created only in response to this click, never while listing files.
      const url = await createPartnerDownload(file);
      if (!mounted.current) return;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      if (mounted.current) setDownloadError(`Could not download ${file.name}. Please try again when your connection is available.`);
    } finally {
      if (mounted.current) setDownloads(current => ({ ...current, [file.path]: false }));
    }
  }

  function status<T>(resource: PortalResource<T>, loading: string) {
    if (resource.loading) return <p className="partner__loading" role="status">{loading}</p>;
    if (resource.error) return <div className="partner__error" role="alert"><p>{resource.error}</p>
      <button type="button" className="partner__button" onClick={resource.retry}>Retry</button></div>;
    return null;
  }

  function fileList(files: PartnerFile[], empty: string) {
    if (!files.length) return <p className="partner__empty">{empty}</p>;
    return <ul className="partner__files">{files.map(file => <li className="partner__file" key={file.path}>
      <span className="partner__fileglyph" aria-hidden="true">[{fileTypeLabel(file.name, file.mimeType).split(' ')[0]}]</span>
      <div><span className="partner__filename">{file.name}</span>
        <span className="partner__filemeta">{fileTypeLabel(file.name, file.mimeType)} · {fileSizeLabel(file.size)}
          {file.updatedAt && <> · <time dateTime={file.updatedAt}>{file.updatedAt.slice(0, 10)}</time></>}</span></div>
      <button type="button" className="partner__button" aria-label={`Download ${file.name}`}
        disabled={Boolean(downloads[file.path])} onClick={() => download(file)}>
        {downloads[file.path] ? 'Preparing…' : 'Download'}
      </button>
    </li>)}</ul>;
  }

  function groupedFiles(files: PartnerFile[]) {
    const groups = new Map<string, PartnerFile[]>();
    for (const file of files) {
      const slug = file.path.split('/')[1] || 'Other files';
      const group = groups.get(slug) ?? [];
      group.push(file);
      groups.set(slug, group);
    }
    return [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([slug, group]) =>
      <div className="partner__filegroup" key={slug}>
        <h3>{data.games.data.find(game => game.slug === slug)?.title ?? slug}</h3>
        {fileList(group, 'Nothing here yet — new files appear the moment we publish them.')}
      </div>);
  }

  return <div className="partner__portal">
    <EditorialIndex chapters={SECTIONS} label="Partner sections" />
    <p className="partner__announcement" aria-live="polite" role="status">{copied}</p>
    {copyError && <p className="partner__error" role="alert">{copyError}</p>}
    {downloadError && <div className="partner__error" role="alert"><p>{downloadError}</p>
      <p>Use Download again to retry.</p></div>}

    <EditorialChapter className="partner__section" id="partner-docs" number="01" kicker="DOCS" title="Integration docs" deck="Everything you need to go live.">
      {status(data.docs, 'Loading integration docs…')}
      {!data.docs.loading && !data.docs.error && (data.docs.data.length ? data.docs.data.map(doc =>
        <article className="partner__document" key={doc.id}><h3>{doc.title}</h3>
          {docsParagraphs(doc.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </article>) : <p className="partner__empty">Nothing here yet — new files appear the moment we publish them.</p>)}
      <h3>Document downloads</h3>
      {status(data.docFiles, 'Loading document downloads…')}
      {!data.docFiles.loading && !data.docFiles.error && fileList(data.docFiles.data, 'Nothing here yet — new files appear the moment we publish them.')}
    </EditorialChapter>

    <EditorialChapter className="partner__section" id="partner-credentials" number="02" kicker="KEYS" title="Sandbox keys" deck="Issued to your team alone.">
      {props.preview ? <p className="partner__empty">Each partner sees only its own credentials. They are managed in <a href="/admin">/admin</a>.</p> : <>
        {status(data.credentials, 'Loading test credentials…')}
        {!data.credentials.loading && !data.credentials.error && (data.credentials.data.length ?
          <ul className="partner__credentials">{data.credentials.data.map(credential => <li className="partner__credential partner__vault" key={credential.id}>
            <h3>{credential.label}</h3>
            {credential.sandbox_url && <p><span className="partner__label">Sandbox URL</span>
              <a href={safeHref(credential.sandbox_url)} target="_blank" rel="noopener noreferrer">{credential.sandbox_url}</a></p>}
            <div className="partner__credentialrow"><span className="partner__label">Username</span>
              <code>{credential.username || 'Not provided'}</code>
              {credential.username && <button type="button" className="partner__button" aria-label={`Copy username for ${credential.label}`}
                onClick={() => copyValue(credential.username!, `${credential.id}:username`)}><span key={copiedField === `${credential.id}:username` ? 'copied' : 'copy'} className="partner__copy-label">{copiedField === `${credential.id}:username` ? 'Copied' : 'Copy'}</span></button>}</div>
            <div className="partner__credentialrow"><span className="partner__label">API key</span>
              <code className="partner__key">{credential.api_key ? <DecodedKey value={credential.api_key} revealed={Boolean(revealed[credential.id])}>{revealed[credential.id] ? credential.api_key : maskApiKey(credential.api_key)}</DecodedKey> : 'Not provided'}</code>
              {credential.api_key && <><button type="button" className="partner__button" aria-pressed={Boolean(revealed[credential.id])}
                aria-label={`${revealed[credential.id] ? 'Hide' : 'Reveal'} API key for ${credential.label}`}
                onClick={() => setRevealed(current => ({ ...current, [credential.id]: !current[credential.id] }))}>
                {revealed[credential.id] ? 'Hide' : 'Reveal'}</button>
              <button type="button" className="partner__button" aria-label={`Copy API key for ${credential.label}`}
                onClick={() => copyValue(credential.api_key!, `${credential.id}:key`)}><span key={copiedField === `${credential.id}:key` ? 'copied' : 'copy'} className="partner__copy-label">{copiedField === `${credential.id}:key` ? 'Copied' : 'Copy'}</span></button></>}</div>
            {credential.notes && <p className="partner__notes">{credential.notes}</p>}
          </li>)}</ul> : <p className="partner__empty">No sandbox keys yet. We’ll issue them when your integration starts.</p>)}
      </>}
    </EditorialChapter>

    <EditorialChapter className="partner__section" id="partner-assets" number="03" kicker="ASSETS" title="Game assets" deck="Logos, key art and marketing packs.">
      {status(data.assetFiles, 'Loading game assets…')}
      {!data.assetFiles.loading && !data.assetFiles.error && (data.assetFiles.data.length ? groupedFiles(data.assetFiles.data) :
        <p className="partner__empty">Nothing here yet — new files appear the moment we publish them.</p>)}
    </EditorialChapter>

    <EditorialChapter className="partner__section" id="partner-games" number="04" kicker="CERTIFIED" title="Games & certificates" deck="Live RTPs as published, with lab certificates.">
      {status(data.games, 'Loading game information…')}
      {!data.games.loading && !data.games.error && (data.games.data.length ? data.games.data.map(game =>
        <article className="partner__game" key={game.id}>
          <h3>{game.title}</h3>
          <dl className="partner__gamefacts">
            <div><dt>Genre</dt><dd>{game.genre || 'Not provided'}</dd></div>
            <div className={`partner__rtp${game.rtp == null ? ' partner__rtp--missing' : ''}`}><dt>RTP</dt><dd>{game.rtp == null ? 'Not provided' : String(game.rtp)}</dd></div>
            <div><dt>Volatility</dt><dd>{game.volatility || 'Not provided'}</dd></div>
            <div><dt>Release date</dt><dd>{game.release_date || 'Not provided'}</dd></div>
          </dl>
          {game.slug && !data.certificateFiles.loading && !data.certificateFiles.error &&
            fileList(data.certificateFiles.data.filter(file => file.path.startsWith(`certificates/${game.slug}/`)), 'Nothing here yet — new files appear the moment we publish them.')}
        </article>) : <p className="partner__empty">Nothing here yet — new files appear the moment we publish them.</p>)}
      {status(data.certificateFiles, 'Loading certificates…')}
      {!data.certificateFiles.loading && !data.certificateFiles.error && groupedFiles(data.certificateFiles.data.filter(file =>
        !data.games.data.some(game => game.slug && file.path.startsWith(`certificates/${game.slug}/`))))}
    </EditorialChapter>
  </div>;
}

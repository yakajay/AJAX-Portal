import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiJson, downloadFile } from '../lib/api';
import { errorMessage, formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner } from '../components/ui';

interface HrDocument {
  id: string;
  name: string;
  type: string;
  date: string;
  fileName: string;
  contentType: string;
  size: number;
  hasFile: boolean;
}

const sizeLabel = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const Documents = () => {
  const { data, loading, error } = useAsync(() => apiJson<HrDocument[]>('/user/documents'));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const docs = data ?? [];
  const current = docs.find((d) => d.id === pickedId) ?? docs[0];

  const download = async (doc: HrDocument) => {
    try {
      setDownloadError(null);
      await downloadFile(`/user/documents/${doc.id}/file`, doc.fileName || doc.name);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Documents" subtitle="Your employment documents · visible to you and HR" />
      <ErrorNote error={error ?? downloadError} />
      {loading && !data ? <Spinner /> : !current ? (
        <div className="bg-white rounded-2xl border border-slate-200"><Empty>No documents yet. Letters and forms HR shares with you appear here.</Empty></div>
      ) : (
        <div className="flex flex-wrap gap-5 items-start">
          <ul className="flex-1 basis-72 min-w-0 flex flex-col gap-2" aria-label="Your documents">
            {docs.map((d) => {
              const on = d.id === current.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setPickedId(d.id)}
                    aria-pressed={on}
                    className={`w-full min-h-14 text-left px-4 py-3 rounded-xl border-[1.5px] flex flex-col gap-0.5 transition-colors ${
                      on ? 'border-blue-600 bg-blue-100' : 'border-slate-200 bg-white hover:bg-blue-50'
                    }`}
                  >
                    <span className="font-bold text-[15px] text-slate-900">{d.name}</span>
                    <span className="text-[13px] text-slate-500">{d.type} · {formatDate(d.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <article className="flex-[2] basis-96 min-w-0 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5 min-w-0">
                <Badge tone="blue">{current.type}</Badge>
                <h2 className="text-2xl font-extrabold text-slate-900 break-words">{current.name}</h2>
                <span className="text-[13px] text-slate-500">Dated {formatDate(current.date)}</span>
              </div>
              {current.hasFile && (
                <Button onClick={() => download(current)}><Download size={16} aria-hidden="true" />Download</Button>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
              <dt className="text-slate-500">File</dt>
              <dd className="font-semibold text-slate-900 break-all">{current.hasFile ? current.fileName || current.name : 'No file attached yet'}</dd>
              {current.hasFile && (
                <>
                  <dt className="text-slate-500">Format</dt>
                  <dd className="font-semibold text-slate-900">{current.contentType || '—'}</dd>
                  <dt className="text-slate-500">Size</dt>
                  <dd className="font-semibold text-slate-900">{sizeLabel(current.size)}</dd>
                </>
              )}
            </dl>
          </article>
        </div>
      )}
    </div>
  );
};

export default Documents;

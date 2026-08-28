import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, MicroLabel } from '../components/ui/Card';
import { Field } from '../components/ui/Input';

const FORMATS = ['svg', 'png'];

const FILE_INPUT =
  'w-full text-[12.5px] text-muted file:mr-3 file:rounded file:border file:border-line ' +
  'file:bg-transparent file:px-2 file:py-1 file:text-[12px] file:text-text';

// Strips the `data:image/png;base64,` prefix FileReader adds. The API stores bare base64, and the
// PNG magic-number check in src/lib/qr.js rejects the prefixed form.
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

export function QrCode() {
  const { restaurant, restaurantId } = useOutletContext();
  const { me } = useAuth();
  // null while loading, {} when nothing has been uploaded yet, otherwise object URLs per format.
  const [previews, setPreviews] = useState(null);
  const [busy, setBusy] = useState(null);
  const [files, setFiles] = useState({ svg: null, png: null });
  const [version, setVersion] = useState(0);

  // Served by the API from PUBLIC_BASE_URL, never assembled here. The browser used to build
  // this from a Vite env var, and a dev value in that var is how http://localhost:3000/kasi-flame
  // ended up inside a real QR code.
  const publicUrl = restaurant?.qr_target_url || '';

  // A development address encodes just as cleanly as a real one and is worthless on a coaster.
  // Nothing downstream can tell the difference, so the warning has to happen here, in front of
  // the person who is about to send artwork to a printer.
  const isDevAddress = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(publicUrl);

  useEffect(() => {
    let urls = [];
    let live = true;

    (async () => {
      try {
        const loaded = {};
        for (const format of FORMATS) {
          const { blob } = await api.fetchQr(restaurantId, format);
          loaded[format] = URL.createObjectURL(blob);
          // Tracked as each one is made, not after the loop: unmounting between the two fetches
          // would otherwise leak the first URL for the life of the tab.
          urls.push(loaded[format]);
        }
        // The tab can be left, or a new file uploaded, before both fetches land. Without this the
        // URLs are revoked by the cleanup below and the images render broken.
        if (live) setPreviews(loaded);
      } catch (err) {
        // 404 is the normal "not generated yet" state, not a failure worth a toast.
        if (live) setPreviews({});
        if (err.status !== 404) toast.error(err.message);
      }
    })();

    return () => {
      live = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [restaurantId, version]);

  async function download(format) {
    setBusy(format);
    try {
      const { blob, filename } = await api.fetchQr(restaurantId, format);
      // Object URL rather than a plain href: the request needs an auth header, so the file has
      // already been fetched by the time we get here.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${filename} downloaded`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function upload(e) {
    e.preventDefault();
    const form = e.target;
    setBusy('upload');
    try {
      await api.uploadQr(restaurantId, {
        svg: await files.svg.text(),
        png: await readAsBase64(files.png),
      });
      form.reset();
      setFiles({ svg: null, png: null });
      setVersion((n) => n + 1);
      toast.success('Uploaded — now scan the preview to check it');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const has = previews !== null && Object.keys(previews).length > 0;

  return (
    <div>
      <h1 className="mb-1 font-serif text-[26px] font-medium tracking-[-0.015em]">QR code</h1>
      <p className="mb-5 text-[12.5px] text-muted">
        One code for the whole restaurant. Put it on your coasters.
      </p>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>{has ? 'Download' : 'Your code'}</CardTitle></CardHeader>
        <div className="p-4">
          <MicroLabel>Points at</MicroLabel>
          <p className="mb-4 mt-1 break-all font-mono text-[12px] text-text">{publicUrl}</p>

          {isDevAddress && (
            <div className="mb-4 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3 text-[12.5px] leading-relaxed text-text">
              <strong className="font-semibold">This is a development address.</strong> A QR code
              generated against it scans to a machine that only exists on your desk — it will fail
              on every phone in the restaurant. Set <span className="font-mono">PUBLIC_BASE_URL</span>{' '}
              on the API to the public address before generating anything for print.
            </div>
          )}

          {previews === null && <p className="text-[12.5px] text-dim">Loading…</p>}

          {previews !== null && !has && (
            <p className="text-[12.5px] text-muted">
              Your QR code is being prepared — we will let you know the moment it is ready to print.
            </p>
          )}

          {has && (
            <>
              {/* Through <img> rather than inlined. SVG is executable markup and this file arrived
                  as an upload; inside an <img> its script cannot run. */}
              <img
                src={previews.svg}
                alt="Your QR code"
                className="mb-4 h-40 w-40 rounded border border-line bg-white p-2"
              />

              <div className="flex flex-wrap gap-2">
                {FORMATS.map((format) => (
                  <Button
                    key={format}
                    variant={format === 'svg' ? 'primary' : 'secondary'}
                    onClick={() => download(format)}
                    disabled={!!busy}
                  >
                    <Download size={13} />
                    {busy === format ? 'Downloading…' : format === 'svg' ? 'SVG (for print)' : 'PNG'}
                  </Button>
                ))}
              </div>

              <ul className="mt-5 flex flex-col gap-1.5 text-[12px] leading-relaxed text-dim">
                <li>
                  <strong className="font-medium text-muted">Use the SVG if your printer accepts it.</strong>{' '}
                  It scales to any coaster size without softening the edges, and a blurred module is a
                  code that will not scan.
                </li>
                <li>
                  <strong className="font-medium text-muted">Do not recolour it.</strong> Black on white
                  is deliberate — this gets read at an angle, in dim light, sometimes through a wet ring.
                </li>
                <li>
                  <strong className="font-medium text-muted">Leave white space around it.</strong> Roughly
                  the width of four squares on every side, or scanners will not find the edges.
                </li>
                <li>
                  <strong className="font-medium text-muted">This code never changes.</strong> Reprint the
                  same file whenever you need more coasters — the address is fixed for good.
                </li>
              </ul>
            </>
          )}
        </div>
      </Card>

      {me.isAdmin && (
        <Card className="p-0">
          <CardHeader><CardTitle>Upload (ComplexAI only)</CardTitle></CardHeader>
          <form className="flex flex-col gap-3 p-4" onSubmit={upload}>
            <p className="text-[12px] leading-relaxed text-dim">
              Generate both files in the subscription system against{' '}
              <span className="font-mono text-muted">{publicUrl}</span>, then upload them together.
              Scan the preview above with a phone afterwards — nothing on this side can tell whose
              code this is, and a wrong one is only noticed once the coasters land.
            </p>

            <Field label="SVG">
              <input
                type="file"
                accept=".svg,image/svg+xml"
                onChange={(e) => setFiles({ ...files, svg: e.target.files[0] || null })}
                className={FILE_INPUT}
              />
            </Field>

            <Field label="PNG">
              <input
                type="file"
                accept=".png,image/png"
                onChange={(e) => setFiles({ ...files, png: e.target.files[0] || null })}
                className={FILE_INPUT}
              />
            </Field>

            {/* Both or neither: the API rejects a half pair, and this saves the round trip. */}
            <div>
              <Button type="submit" disabled={!files.svg || !files.png || !!busy}>
                <Upload size={13} /> {busy === 'upload' ? 'Uploading…' : 'Upload both'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

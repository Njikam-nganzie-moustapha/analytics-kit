import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { fetchSourceMaps, uploadSourceMap, deleteSourceMap, type SourceMapMeta } from '../api'

interface Props {
  site: string
}

function fmtBytes(n: number): string {
  if (n < 1024)       return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function timeAgo(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function SourceMapsTab({ site }: Props) {
  const [maps,     setMaps]     = useState<SourceMapMeta[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [release,  setRelease]  = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setMaps(await fetchSourceMaps(site)) }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [site])

  useEffect(() => { load() }, [load])

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !release.trim()) { setUploadErr('Select a file and enter a release.'); return }
    setUploading(true); setUploadErr('')
    try {
      const content = await file.text()
      // Basic validation: must be JSON with version:3
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (parsed.version !== 3) { setUploadErr('Not a valid source map (version must be 3).'); return }
      await uploadSourceMap(site, release.trim(), file.name, content)
      if (fileRef.current) fileRef.current.value = ''
      setRelease('')
      await load()
    } catch (e) {
      setUploadErr(String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(m: SourceMapMeta) {
    if (!confirm(`Delete ${m.filename} @ ${m.release}?`)) return
    try {
      await deleteSourceMap(site, m.release, m.filename)
      setMaps(prev => prev.filter(x => !(x.filename === m.filename && x.release === m.release)))
    } catch (e) {
      alert(String(e))
    }
  }

  // Group by release
  const byRelease: Record<string, SourceMapMeta[]> = {}
  for (const m of maps) {
    ;(byRelease[m.release] ??= []).push(m)
  }

  return (
    <div className="smap-wrap">
      {/* Upload form */}
      <div className="smap-upload-card">
        <div className="smap-upload-title">Upload source map</div>
        <div className="smap-upload-row">
          <input
            className="input"
            placeholder="Release (e.g. 1.4.2 or git SHA)"
            value={release}
            onChange={e => setRelease(e.target.value)}
            style={{ flex: 1 }}
          />
          <label className="btn btn-ghost smap-file-label">
            <input
              ref={fileRef}
              type="file"
              accept=".map,application/json"
              style={{ display: 'none' }}
              onChange={() => setUploadErr('')}
            />
            Choose .map
          </label>
          <button className="btn" onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {uploadErr && <span className="smap-err">{uploadErr}</span>}
        <p className="smap-hint">
          Source maps are used to symbolicate stack traces in error reports.
          Upload <code>*.js.map</code> files and tag them with the matching release.
        </p>
      </div>

      {/* List */}
      {loading && (
        <div className="smap-loading">Loading…</div>
      )}
      {error && (
        <div className="smap-err" style={{ marginTop: 16 }}>{error}</div>
      )}
      {!loading && maps.length === 0 && !error && (
        <div className="empty" style={{ marginTop: 24 }}>
          <span className="empty-title">No source maps uploaded</span>
          <span>Upload a <code>.map</code> file above to enable symbolication.</span>
        </div>
      )}

      {Object.entries(byRelease).sort(([a], [b]) => b.localeCompare(a)).map(([rel, items]) => (
        <motion.div
          key={rel}
          className="smap-release-group"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="smap-release-header">
            <span className="smap-release-tag">{rel}</span>
            <span className="smap-release-count">{items.length} file{items.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="smap-table">
            <thead>
              <tr>
                <th>File</th>
                <th className="col-r">Size</th>
                <th className="col-r">Uploaded</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.filename}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.filename}</td>
                  <td className="col-r" style={{ color: 'var(--text-2)', fontSize: 12 }}>{fmtBytes(m.size)}</td>
                  <td className="col-r" style={{ color: 'var(--text-2)', fontSize: 12 }} title={new Date(m.uploadedAt).toLocaleString()}>
                    {timeAgo(m.uploadedAt)}
                  </td>
                  <td>
                    <button
                      className="cron-delete-btn"
                      onClick={() => handleDelete(m)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      ))}
    </div>
  )
}

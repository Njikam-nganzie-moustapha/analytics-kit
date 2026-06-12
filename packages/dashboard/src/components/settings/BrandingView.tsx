import { useEffect, useState } from 'react'
import { Palette, RotateCcw, Save } from 'lucide-react'
import { fetchBranding, saveBranding } from '@/api'
import { applyPrimary, hexToHslTriple, hslTripleToHex } from '@/branding'
import { Section } from '@/components/kit/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState, ErrorState } from '@/components/shell/states'
import { toast } from 'sonner'

export function BrandingView({ site, onSaved }: { site: string; onSaved?: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [hex, setHex] = useState('#2563eb')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true); setError('')
    fetchBranding(site)
      .then(b => {
        setName(b?.productName ?? '')
        setLogo(b?.logoUrl ?? '')
        setHex(hslTripleToHex(b?.primary))
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [site])

  // Live preview of the primary colour while editing.
  useEffect(() => { applyPrimary(hexToHslTriple(hex)) }, [hex])

  async function save() {
    const primary = hexToHslTriple(hex)
    setSaving(true)
    try {
      await saveBranding(site, {
        product_name: name.trim() || null,
        logo_url: logo.trim() || null,
        primary,
      })
      toast.success('Branding saved')
      onSaved?.()
    } catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`) }
    finally { setSaving(false) }
  }

  function reset() { setName(''); setLogo(''); setHex('#2563eb') }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-2xl space-y-6">
      <Section title="White-label branding" desc={`Customise how the dashboard looks for “${site}”. Applies whenever this site is selected.`}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Product name</Label>
            <Input id="brand-name" value={name} onChange={e => setName(e.target.value)} placeholder="analyticskit" maxLength={60} />
            <p className="text-[12px] text-muted-foreground">Shown in the sidebar instead of “analyticskit”.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-logo">Logo URL</Label>
            <Input id="brand-logo" value={logo} onChange={e => setLogo(e.target.value)} placeholder="https://…/logo.svg" className="font-mono text-[13px]" inputMode="url" />
            <p className="text-[12px] text-muted-foreground">Square image (https). Replaces the default mark.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-color">Accent colour</Label>
            <div className="flex items-center gap-3">
              <input id="brand-color" type="color" value={hex} onChange={e => setHex(e.target.value)}
                className="size-9 cursor-pointer rounded border border-border bg-transparent" aria-label="Accent colour" />
              <Input value={hex} onChange={e => setHex(e.target.value)} className="w-32 font-mono text-[13px]" />
              <span className="grid h-9 flex-1 place-items-center rounded-md text-[13px] font-medium text-primary-foreground" style={{ background: 'hsl(var(--primary))' }}>
                Preview button
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground">Live-previewed across the dashboard as you pick.</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={save} disabled={saving}><Save className="mr-1 size-4" /> {saving ? 'Saving…' : 'Save branding'}</Button>
            <Button variant="ghost" onClick={reset}><RotateCcw className="mr-1 size-4" /> Reset to defaults</Button>
            <div className="flex-1" />
            <Palette className="size-4 text-muted-foreground" />
          </div>
        </div>
      </Section>
    </div>
  )
}

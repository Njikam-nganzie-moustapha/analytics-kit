import { Bot, Search, Link2, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { fetchBots } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { StatCard } from '@/components/kit/StatCard'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { LoadingState, ErrorState } from '@/components/shell/states'

const CAT_LABEL: Record<string, string> = {
  ai: 'AI / LLM crawlers', search: 'Search engines', seo: 'SEO tools', social: 'Social', other: 'Other crawlers',
}
const CAT_ICON: Record<string, ReactNode> = {
  ai: <Bot className="size-4" />, search: <Search className="size-4" />,
  seo: <Link2 className="size-4" />, social: <Share2 className="size-4" />, other: <Bot className="size-4" />,
}
const CAT_ORDER = ['ai', 'search', 'seo', 'social', 'other']

export function BotsView({ site }: { site: string }) {
  const { data, loading, error, reload } = useAsync(() => fetchBots(site), [site])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const bots = data ?? []

  const byCat = new Map<string, number>()
  for (const b of bots) byCat.set(b.category, (byCat.get(b.category) ?? 0) + b.hits)
  const aiHits = byCat.get('ai') ?? 0
  const total = bots.reduce((s, b) => s + b.hits, 0)

  const aiRows: BarRow[] = bots.filter(b => b.category === 'ai').sort((a, b) => b.hits - a.hits)
    .map(b => ({ label: b.bot, value: b.hits }))
  const otherRows: BarRow[] = bots.filter(b => b.category !== 'ai').sort((a, b) => b.hits - a.hits)
    .map(b => ({ label: b.bot, value: b.hits, hint: CAT_LABEL[b.category] }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="AI crawler hits" value={aiHits.toLocaleString()} icon={<Bot className="size-4" />}
          sub="GPTBot, ClaudeBot, Perplexity…" />
        {CAT_ORDER.filter(c => c !== 'ai').map(c => (
          <StatCard key={c} label={CAT_LABEL[c]} value={(byCat.get(c) ?? 0).toLocaleString()} icon={CAT_ICON[c]} />
        ))}
      </div>

      <Section title="AI / LLM crawlers" desc="Bots from AI providers indexing your site (captured server-side — they don't run JS)">
        <BarRows rows={aiRows} unit="" emptyLabel="No AI crawler hits yet — they appear once the server-side beacon sees GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider, etc." />
      </Section>

      <Section title="Other crawlers" desc="Search engines, SEO tools and social scrapers">
        <BarRows rows={otherRows} unit="" emptyLabel="No other crawler traffic recorded." />
      </Section>

      {total === 0 && (
        <p className="text-center text-[12px] text-muted-foreground">
          Crawler detection needs the server-side beacon enabled on the origin (see backend integration doc).
        </p>
      )}
    </div>
  )
}

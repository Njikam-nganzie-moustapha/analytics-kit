import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Plain-language glossary: what each metric is and what "good" looks like.
export const METRIC_HELP: Record<string, string> = {
  health: 'A 0–100 score blending Core Web Vitals, error rate and load speed. 80+ is healthy, under 50 is critical.',
  sessions: 'A visit. One person can have several sessions over time.',
  visitors: 'Distinct people (by anonymous ID). Always ≤ sessions.',
  errorRate: 'Share of sessions where a JavaScript or network error happened. Lower is better; under 1% is good.',
  conversions: 'Valuable actions: phone/email link clicks and custom conversion events (e.g. form submit).',
  conversionRate: 'Conversions ÷ sessions. 2%+ is generally healthy, but it depends on your goal.',
  channel: 'How visitors arrived: Direct, Organic search, Social, Referral, or AI assistants.',
  utm: 'Tags (utm_source/medium/campaign) you add to links so you can attribute traffic to specific campaigns.',
  p75: '75th-percentile page load time — 3 in 4 loads were faster than this. Reflects the typical slow experience.',
  lcp: 'Largest Contentful Paint — when the main content appears. Good ≤ 2.5s.',
  cls: 'Cumulative Layout Shift — how much the page jumps while loading. Good ≤ 0.1.',
  inp: 'Interaction to Next Paint — responsiveness to clicks/taps. Good ≤ 200ms.',
  ttfb: 'Time To First Byte — server response speed. Good ≤ 0.8s.',
  bounce: 'Sessions that left without meaningful interaction.',
  pageviews: 'Total page views (sum of unique URLs visited across all sessions). Counts navigations, not just landing.',
  bounceRate: 'Percentage of sessions where only one page was viewed before leaving. Lower is better for content sites.',
  avgDuration: 'Average session duration. Longer usually means higher engagement.',
}

export function InfoTip({ help, label }: { help: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/60 hover:text-foreground" aria-label={label ? `What is ${label}?` : 'More info'}>
          <HelpCircle className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-[12px] leading-relaxed">{help}</TooltipContent>
    </Tooltip>
  )
}

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Share2, Globe, MonitorSmartphone, MousePointerClick,
  Film, Filter, FileText, Gauge, Bug, Tag, Map as MapIcon, Target, Clock, Bell, MessageSquare,
  Search, Zap, Palette, Bot,
} from 'lucide-react'

export type View =
  | 'overview'
  | 'traffic' | 'geo' | 'devices' | 'bots'
  | 'behavior' | 'sessions' | 'funnels' | 'pages'
  | 'performance' | 'seo' | 'pagespeed'
  | 'errors' | 'releases' | 'sourcemaps'
  | 'conversions'
  | 'cron' | 'alerts'
  | 'feedback'
  | 'branding'

export interface NavItem { id: View; label: string; icon: LucideIcon }
export interface NavGroup { label: string | null; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: null, items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
  { label: 'Audience', items: [
    { id: 'traffic', label: 'Traffic sources', icon: Share2 },
    { id: 'geo', label: 'Geography', icon: Globe },
    { id: 'devices', label: 'Devices', icon: MonitorSmartphone },
    { id: 'bots', label: 'AI crawlers', icon: Bot },
  ] },
  { label: 'Behavior', items: [
    { id: 'behavior', label: 'Heatmap & Zones', icon: MousePointerClick },
    { id: 'sessions', label: 'Sessions', icon: Film },
    { id: 'pages', label: 'Pages', icon: FileText },
    { id: 'funnels', label: 'Funnels', icon: Filter },
  ] },
  { label: 'Performance', items: [
    { id: 'performance', label: 'Performance', icon: Gauge },
    { id: 'pagespeed', label: 'PageSpeed', icon: Zap },
  ] },
  { label: 'SEO', items: [
    { id: 'seo', label: 'SEO audit', icon: Search },
  ] },
  { label: 'Errors', items: [
    { id: 'errors', label: 'Errors', icon: Bug },
    { id: 'releases', label: 'Releases', icon: Tag },
    { id: 'sourcemaps', label: 'Source maps', icon: MapIcon },
  ] },
  { label: 'Conversions', items: [
    { id: 'conversions', label: 'Conversions', icon: Target },
  ] },
  { label: 'Monitoring', items: [
    { id: 'cron', label: 'Cron', icon: Clock },
    { id: 'alerts', label: 'Alerts', icon: Bell },
  ] },
  { label: null, items: [{ id: 'feedback', label: 'Feedback', icon: MessageSquare }] },
  { label: 'Settings', items: [
    { id: 'branding', label: 'Branding', icon: Palette },
  ] },
]

export const ALL_ITEMS: NavItem[] = NAV.flatMap(g => g.items)
export function viewLabel(v: View): string {
  return ALL_ITEMS.find(i => i.id === v)?.label ?? v
}

// Tiny dependency-free User-Agent classifier. Good enough for audience
// breakdowns (device / browser / OS) without pulling in ua-parser-js.

export interface UAInfo {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot'
  browser: string
  os: string
}

export function parseUA(ua: string | undefined): UAInfo {
  const s = ua ?? ''
  if (!s) return { deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' }

  if (/bot|crawler|spider|crawling|gptbot|claudebot|perplexitybot|headless|bytespider|ccbot/i.test(s)) {
    return { deviceType: 'bot', browser: 'Bot', os: '—' }
  }

  const isTablet = /ipad|tablet|playbook|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))
  const isMobile = /mobi|iphone|ipod|windows phone|blackberry|bb10|opera mini/i.test(s) || (/android/i.test(s) && /mobile/i.test(s))
  const deviceType: UAInfo['deviceType'] = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

  let os = 'Other'
  if (/windows nt/i.test(s)) os = 'Windows'
  else if (/iphone|ipad|ipod/i.test(s)) os = 'iOS'
  else if (/mac os x|macintosh/i.test(s)) os = 'macOS'
  else if (/android/i.test(s)) os = 'Android'
  else if (/cros/i.test(s)) os = 'ChromeOS'
  else if (/linux/i.test(s)) os = 'Linux'

  let browser = 'Other'
  if (/edg(e|a|ios)?\//i.test(s)) browser = 'Edge'
  else if (/opr\/|opera/i.test(s)) browser = 'Opera'
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/firefox|fxios/i.test(s)) browser = 'Firefox'
  else if (/chrome|crios|chromium/i.test(s)) browser = 'Chrome'
  else if (/safari/i.test(s)) browser = 'Safari'

  return { deviceType, browser, os }
}

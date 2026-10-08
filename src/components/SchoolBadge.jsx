import { getSchoolColors, contrastRatio, readableTextOn } from '../lib/schoolColors'

function getMonogram(name) {
  if (!name) return '?'
  const tokens = name.replace(/University|College|of|the/gi, '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase()
  return tokens.slice(0, 3).map(t => t[0]).join('').toUpperCase()
}

export default function SchoolBadge({ schoolName, size = 'md' }) {
  const colors = getSchoolColors(schoolName)
  const dims = size === 'sm' ? { w: 28, fs: 10 } : size === 'lg' ? { w: 48, fs: 16 } : { w: 36, fs: 12 }
  // School's second color when it's readable on the first, else black/white.
  const textColor = colors.secondary && contrastRatio(colors.secondary, colors.primary) >= 4.5
    ? colors.secondary
    : readableTextOn(colors.primary)
  return (
    <div style={{
      width: `${dims.w}px`, height: `${dims.w}px`,
      background: colors.primary,
      color: textColor, borderRadius: '6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 500, fontSize: `${dims.fs}px`,
      flexShrink: 0, border: `0.5px solid ${colors.primary}88`
    }}>{getMonogram(schoolName)}</div>
  )
}
import { useState } from 'react'
import SchoolBadge from './SchoolBadge'
import { getSchoolColors, isLightColor, readableTextOn } from '../lib/schoolColors'

export default function SchoolResultCard({ school, onAddToPipeline, onViewSchool, isInPipeline }) {
  const [isHovered, setIsHovered] = useState(false)
  const colors = getSchoolColors(school.name)

  const accent = isLightColor(colors.primary) ? colors.secondary : colors.primary
  const buttonBg = colors.secondary && colors.secondary !== '#FFFFFF' ? colors.secondary : accent
  const coachCount = school.coach_count ?? school.coaches_count ?? 0
  const fitColor = school.fitScore >= 90 ? '#10b981' : school.fitScore >= 75 ? 'var(--accent-gold-readable)' : 'var(--text-tertiary)'

  return (
    <div
      onClick={() => onViewSchool && onViewSchool(school)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: `linear-gradient(135deg, ${accent}1A 0%, ${accent}0A 50%, transparent 100%), var(--bg-card)`,
        borderLeft: `3px solid ${accent}`,
        borderTop: '0.5px solid var(--border-default)',
        borderRight: '0.5px solid var(--border-default)',
        borderBottom: '0.5px solid var(--border-default)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 150ms ease',
        transform: isHovered ? 'scale(1.005)' : 'scale(1)'
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <SchoolBadge schoolName={school.name} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, lineHeight: 1.3 }}>{school.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span className="text-blue-400" style={{ background: 'rgba(59, 130, 246, 0.15)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>{school.subdivision || 'D1'}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{school.conference || ''}</span>
          </div>
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: `1.5px solid ${fitColor}`, color: fitColor, fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{school.fitScore || ''}</div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{school.city && school.state && `${school.city}, ${school.state}`}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{coachCount > 0 ? `${coachCount} football coaches` : 'Use the program site or questionnaire'}</span>
        {coachCount > 0 ? (
          <span className="text-emerald-500" style={{ background: 'rgba(16, 185, 129, 0.1)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>✓ Coaches available</span>
        ) : (
          <span style={{ background: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-secondary)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>No coaches loaded yet</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <button onClick={(e) => { e.stopPropagation(); onViewSchool && onViewSchool(school) }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>View School →</button>
        {isInPipeline ? (
          <span className="text-emerald-500" style={{ fontSize: '12px', fontWeight: 500 }}>✓ Added</span>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onAddToPipeline && onAddToPipeline(school) }} style={{ background: buttonBg, color: readableTextOn(buttonBg), border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Add to Pipeline</button>
        )}
      </div>
    </div>
  )
}
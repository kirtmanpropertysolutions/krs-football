// Football domain definitions shared across profile, public profile,
// outreach templates and admin views.

export const POSITIONS = [
  { value: 'QB', label: 'Quarterback (QB)', group: 'qb' },
  { value: 'RB', label: 'Running Back (RB)', group: 'skill' },
  { value: 'FB', label: 'Fullback (FB)', group: 'skill' },
  { value: 'WR', label: 'Wide Receiver (WR)', group: 'skill' },
  { value: 'TE', label: 'Tight End (TE)', group: 'skill' },
  { value: 'OL', label: 'Offensive Line (OL)', group: 'line' },
  { value: 'DL', label: 'Defensive Line (DL)', group: 'defense' },
  { value: 'EDGE', label: 'Edge Rusher (EDGE)', group: 'defense' },
  { value: 'LB', label: 'Linebacker (LB)', group: 'defense' },
  { value: 'CB', label: 'Cornerback (CB)', group: 'defense' },
  { value: 'S', label: 'Safety (S)', group: 'defense' },
  { value: 'K', label: 'Kicker (K)', group: 'specialist' },
  { value: 'P', label: 'Punter (P)', group: 'specialist' },
  { value: 'LS', label: 'Long Snapper (LS)', group: 'specialist' },
  { value: 'ATH', label: 'Athlete (ATH)', group: 'all' },
]

export const positionLabel = (value) =>
  POSITIONS.find((p) => p.value === value)?.label || value || ''

export const positionGroup = (value) =>
  POSITIONS.find((p) => p.value === value)?.group || 'all'

// Combine / camp measurables. `step` drives the number input.
export const MEASURABLES = [
  { key: 'forty_yard', label: '40-Yard Dash', unit: 'sec', step: '0.01', placeholder: '4.65' },
  { key: 'shuttle_time', label: '5-10-5 Shuttle', unit: 'sec', step: '0.01', placeholder: '4.30' },
  { key: 'vertical_in', label: 'Vertical Jump', unit: 'in', step: '0.5', placeholder: '30' },
  { key: 'broad_jump_in', label: 'Broad Jump', unit: 'in', step: '1', placeholder: '108' },
  { key: 'bench_reps', label: 'Bench 185/225 Reps', unit: 'reps', step: '1', placeholder: '12' },
  { key: 'wingspan_in', label: 'Wingspan', unit: 'in', step: '0.25', placeholder: '76' },
]

// Season stats. `groups` controls which positions see the field first;
// every athlete can still fill in any stat.
export const STATS = [
  { key: 'games_played', label: 'Games Played', groups: ['all'] },
  { key: 'pass_yards', label: 'Passing Yards', groups: ['qb'] },
  { key: 'pass_tds', label: 'Passing TDs', groups: ['qb'] },
  { key: 'completion_pct', label: 'Completion %', groups: ['qb'], step: '0.1' },
  { key: 'interceptions_thrown', label: 'INTs Thrown', groups: ['qb'] },
  { key: 'rush_yards', label: 'Rushing Yards', groups: ['qb', 'skill'] },
  { key: 'rush_tds', label: 'Rushing TDs', groups: ['qb', 'skill'] },
  { key: 'receptions', label: 'Receptions', groups: ['skill'] },
  { key: 'rec_yards', label: 'Receiving Yards', groups: ['skill'] },
  { key: 'rec_tds', label: 'Receiving TDs', groups: ['skill'] },
  { key: 'pancakes', label: 'Pancake Blocks', groups: ['line'] },
  { key: 'sacks_allowed', label: 'Sacks Allowed', groups: ['line'] },
  { key: 'tackles', label: 'Total Tackles', groups: ['defense'] },
  { key: 'tackles_for_loss', label: 'Tackles for Loss', groups: ['defense'] },
  { key: 'sacks', label: 'Sacks', groups: ['defense'], step: '0.5' },
  { key: 'interceptions', label: 'Interceptions', groups: ['defense'] },
  { key: 'pass_breakups', label: 'Pass Breakups', groups: ['defense'] },
  { key: 'forced_fumbles', label: 'Forced Fumbles', groups: ['defense'] },
  { key: 'fg_made', label: 'Field Goals Made', groups: ['specialist'] },
  { key: 'fg_long', label: 'Long Field Goal', groups: ['specialist'] },
  { key: 'punt_avg', label: 'Punt Average', groups: ['specialist'], step: '0.1' },
]

export const statsForPosition = (position) => {
  const g = positionGroup(position)
  if (g === 'all') return STATS
  return STATS.filter((s) => s.groups.includes('all') || s.groups.includes(g))
}

export const formatHeight = (heightCm) => {
  if (!heightCm) return ''
  const inches = Math.round(heightCm / 2.54)
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

export const SUBDIVISIONS = ['FBS', 'FCS']

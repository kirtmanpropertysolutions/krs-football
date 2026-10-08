// Fake backend data for the theme audit. Built from the public school and
// coach files already in the repo, plus made-up player data. No real
// user data and no keys live here.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const uuid = (seed) => {
  const h = crypto.createHash('md5').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export const ORG_ID = 'b0000000-0000-0000-0000-000000000001'
export const ATHLETE_ID = uuid('athlete-user')
export const ADMIN_ID = uuid('admin-user')
const now = new Date().toISOString()
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString()
const daysAhead = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)

const PICK = ['University of Washington', 'University of Oregon', 'Stanford University', 'Boise State University',
  'Washington State University', 'Oregon State University', 'University of Montana', 'Montana State University',
  'Eastern Washington University', 'Yale University', 'University of Michigan', 'University of Notre Dame']

const allSchools = [
  ...read('scripts/data/football-fbs-2026.json'),
  ...read('scripts/data/football-fcs-2026.json'),
]
const scraped = Object.fromEntries(read('scripts/data/coaches/coaches.json').map((r) => [r.name, r]))

export const schools = allSchools
  .filter((s) => PICK.includes(s.name))
  .map((s) => ({
    id: uuid('school:' + s.name),
    division: 'D1',
    region: 'Pacific Northwest',
    created_at: now,
    ...s,
    program_email: scraped[s.name]?.program_email || null,
    recruiting_questionnaire_url: scraped[s.name]?.questionnaire_url || null,
  }))

export const coaches = schools.flatMap((s) =>
  (scraped[s.name]?.coaches || []).slice(0, 6).map((c) => ({
    id: uuid('coach:' + s.name + c.name),
    school_id: s.id,
    name: c.name,
    title: c.title,
    email: c.email || null,
    phone: null,
    visibility: 'shared',
    verified_at: now,
    is_recruiting_contact: !!c.is_recruiting_contact,
    source_url: c.source_url || null,
    created_at: now,
    created_by: null,
    org_id: null,
    flagged_as_stale: false,
  })),
)

const templates = [
  ['initial', 'Initial Contact', '{{grad_year}} {{position}} — {{athlete_name}}, {{high_school}}',
    "Hi Coach {{coach_name}},\n\nI'm {{athlete_name}}, a {{grad_year}} {{position}} at {{high_school}} in {{city}}, {{state}}. I'd like to be on your radar for {{school_name}}.\n\n{{measurables}}\nGPA {{gpa}}\n\nFilm: {{highlight_url}}\n\nHappy to send full games, my schedule, or transcripts whenever it's useful.\n\n{{athlete_name}}\n{{grad_year}} · {{high_school}} · {{position}}\n{{phone}}\n{{highlight_url}}"],
  ['follow_up', 'Follow-up Check-in', 'Checking in — {{athlete_name}}, {{grad_year}} {{position}}',
    'Hi Coach {{coach_name}},\n\nWanted to follow up on my earlier note.\n\n{{athlete_name}}\n{{highlight_url}}'],
  ['highlight_share', 'New Highlight Reel', 'New film — {{athlete_name}}', 'Hi Coach {{coach_name}},\n\n{{highlight_url}}'],
  ['campus_visit', 'Campus Visit Request', 'Campus visit — {{athlete_name}}', 'Hi Coach {{coach_name}},\n\nVisit {{school_name}}?'],
  ['thank_you_camp', 'Thank You After Camp', 'Thank you — {{athlete_name}}', 'Hi Coach {{coach_name}},\n\nThanks!'],
  ['schedule_update', 'Schedule Update', 'Upcoming games — {{athlete_name}}', 'Hi Coach {{coach_name}},\n\n{{upcoming_games}}'],
].map(([template_type, name, subject_template, body_template]) => ({
  id: uuid('tpl:' + template_type), org_id: null, template_type, name, subject_template, body_template,
}))

const athlete = {
  id: uuid('athlete-row'), user_id: ATHLETE_ID, org_id: ORG_ID, position: 'QB', secondary_position: 'S',
  class_year: 2027, gpa: 3.7, height_cm: 188, weight: 195, forty_yard: 4.71, shuttle_time: 4.3, vertical_in: 31,
  broad_jump_in: 112, bench_reps: 14, bio: 'Three-year starter. Team captain.', highlight_reel_url: 'https://www.hudl.com/video/test',
  hudl_url: 'https://www.hudl.com/profile/test', onboarding_complete: true, high_school: 'Mercer Island High School',
  city: 'Mercer Island', state: 'WA', jersey_number: 7, club_team: 'Seattle 7v7', phone: '206-555-0100',
  pass_yards: 2410, pass_tds: 24, completion_pct: 64.2, interceptions_thrown: 6, rush_yards: 380, rush_tds: 5,
  instagram_url: 'https://instagram.com/test', twitter_url: 'https://x.com/test', created_at: now, updated_at: now,
}

const pipelines = schools.slice(0, 6).map((s, i) => ({
  id: uuid('pipe:' + i), athlete_id: ATHLETE_ID, org_id: ORG_ID, school: s.name, school_id: s.id,
  coach_name: null, coach_email: null, status: 'active', notes: i === 0 ? 'Talked at camp' : null,
  stage: ['interested', 'contacted', 'visiting', 'offer', 'committed', 'interested'][i],
  created_at: daysAgo(20 - i), updated_at: daysAgo(i), last_activity_at: daysAgo(i), stage_updated_at: daysAgo(i),
}))

const outreach = coaches.filter((c) => c.email).slice(0, 4).map((c, i) => ({
  id: uuid('out:' + i), athlete_id: ATHLETE_ID, org_id: ORG_ID, coach_id: c.id, coach_name: c.name,
  school_id: c.school_id, school: schools.find((s) => s.id === c.school_id)?.name, email: c.email,
  subject: 'Initial contact', body: 'Hi Coach', status: 'sent', template_type: 'initial',
  sent_at: daysAgo(i + 1), created_at: daysAgo(i + 1), coach_replied: i === 0, coach_reply_status: i === 0 ? 'interested' : null,
  coaches: { name: c.name }, schools: { name: schools.find((s) => s.id === c.school_id)?.name },
}))

const highlights = [
  { id: uuid('hl1'), athlete_id: ATHLETE_ID, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Junior season highlights',
    recorded_date: daysAhead(-60), source: 'youtube', thumbnail_url: null, is_primary: true, tags: ['game'], view_count: 12, created_at: now, updated_at: now },
  { id: uuid('hl2'), athlete_id: ATHLETE_ID, url: 'https://www.hudl.com/video/abc', title: 'Camp reps',
    recorded_date: daysAhead(-30), source: 'hudl', thumbnail_url: null, is_primary: false, tags: ['camp'], view_count: 3, created_at: now, updated_at: now },
]

const camps = schools.slice(0, 4).map((s, i) => ({
  id: uuid('camp:' + i), org_id: ORG_ID, school_id: s.id, school_name: s.name, name: `${s.short_name} Prospect Camp`,
  start_date: daysAhead(10 + i * 7), end_date: daysAhead(10 + i * 7), location: `${s.city}, ${s.state}`, cost: 75,
  registration_url: 'https://example.com/register', description: 'One-day prospect camp.', featured: i === 0,
  created_by: ADMIN_ID, created_at: now, updated_at: now,
}))

const profiles = {
  athlete: { id: ATHLETE_ID, org_id: ORG_ID, email: 'player@example.com', full_name: 'Test Player', role: 'athlete', onboarding_complete: true, created_at: now, updated_at: now },
  admin: { id: ADMIN_ID, org_id: ORG_ID, email: 'coach@example.com', full_name: 'Test Coach', role: 'admin', onboarding_complete: true, created_at: now, updated_at: now },
}

export function tablesFor(role, mode) {
  const me = { ...profiles[role], color_mode: mode }
  return {
    profiles: role === 'admin' ? [me, { ...profiles.athlete, color_mode: mode }] : [me],
    org_members: [{ id: uuid('m:' + role), org_id: ORG_ID, user_id: me.id, role, created_at: now }],
    organizations: [{ id: ORG_ID, name: 'Mercer Island High School Football', short_name: 'Mercer Island', slug: 'mercer-island',
      logo_url: null, primary_color: '#B03056', secondary_color: '#fbbf24', active: true, created_at: now, updated_at: now,
      theme_primary: '#B03056', theme_secondary: '#fbbf24', theme_neutral_dark: '#0a0e1a' }],
    athletes: [athlete],
    schools,
    coaches,
    outreach_templates: templates,
    pipelines,
    outreach,
    highlights,
    highlight_videos: [
      { id: uuid('hv1'), athlete_id: ATHLETE_ID, title: 'Game 3 TD', status: 'ready', duration: 12, start_time: 0, end_time: 12, reel_order: 1, created_at: now, updated_at: now },
      { id: uuid('hv2'), athlete_id: ATHLETE_ID, title: 'Uploading clip', status: 'processing', duration: null, reel_order: 2, created_at: now, updated_at: now },
    ],
    announcements: [
      { id: uuid('a1'), org_id: ORG_ID, title: 'Camp sign-ups open', body: 'Register by Friday.', created_by: ADMIN_ID, created_at: daysAgo(1), audience: 'all', priority: 'high' },
      { id: uuid('a2'), org_id: ORG_ID, title: 'Film review Tuesday', body: 'Bring your Hudl login.', created_by: ADMIN_ID, created_at: daysAgo(3), audience: 'all', priority: 'normal' },
    ],
    id_camps: camps,
    scheduled_camps: camps.slice(0, 2).map((c, i) => ({ id: uuid('sc:' + i), athlete_id: ATHLETE_ID, id_camp_id: c.id, camp_date: c.start_date,
      school_name: c.school_name, cost: 75, travel_cost: 200, lodging_cost: 150, food_cost: 40, gear_cost: 0, misc_cost: 0,
      registration_url: c.registration_url, notes: null, created_at: now, updated_at: now })),
    org_nil_deals: [
      { id: uuid('nil1'), org_id: ORG_ID, created_by: ADMIN_ID, brand: 'Island Pizza', logo_abbrev: 'IP', logo_color: '#1F2937', category: 'Food',
        deal_type: 'appearance', value: 100, payout_display: '$100', description: 'Signing event.', requirements: 'One post.',
        expiration_date: daysAhead(30), applies_to: 'all', grad_years: [2027], status: 'active', featured: true, created_at: now, updated_at: now },
      { id: uuid('nil2'), org_id: ORG_ID, created_by: ADMIN_ID, brand: 'Lakeside Gear', logo_abbrev: 'LG', logo_color: '#B03056', category: 'Apparel',
        deal_type: 'product', value: 50, payout_display: 'Free cleats', description: 'Gear deal.', requirements: 'Wear in a game.',
        expiration_date: daysAhead(60), applies_to: 'all', grad_years: [2026, 2027], status: 'active', featured: false, created_at: now, updated_at: now },
    ],
    invite_codes: [
      { id: uuid('ic1'), org_id: ORG_ID, code: 'TEST-PLAYER-0001', label: 'Players 2027', max_uses: 50, uses: 3, active: true, expires_at: null, created_at: now, role: 'athlete' },
      { id: uuid('ic2'), org_id: ORG_ID, code: 'TEST-COACH-0001', label: 'Staff', max_uses: 5, uses: 1, active: true, expires_at: null, created_at: now, role: 'admin' },
      { id: uuid('ic3'), org_id: ORG_ID, code: 'TEST-OLD-0001', label: 'Expired', max_uses: 10, uses: 10, active: false, expires_at: daysAgo(5), created_at: now, role: 'athlete' },
    ],
    milestones: [],
    athlete_milestones: [{ id: uuid('am1'), user_id: ATHLETE_ID, milestone_id: 'first_email', org_id: ORG_ID, earned_at: daysAgo(2) }],
    school_fit_quiz_responses: [{ id: uuid('q1'), user_id: ATHLETE_ID, school_size: 'medium', distance_from_home: 'regional',
      academic_priority: 'high', division_target: 'FCS', playing_time: 'early', cost_sensitivity: 'medium', campus_culture: 'balanced',
      coach_relationship_priority: 'high', program_prestige: 'medium', support_services_priority: 'medium', completed_at: daysAgo(10), updated_at: daysAgo(10) }],
    recruiting_activity: [
      { id: uuid('ra1'), athlete_id: ATHLETE_ID, activity_type: 'email_sent', activity_data: { school: schools[0].name }, created_at: daysAgo(1) },
      { id: uuid('ra2'), athlete_id: ATHLETE_ID, activity_type: 'school_added', activity_data: { school: schools[1].name }, created_at: daysAgo(2) },
    ],
    school_notes: [],
    content_library: [],
  }
}

export const rpcs = {
  get_public_athlete_profile: () => [{ ...athlete, full_name: 'Test Player', email: 'player@example.com' }],
  get_public_athlete_primary_highlight: () => [highlights[0]],
  get_public_athlete_highlights: () => highlights,
}

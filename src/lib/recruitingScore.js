import { supabase } from './supabase'

export async function calculateRecruitingScore(athleteId) {
  try {
    // Profile completeness — 40 pts. Name lives on `profiles`; every
    // football field lives on `athletes` (keyed by user_id).
    const [{ data: profile }, { data: athlete }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', athleteId).maybeSingle(),
      supabase.from('athletes').select('*').eq('user_id', athleteId).maybeSingle(),
    ])

    // Check if athlete has highlights in highlights table
    const { count: hlCount } = await supabase
      .from('highlights')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)

    const has = (v) => v !== null && v !== undefined && v !== ''
    const a = athlete || {}
    const profileChecks = [
      has(profile?.full_name),
      has(a.class_year),
      has(a.position),
      has(a.gpa),
      has(a.height_cm) && has(a.weight),
      has(a.forty_yard),
      // Film counts if Hudl/YouTube/reel is linked OR highlights are uploaded
      has(a.hudl_url) || has(a.youtube_highlights_url) || has(a.highlight_reel_url) || (hlCount || 0) > 0,
      has(a.bio),
      has(a.high_school),
      has(a.profile_photo_url),
    ]
    const filled = profileChecks.filter(Boolean).length
    const profileScore = Math.round((filled / profileChecks.length) * 40)

    // Pipeline depth — 20 pts (5+ schools = full)
    const { count: pipelineCount } = await supabase
      .from('pipelines')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
    const pipelineScore = Math.min(Math.round(((pipelineCount || 0) / 5) * 20), 20)

    // Outreach activity — 20 pts (3+ emails in 30d = full)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: emailCount } = await supabase
      .from('outreach')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('sent_at', thirtyDaysAgo)
    const outreachScore = Math.min(Math.round(((emailCount || 0) / 3) * 20), 20)

    // Recent engagement — 20 pts (activity on 5+ days in last 7 = full)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('recruiting_activity')
      .select('created_at')
      .eq('athlete_id', athleteId)
      .gte('created_at', sevenDaysAgo)
    const uniqueDays = new Set((recent || []).map(r => r.created_at.split('T')[0])).size
    const engagementScore = Math.min(Math.round((uniqueDays / 5) * 20), 20)

    return {
      score: profileScore + pipelineScore + outreachScore + engagementScore,
      breakdown: {
        profile: { score: profileScore, max: 40 },
        pipeline: { score: pipelineScore, max: 20 },
        outreach: { score: outreachScore, max: 20 },
        engagement: { score: engagementScore, max: 20 }
      }
    }
  } catch (error) {
    console.error('Error calculating recruiting score:', error)
    return {
      score: 0,
      breakdown: {
        profile: { score: 0, max: 40 },
        pipeline: { score: 0, max: 20 },
        outreach: { score: 0, max: 20 },
        engagement: { score: 0, max: 20 }
      }
    }
  }
}
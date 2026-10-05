// Unified outreach recipient resolver.
//
// Every send/copy/preview path in the app funnels through resolveRecipient
// so there's exactly ONE place that decides "who is this email going to?"
// and "what label do we show the athlete so they know?". Before this lib,
// each entry point (Pipeline cards, Coach Finder, School modal, Dashboard
// CTAs) was independently extracting email via `coach?.email ||
// school?.program_email` — and the Pipeline path was silently dropping
// `program_email` because pipelineWithStats didn't select that column.
// One bug per duplicate site; this collapses all of them.
//
// Priority:
//   1. Coach email — a named coach with a verified email is always best.
//   2. Program email — the recruiting inbox for the football program
//      (e.g. footballrecruiting@school.edu). Most schools without an
//      individual coach contact have one of these.
//   3. None — block the send. Athlete sees a clear "No verified email"
//      state plus a hint pointing at the football staff directory
//      (football_roster_url, else athletics_website) so they can grab
//      the recruiting coordinator's address themselves.
//
// Returned shape is intentionally flat so callers can destructure without
// nested optional chaining at every reference site.

/**
 * @typedef {Object} ResolvedRecipient
 * @property {string|null} email          The address to send to, or null
 *                                        if nothing usable exists.
 * @property {'coach'|'program'|'none'} sourceType
 *                                        Which fallback rung produced it.
 * @property {string} label               UI chip: "Coach email" /
 *                                        "Program email" / "No verified
 *                                        email".
 * @property {string|null} displayName    Human-readable "who": coach name
 *                                        (e.g. "Damon Nahas") or program
 *                                        label (e.g. "UNC Recruiting").
 *                                        null when there's no recipient.
 * @property {boolean} canSend            Convenience boolean — false when
 *                                        sourceType==='none'. Use this in
 *                                        button disabled props.
 * @property {string|null} staffDirectoryUrl
 *                                        Football staff directory link
 *                                        (football_roster_url, else
 *                                        athletics_website). Set only when
 *                                        sourceType==='none'.
 * @property {string|null} hint           Athlete-facing next step when
 *                                        there's nothing to send to.
 */

/**
 * Resolve the outreach recipient given a (possibly-null) coach and school.
 *
 * @param {object|null} coach   The currently-selected coach, or null.
 *                              Expected shape: { name?, full_name?, email? }.
 *                              The synthetic "program coach" object that
 *                              some entry points construct ALSO works here
 *                              because it has both .name and .email — but
 *                              passing the raw school as `school` arg is
 *                              the preferred path (lets the resolver pick
 *                              the right label).
 * @param {object|null} school  The currently-selected school, or null.
 *                              Expected shape: { name?, program_email?,
 *                              football_roster_url?, athletics_website? }.
 * @returns {ResolvedRecipient}
 */
export function resolveRecipient(coach, school) {
  // 1. Real coach with a real email — best case.
  if (coach && coach.email && !coach.isProgramEmail) {
    const name = coach.name || coach.full_name || 'Coach'
    return {
      email: coach.email,
      sourceType: 'coach',
      label: 'Coach email',
      displayName: name,
      canSend: true,
      staffDirectoryUrl: null,
      hint: null,
    }
  }

  // 2. School-level program email — coach is null OR coach is the
  //    synthetic "Program" placeholder we sometimes construct on
  //    entry-point hops. Either way, prefer the school's program_email
  //    as the canonical source so the resolver always returns the same
  //    answer regardless of how we got here.
  if (school && school.program_email) {
    const schoolName = school.name || school.school || 'Program'
    return {
      email: school.program_email,
      sourceType: 'program',
      label: 'Program email',
      displayName: `${schoolName} Football Recruiting`,
      canSend: true,
      staffDirectoryUrl: null,
      hint: null,
    }
  }

  // 3. Nothing usable — block the send. The UI surfaces this to the
  //    athlete so they know to use Copy / paste manually, and the
  //    button-level resolver.canSend check stops accidental sends to
  //    an undefined address. Football coach data isn't loaded for most
  //    schools yet, so point them at the staff directory.
  const staffDirectoryUrl = school?.football_roster_url || school?.athletics_website || null
  return {
    email: null,
    sourceType: 'none',
    label: 'No verified email',
    displayName: null,
    canSend: false,
    staffDirectoryUrl,
    hint: staffDirectoryUrl
      ? "No coaches loaded for this school yet. Grab the recruiting coordinator's email from the football staff directory, then Copy + paste."
      : "No coaches loaded for this school yet. Find the recruiting coordinator's email on the school's football staff directory, then Copy + paste.",
  }
}

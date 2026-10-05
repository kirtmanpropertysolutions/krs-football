-- 100_football_core.sql
-- Football conversion of the inherited KRS College Connect schema.
-- Applied after the inherited soccer migrations (see scripts/football/build-schema.py).

-- ─── 1. Columns production had but the migration history never recorded ───
ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_type text,
  ADD COLUMN IF NOT EXISTS coach_replied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_reply_status text,
  ADD COLUMN IF NOT EXISTS reply_received_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_outreach_coach ON public.outreach (coach_id);
CREATE INDEX IF NOT EXISTS idx_outreach_school ON public.outreach (school_id);

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

-- ─── 2. Schools: FBS / FCS ────────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS subdivision text CHECK (subdivision IS NULL OR subdivision IN ('FBS', 'FCS')),
  ADD COLUMN IF NOT EXISTS football_roster_url text;
CREATE INDEX IF NOT EXISTS idx_schools_subdivision ON public.schools (subdivision, conference);

-- ─── 3. Athletes: football profile ────────────────────────────────────────
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS secondary_position text,
  ADD COLUMN IF NOT EXISTS forty_yard numeric(4,2),
  ADD COLUMN IF NOT EXISTS shuttle_time numeric(4,2),
  ADD COLUMN IF NOT EXISTS vertical_in numeric(4,1),
  ADD COLUMN IF NOT EXISTS broad_jump_in integer,
  ADD COLUMN IF NOT EXISTS bench_reps integer,
  ADD COLUMN IF NOT EXISTS wingspan_in numeric(5,2),
  ADD COLUMN IF NOT EXISTS pass_yards integer,
  ADD COLUMN IF NOT EXISTS pass_tds integer,
  ADD COLUMN IF NOT EXISTS completion_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS interceptions_thrown integer,
  ADD COLUMN IF NOT EXISTS rush_yards integer,
  ADD COLUMN IF NOT EXISTS rush_tds integer,
  ADD COLUMN IF NOT EXISTS receptions integer,
  ADD COLUMN IF NOT EXISTS rec_yards integer,
  ADD COLUMN IF NOT EXISTS rec_tds integer,
  ADD COLUMN IF NOT EXISTS pancakes integer,
  ADD COLUMN IF NOT EXISTS sacks_allowed integer,
  ADD COLUMN IF NOT EXISTS tackles integer,
  ADD COLUMN IF NOT EXISTS tackles_for_loss numeric(5,1),
  ADD COLUMN IF NOT EXISTS sacks numeric(5,1),
  ADD COLUMN IF NOT EXISTS interceptions integer,
  ADD COLUMN IF NOT EXISTS pass_breakups integer,
  ADD COLUMN IF NOT EXISTS forced_fumbles integer,
  ADD COLUMN IF NOT EXISTS fg_made integer,
  ADD COLUMN IF NOT EXISTS fg_long integer,
  ADD COLUMN IF NOT EXISTS punt_avg numeric(4,1),
  ADD COLUMN IF NOT EXISTS recruiting_profile_url text;

-- Soccer-only athlete columns (goals, assists, dominant_foot, veo_link_url, ...)
-- are left in place unused rather than dropped.

-- ─── 4. School Fit Quiz answer sets ───────────────────────────────────────
-- The soccer answer columns are renamed aside and replaced with football ones.
ALTER TABLE public.school_fit_quiz_responses RENAME COLUMN academic_priority TO academic_priority_soccer;
ALTER TABLE public.school_fit_quiz_responses RENAME COLUMN division_target TO division_target_soccer;
ALTER TABLE public.school_fit_quiz_responses
  ADD COLUMN academic_priority text CHECK (academic_priority IN ('ivy_tier', 'strong_academic', 'balanced', 'football_first')),
  ADD COLUMN division_target text CHECK (division_target IN ('fbs_only', 'fcs_only', 'fbs_fcs'));

-- ─── 5. Organization theme (Mercer Island maroon & white) ─────────────────
UPDATE public.organizations
   SET theme_primary = '#B03056',
       theme_secondary = '#FFFFFF',
       theme_neutral_dark = '#0a0e1a',
       theme_logo_url = '/brand/logo.png'
 WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- ─── 6. Invite codes: role + full admin policies ──────────────────────────
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'athlete' CHECK (role IN ('athlete', 'admin'));

DROP POLICY IF EXISTS "Admins read org invite codes" ON public.invite_codes;
CREATE POLICY "Admins read org invite codes" ON public.invite_codes FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins update org invite codes" ON public.invite_codes;
CREATE POLICY "Admins update org invite codes" ON public.invite_codes FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Admins delete org invite codes" ON public.invite_codes;
CREATE POLICY "Admins delete org invite codes" ON public.invite_codes FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role = 'admin'));

-- ─── 7. Signup: join the program inside the database ──────────────────────
-- Replaces the soccer app's /api/admin/validate-invite serverless function,
-- so the app no longer needs the service-role key at runtime. The client
-- passes invite_code + full_name as signUp() metadata; this trigger consumes
-- the code atomically and creates the profile and membership in the same
-- transaction as the auth user. An invalid code aborts the signup.
CREATE UNIQUE INDEX IF NOT EXISTS org_members_org_user_uniq ON public.org_members (org_id, user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := nullif(trim(NEW.raw_user_meta_data->>'invite_code'), '');
  v_name text := nullif(trim(NEW.raw_user_meta_data->>'full_name'), '');
  v_invite invite_codes%ROWTYPE;
BEGIN
  IF v_code IS NULL THEN
    -- Accounts created from the dashboard: profile only, no program.
    INSERT INTO profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, v_name)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT * INTO v_invite
    FROM invite_codes
   WHERE upper(code) = upper(v_code)
     AND active = true
     FOR UPDATE;

  IF NOT FOUND
     OR (v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now())
     OR (v_invite.max_uses IS NOT NULL AND v_invite.uses >= v_invite.max_uses) THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0001';
  END IF;

  UPDATE invite_codes SET uses = uses + 1 WHERE id = v_invite.id;

  INSERT INTO org_members (org_id, user_id, role)
  VALUES (v_invite.org_id, NEW.id, v_invite.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO profiles (id, org_id, role, email, full_name)
  VALUES (NEW.id, v_invite.org_id, v_invite.role, NEW.email, v_name)
  ON CONFLICT (id) DO UPDATE
    SET org_id = EXCLUDED.org_id,
        role = EXCLUDED.role,
        email = EXCLUDED.email,
        full_name = coalesce(EXCLUDED.full_name, profiles.full_name);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 8. Milestone copy for football ───────────────────────────────────────
UPDATE public.milestones SET name = 'Camp Registered', description = 'Signed up for your first college camp or combine.'
 WHERE id = 'first_id_camp_registered';
UPDATE public.milestones SET name = 'Camp Competed', description = 'Showed up and competed in front of college coaches.', icon = 'Football'
 WHERE id = 'first_id_camp_attended';
UPDATE public.milestones SET description = 'Logged your first scholarship or preferred walk-on offer.'
 WHERE id = 'first_offer';
UPDATE public.milestones SET description = 'Added your first Hudl or highlight film link.'
 WHERE id = 'reel_linked';

-- ─── 9. Outreach templates in a football voice ───────────────────────────
-- {{measurables}} renders e.g. 6'2" · 205 lbs · 4.62 40 and drops when empty.
UPDATE public.outreach_templates
   SET subject_template = '{{grad_year}} {{position}} — {{athlete_name}}, {{high_school}}',
       body_template =
'Hi Coach {{coach_name}},

I''m {{athlete_name}}, a {{grad_year}} {{position}} at {{high_school}} in {{city}}, {{state}}. I''d like to be on your radar for {{school_name}}.

{{measurables}}
GPA {{gpa}}

Film: {{highlight_url}}

Happy to send full games, my schedule, or transcripts whenever it''s useful.

{{athlete_name}}
{{grad_year}} · {{high_school}} · {{position}}
{{phone}}
{{highlight_url}}'
 WHERE template_type = 'initial' AND org_id IS NULL;

UPDATE public.outreach_templates
   SET body_template = replace(replace(body_template, '{{club_team}}', '{{high_school}}'), 'ID camps, prospect days, or open practices', 'prospect camps, junior days, or game-day visits')
 WHERE org_id IS NULL AND template_type IN ('follow_up', 'highlight_share', 'campus_visit', 'thank_you_camp', 'schedule_update');

UPDATE public.outreach_templates
   SET body_template = replace(body_template, 'Happy to send updated film', 'Happy to send updated Hudl film')
 WHERE org_id IS NULL AND template_type = 'follow_up';

-- Admin (coaching staff) invite codes are created directly in the live
-- database, never committed here, because anyone holding one becomes an admin.

-- ─── 10. Read/manage policies production had but never recorded ──────────
-- Without these, RLS hides the program, the schools list and the admin roster.
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org AND user_id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org AND user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid), public.is_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid), public.is_org_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members read own organization" ON public.organizations;
CREATE POLICY "Members read own organization" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));
DROP POLICY IF EXISTS "Admins update own organization" ON public.organizations;
CREATE POLICY "Admins update own organization" ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));

DROP POLICY IF EXISTS "Authenticated read schools" ON public.schools;
CREATE POLICY "Authenticated read schools" ON public.schools FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins read org memberships" ON public.org_members;
CREATE POLICY "Admins read org memberships" ON public.org_members FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins read org profiles" ON public.profiles;
CREATE POLICY "Admins read org profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins read org athletes" ON public.athletes;
CREATE POLICY "Admins read org athletes" ON public.athletes FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins read org pipelines" ON public.pipelines;
CREATE POLICY "Admins read org pipelines" ON public.pipelines FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins manage org announcements" ON public.announcements;
CREATE POLICY "Admins manage org announcements" ON public.announcements FOR ALL TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins manage org content" ON public.content_library;
CREATE POLICY "Admins manage org content" ON public.content_library FOR ALL TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- Coaches seeded for the whole platform must be visibility = 'shared' to be readable.

-- ─── 11. Public (coach-facing) profile with football fields ──────────────
DROP FUNCTION IF EXISTS public.get_public_athlete_profile(uuid);
CREATE FUNCTION public.get_public_athlete_profile(p_profile_id uuid)
RETURNS TABLE (
  id uuid, full_name text, "position" text, secondary_position text, class_year integer,
  jersey_number integer, high_school text, club_team text, city text, state text, bio text,
  profile_photo_url text, height_cm integer, weight integer,
  forty_yard numeric, shuttle_time numeric, vertical_in numeric, broad_jump_in integer,
  bench_reps integer, wingspan_in numeric,
  games_played integer, pass_yards integer, pass_tds integer, completion_pct numeric,
  interceptions_thrown integer, rush_yards integer, rush_tds integer, receptions integer,
  rec_yards integer, rec_tds integer, pancakes integer, sacks_allowed integer, tackles integer,
  tackles_for_loss numeric, sacks numeric, interceptions integer, pass_breakups integer,
  forced_fumbles integer, fg_made integer, fg_long integer, punt_avg numeric,
  instagram_url text, twitter_url text, tiktok_url text, youtube_url text, hudl_url text,
  youtube_highlights_url text, highlight_reel_url text, recruiting_profile_url text,
  org_id uuid, org_name text, org_slug text, org_primary_color text, org_secondary_color text, org_logo_url text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.full_name, a.position, a.secondary_position, a.class_year,
         a.jersey_number, a.high_school, a.club_team, a.city, a.state, a.bio,
         a.profile_photo_url, a.height_cm, a.weight,
         a.forty_yard, a.shuttle_time, a.vertical_in, a.broad_jump_in, a.bench_reps, a.wingspan_in,
         a.games_played, a.pass_yards, a.pass_tds, a.completion_pct, a.interceptions_thrown,
         a.rush_yards, a.rush_tds, a.receptions, a.rec_yards, a.rec_tds, a.pancakes, a.sacks_allowed,
         a.tackles, a.tackles_for_loss, a.sacks, a.interceptions, a.pass_breakups, a.forced_fumbles,
         a.fg_made, a.fg_long, a.punt_avg,
         a.instagram_url, a.twitter_url, a.tiktok_url, a.youtube_url, a.hudl_url,
         a.youtube_highlights_url, a.highlight_reel_url, a.recruiting_profile_url,
         p.org_id, o.name, o.slug, o.theme_primary, o.theme_secondary, o.theme_logo_url
    FROM public.profiles p
    LEFT JOIN public.athletes a ON a.user_id = p.id
    LEFT JOIN public.organizations o ON o.id = p.org_id
   WHERE p.id = p_profile_id
     AND p.role = 'athlete';
$$;
REVOKE ALL ON FUNCTION public.get_public_athlete_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_athlete_profile(uuid) TO anon, authenticated;

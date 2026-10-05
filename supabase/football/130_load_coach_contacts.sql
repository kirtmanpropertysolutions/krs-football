-- 130_load_coach_contacts.sql
-- Loads scripts/data/coaches/coaches.json (scrape-coaches.mjs on GitHub Actions, then clean-coaches.py)
-- straight from the public GitHub repo into coaches + schools.
-- Re-runnable: replaces previously scraped rows (created_by IS NULL), keeps coaches
-- that players or admins added themselves.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

DO $$
DECLARE
  payload jsonb;
BEGIN
  SELECT content::jsonb INTO payload
    FROM extensions.http_get('https://raw.githubusercontent.com/kirtmanpropertysolutions/krs-football/main/scripts/data/coaches/coaches.json');

  IF payload IS NULL OR jsonb_typeof(payload) <> 'array' THEN
    RAISE EXCEPTION 'scraped.json not found or not an array';
  END IF;

  CREATE TEMP TABLE _scraped ON COMMIT DROP AS
  SELECT s.id AS school_id, e AS rec
    FROM jsonb_array_elements(payload) e
    JOIN public.schools s ON s.name = e->>'name';

  -- Questionnaire + program email + timestamp
  UPDATE public.schools sc
     SET recruiting_questionnaire_url = NULLIF(x.rec->>'questionnaire_url', ''),
         program_email = COALESCE(sc.program_email, NULLIF(x.rec->>'program_email', '')),
         coaches_checked_at = now()
    FROM _scraped x
   WHERE sc.id = x.school_id;

  -- Replace scraped coaches
  DELETE FROM public.coaches c
   USING _scraped x
   WHERE c.school_id = x.school_id AND c.created_by IS NULL;

  INSERT INTO public.coaches (school_id, name, title, email, phone, visibility, verified_at, is_recruiting_contact, source_url)
  SELECT DISTINCT ON (x.school_id, lower(trim(c->>'name')))
         x.school_id,
         trim(c->>'name'),
         NULLIF(trim(c->>'title'), ''),
         NULLIF(lower(trim(c->>'email')), ''),
         NULLIF(trim(c->>'phone'), ''),
         'shared',
         now(),
         COALESCE((c->>'is_recruiting_contact')::boolean, false),
         NULLIF(c->>'source_url', '')
    FROM _scraped x,
         jsonb_array_elements(COALESCE(x.rec->'coaches', '[]'::jsonb)) c
   WHERE NULLIF(trim(c->>'name'), '') IS NOT NULL
   ORDER BY x.school_id, lower(trim(c->>'name')), (c->>'email') IS NULL
  ON CONFLICT (school_id, name) DO UPDATE
     SET title = EXCLUDED.title,
         email = COALESCE(EXCLUDED.email, public.coaches.email),
         phone = COALESCE(EXCLUDED.phone, public.coaches.phone),
         is_recruiting_contact = EXCLUDED.is_recruiting_contact,
         source_url = EXCLUDED.source_url,
         verified_at = now();
END $$;

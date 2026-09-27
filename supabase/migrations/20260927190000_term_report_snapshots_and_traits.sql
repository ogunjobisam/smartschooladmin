-- Released term reports become snapshots, and each school sets its own traits.
--
-- 1. Snapshot at release. A released report used to be live: a mark corrected
--    afterwards changed what a parent saw, with nothing to say it had. Now the
--    release row holds the whole arm's report as it stood — totals, positions,
--    comments, ratings and the trait list — and families only ever see that.
--    Staff still see the live report, with the snapshot beside it, so the page
--    can list exactly what has moved since release. Releasing again (any update
--    to the release row) takes a fresh snapshot.
--
--    The snapshot is computed by the database in a trigger. Whatever a client
--    writes into it is discarded, so no one can hand families doctored numbers.
--
--    Families lose their direct read on term_report_comments and
--    term_report_ratings: those tables are live, and reading them would bypass
--    the snapshot. term_report() gives families their child's comments and
--    ratings from the snapshot instead.
--
-- 2. report_traits. The affective and psychomotor lists were fixed in the app.
--    A school can now keep its own; a school with none keeps the defaults.
--    Ratings refer to a trait by key, so renaming a trait keeps its ratings.
--
-- Safe to run twice: every policy is dropped before it is created, and every
-- other statement is IF NOT EXISTS, CREATE OR REPLACE or DROP ... IF EXISTS.

-- ---------------------------------------------------------------------------
-- Traits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_traits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('affective', 'psychomotor')),
  key text NOT NULL CHECK (key ~ '^[a-z0-9_]{1,60}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, domain, key)
);

CREATE INDEX IF NOT EXISTS idx_report_traits_school ON public.report_traits (school_id, domain, position);

ALTER TABLE public.report_traits ENABLE ROW LEVEL SECURITY;

-- Anyone signed in to the organisation reads them: teachers rate against them
-- and the report card prints them. Families get them from the snapshot.
DROP POLICY IF EXISTS "Members can view report traits" ON public.report_traits;
CREATE POLICY "Members can view report traits"
ON public.report_traits FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools sc
    WHERE sc.id = report_traits.school_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Academic managers can manage report traits" ON public.report_traits;
CREATE POLICY "Academic managers can manage report traits"
ON public.report_traits FOR ALL TO authenticated
USING (
  public.is_academic_manager(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools sc
    WHERE sc.id = report_traits.school_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  public.is_academic_manager(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools sc
    WHERE sc.id = report_traits.school_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- The computation, with no access check
-- ---------------------------------------------------------------------------
-- The whole arm's report: every pupil, their comments and ratings, and the
-- school's traits (NULL when the school uses the defaults). The arithmetic is
-- unchanged from 20260927180000. Never granted to anyone: term_report() and
-- the release trigger are the only callers, and each decides who sees what.
CREATE OR REPLACE FUNCTION public.term_report_compute(_class_id uuid, _period_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH lvl AS (
    SELECT c.school_id, coalesce(c.level_name, c.name) AS level_name
    FROM public.classes c WHERE c.id = _class_id
  ),
  level_classes AS (
    SELECT c.id FROM public.classes c, lvl
    WHERE c.school_id = lvl.school_id AND coalesce(c.level_name, c.name) = lvl.level_name
  ),
  pupils AS (
    SELECT DISTINCT e.student_id, e.class_id
    FROM public.enrolments e
    JOIN level_classes lc ON lc.id = e.class_id
    JOIN public.students s ON s.id = e.student_id
    WHERE e.academic_period_id = _period_id AND s.status = 'active'
  ),
  components AS (
    SELECT x.id AS exam_id, x.class_id, x.name, x.term_weight, x.max_score, x.exam_date, x.created_at
    FROM public.exams x
    JOIN level_classes lc ON lc.id = x.class_id
    WHERE x.academic_period_id = _period_id AND x.term_weight IS NOT NULL
  ),
  held AS (
    SELECT DISTINCT sc.exam_id, sc.subject_id
    FROM public.student_scores sc
    JOIN components c ON c.exam_id = sc.exam_id
    WHERE sc.score IS NOT NULL
  ),
  cells AS (
    SELECT p.student_id, p.class_id, h.subject_id, c.exam_id, c.term_weight,
           coalesce(es.max_score, c.max_score)::numeric AS max_score,
           sc.score
    FROM pupils p
    JOIN components c ON c.class_id = p.class_id
    JOIN held h ON h.exam_id = c.exam_id
    LEFT JOIN public.exam_subjects es ON es.exam_id = c.exam_id AND es.subject_id = h.subject_id
    LEFT JOIN public.student_scores sc
      ON sc.exam_id = c.exam_id AND sc.student_id = p.student_id AND sc.subject_id = h.subject_id
  ),
  subject_totals AS (
    SELECT student_id, class_id, subject_id,
           sum(coalesce(score, 0) / nullif(max_score, 0) * term_weight) AS total,
           sum(term_weight) AS out_of,
           jsonb_object_agg(exam_id, score) FILTER (WHERE score IS NOT NULL) AS scores
    FROM cells
    GROUP BY student_id, class_id, subject_id
    HAVING count(score) > 0
  ),
  subject_ranked AS (
    SELECT *,
           round(total / out_of * 100, 2) AS percent,
           rank() OVER (PARTITION BY class_id, subject_id ORDER BY round(total / out_of * 100, 2) DESC) AS position,
           avg(total / out_of * 100) OVER (PARTITION BY class_id, subject_id) AS class_average
    FROM subject_totals
  ),
  student_totals AS (
    SELECT student_id, class_id,
           count(*) AS subjects_taken,
           sum(total) AS total,
           sum(out_of) AS out_of,
           round(avg(total / out_of * 100), 2) AS average
    FROM subject_ranked
    GROUP BY student_id, class_id
  ),
  student_ranked AS (
    SELECT *,
           rank() OVER (PARTITION BY class_id ORDER BY average DESC) AS arm_position,
           rank() OVER (ORDER BY average DESC) AS level_position
    FROM student_totals
  ),
  arm_pupils AS (
    SELECT student_id FROM pupils WHERE class_id = _class_id
  )
  SELECT jsonb_build_object(
    'components', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'exam_id', c.exam_id, 'name', c.name,
               'term_weight', c.term_weight, 'max_score', c.max_score)
             ORDER BY c.exam_date NULLS LAST, c.created_at)
      FROM components c WHERE c.class_id = _class_id), '[]'::jsonb),
    'arm_size', (SELECT count(*) FROM student_ranked WHERE class_id = _class_id),
    'arm_average', (SELECT round(avg(average), 2) FROM student_ranked WHERE class_id = _class_id),
    'level_size', (SELECT count(*) FROM student_ranked),
    'level_average', (SELECT round(avg(average), 2) FROM student_ranked),
    'students', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'student_id', st.student_id,
               'subjects_taken', st.subjects_taken,
               'total', round(st.total, 2),
               'out_of', st.out_of,
               'average', st.average,
               'arm_position', st.arm_position,
               'level_position', st.level_position)
             ORDER BY st.arm_position, st.student_id)
      FROM student_ranked st WHERE st.class_id = _class_id), '[]'::jsonb),
    'subjects', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'student_id', sr.student_id,
               'subject_id', sr.subject_id,
               'total', round(sr.total, 2),
               'out_of', sr.out_of,
               'percent', sr.percent,
               'position', sr.position,
               'class_average', round(sr.class_average, 2),
               'scores', coalesce(sr.scores, '{}'::jsonb))
             ORDER BY sr.student_id, sr.subject_id)
      FROM subject_ranked sr WHERE sr.class_id = _class_id), '[]'::jsonb),
    'comments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('student_id', tc.student_id, 'kind', tc.kind, 'body', tc.body)
             ORDER BY tc.student_id, tc.kind)
      FROM public.term_report_comments tc JOIN arm_pupils ap ON ap.student_id = tc.student_id
      WHERE tc.academic_period_id = _period_id), '[]'::jsonb),
    'ratings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('student_id', tr.student_id, 'domain', tr.domain, 'trait', tr.trait, 'rating', tr.rating)
             ORDER BY tr.student_id, tr.domain, tr.trait)
      FROM public.term_report_ratings tr JOIN arm_pupils ap ON ap.student_id = tr.student_id
      WHERE tr.academic_period_id = _period_id), '[]'::jsonb),
    'traits', (
      SELECT jsonb_agg(jsonb_build_object('domain', t.domain, 'key', t.key, 'label', t.label)
             ORDER BY t.domain, t.position, t.label)
      FROM public.report_traits t, lvl WHERE t.school_id = lvl.school_id)
  )
$$;

REVOKE ALL ON FUNCTION public.term_report_compute(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.term_report_releases ADD COLUMN IF NOT EXISTS snapshot jsonb;

COMMENT ON COLUMN public.term_report_releases.snapshot IS
  'The arm''s term report as released. Computed by the database on every insert '
  'or update — anything a client writes here is replaced. Families see only this.';

-- SECURITY DEFINER because term_report_compute is granted to no one; this is
-- one of its two callers. Who may release is still the table's own policy.
CREATE OR REPLACE FUNCTION public.snapshot_term_report()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.snapshot := public.term_report_compute(NEW.class_id, NEW.academic_period_id);
  NEW.released_at := now();
  NEW.released_by := auth.uid();
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.snapshot_term_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS term_report_releases_snapshot ON public.term_report_releases;
CREATE TRIGGER term_report_releases_snapshot
  BEFORE INSERT OR UPDATE ON public.term_report_releases
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_term_report();

-- Any release made before this migration gets its snapshot now, from the data
-- as it stands, rather than leaving families with nothing.
UPDATE public.term_report_releases SET snapshot = NULL WHERE snapshot IS NULL;

-- ---------------------------------------------------------------------------
-- What each caller sees
-- ---------------------------------------------------------------------------
--   * staff (as for scores): the live report, plus the snapshot and when it was
--     taken, so the page can show what has changed since release;
--   * a pupil or parent: their own child's part of the snapshot, and nothing at
--     all before release;
--   * anyone else: an empty report.
CREATE OR REPLACE FUNCTION public.term_report(_class_id uuid, _period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  class_org uuid;
  is_staff boolean;
  release record;
  mine uuid[];
  empty jsonb;
BEGIN
  SELECT sc.org_id INTO class_org
  FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
  WHERE c.id = _class_id;

  SELECT r.snapshot, r.released_at INTO release
  FROM public.term_report_releases r
  WHERE r.class_id = _class_id AND r.academic_period_id = _period_id;

  empty := jsonb_build_object(
    'released', release.released_at IS NOT NULL,
    'components', '[]'::jsonb, 'students', '[]'::jsonb, 'subjects', '[]'::jsonb,
    'comments', '[]'::jsonb, 'ratings', '[]'::jsonb);

  is_staff := uid IS NOT NULL
    AND class_org IS NOT NULL
    AND class_org = public.get_user_org_id(uid)
    AND NOT public.is_self_service_role(uid)
    AND NOT public.is_support_staff_only(uid)
    AND (NOT public.is_teacher_only(uid) OR public.teaches_class(_class_id));

  IF is_staff THEN
    RETURN public.term_report_compute(_class_id, _period_id) || jsonb_build_object(
      'released', release.released_at IS NOT NULL,
      'released_at', release.released_at,
      'snapshot', release.snapshot);
  END IF;

  IF uid IS NULL OR release.snapshot IS NULL THEN
    RETURN empty;
  END IF;

  SELECT array_agg((x->>'student_id')::uuid) INTO mine
  FROM jsonb_array_elements(release.snapshot->'students') x
  WHERE (x->>'student_id')::uuid = public.my_student_id()
     OR public.is_my_child((x->>'student_id')::uuid);

  IF mine IS NULL THEN
    RETURN empty;
  END IF;

  RETURN release.snapshot || jsonb_build_object(
    'released', true,
    'released_at', release.released_at,
    'students', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'students') x
                          WHERE (x->>'student_id')::uuid = ANY (mine)), '[]'::jsonb),
    'subjects', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'subjects') x
                          WHERE (x->>'student_id')::uuid = ANY (mine)), '[]'::jsonb),
    'comments', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'comments') x
                          WHERE (x->>'student_id')::uuid = ANY (mine)), '[]'::jsonb),
    'ratings', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'ratings') x
                         WHERE (x->>'student_id')::uuid = ANY (mine)), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.term_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.term_report(uuid, uuid) TO authenticated;

-- Families read comments and ratings through term_report() only. The live
-- tables would show them edits nobody has released.
DROP POLICY IF EXISTS "Families can view released term report comments" ON public.term_report_comments;
DROP POLICY IF EXISTS "Families can view released term report ratings" ON public.term_report_ratings;

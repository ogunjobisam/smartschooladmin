-- ============= Full file contents =============

-- The term report: CA and exam into one total, positions, comments and ratings.
--
-- Until now each assessment was its own exam with its own report, and nothing
-- combined CA1, CA2 and the exam into the term result a Nigerian report card is
-- built around. This adds:
--
--   * exams.term_weight — how much of the term total an exam carries (CA1 20,
--     CA2 20, Exam 60). NULL means the exam is not part of the term report, so
--     every existing exam keeps behaving exactly as it did.
--   * term_report() — subject totals, subject positions and averages, each
--     pupil's average, position in the arm and position across the class
--     (every arm sharing a level_name). Computed in the database so a parent can
--     be shown a position without being able to read anyone else's marks.
--   * term_report_comments / term_report_ratings — the class teacher's and
--     principal's remarks, and affective / psychomotor ratings.
--   * term_report_releases — families see none of it until the school releases
--     that arm's report for the term.
--
-- Safe to run twice: every policy is dropped before it is created, and every
-- other statement is IF NOT EXISTS or CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- Weighting
-- ---------------------------------------------------------------------------
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS term_weight numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_term_weight_range') THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_term_weight_range CHECK (term_weight IS NULL OR (term_weight > 0 AND term_weight <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.exams.term_weight IS
  'Share of the term total this exam carries, e.g. 20 for a CA worth 20%. NULL '
  'leaves the exam out of the term report.';

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
-- The people who own a school's academic record: they write the principal's
-- comment and release reports. A bursar is a school manager but not this.
CREATE OR REPLACE FUNCTION public.is_academic_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'proprietor'::app_role)
      OR public.has_role(_user_id, 'group_admin'::app_role)
      OR public.has_role(_user_id, 'school_admin'::app_role)
      OR public.has_role(_user_id, 'principal'::app_role)
$$;

-- Holds the pupil's class, as opposed to teaching them one subject. The class
-- teacher's comment and the ratings belong to the people who hold the class.
CREATE OR REPLACE FUNCTION public.holds_class_of(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    JOIN public.class_teachers ct ON ct.class_id = e.class_id
    JOIN public.staff s ON s.id = ct.staff_id
    WHERE e.student_id = _student_id AND s.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.student_org_id(_student_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sc.org_id FROM public.students s
  JOIN public.schools sc ON sc.id = s.school_id
  WHERE s.id = _student_id
$$;

-- ---------------------------------------------------------------------------
-- Release
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.term_report_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_period_id uuid NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  released_by uuid DEFAULT auth.uid(),
  released_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, academic_period_id)
);

ALTER TABLE public.term_report_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view term report releases" ON public.term_report_releases;
CREATE POLICY "Staff can view term report releases"
ON public.term_report_releases FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = term_report_releases.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Academic managers can release term reports" ON public.term_report_releases;
CREATE POLICY "Academic managers can release term reports"
ON public.term_report_releases FOR ALL TO authenticated
USING (
  public.is_academic_manager(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = term_report_releases.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  public.is_academic_manager(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = term_report_releases.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);

-- Whether a pupil's report for a term has been released for their arm.
CREATE OR REPLACE FUNCTION public.term_report_released(_student_id uuid, _period_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    JOIN public.term_report_releases r
      ON r.class_id = e.class_id AND r.academic_period_id = e.academic_period_id
    WHERE e.student_id = _student_id AND e.academic_period_id = _period_id
  )
$$;

-- ---------------------------------------------------------------------------
-- Comments and ratings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.term_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_period_id uuid NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('class_teacher', 'principal')),
  body text NOT NULL CHECK (length(body) <= 2000),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_period_id, kind)
);

CREATE TABLE IF NOT EXISTS public.term_report_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_period_id uuid NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('affective', 'psychomotor')),
  trait text NOT NULL CHECK (length(trait) BETWEEN 1 AND 60),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_period_id, domain, trait)
);

CREATE INDEX IF NOT EXISTS idx_term_report_comments_period ON public.term_report_comments (academic_period_id, student_id);
CREATE INDEX IF NOT EXISTS idx_term_report_ratings_period ON public.term_report_ratings (academic_period_id, student_id);

ALTER TABLE public.term_report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_report_ratings ENABLE ROW LEVEL SECURITY;

-- Reading: staff as for scores (support staff out, a teacher only their own
-- pupils), and a family only once the report is released.
DROP POLICY IF EXISTS "Staff can view term report comments" ON public.term_report_comments;
CREATE POLICY "Staff can view term report comments"
ON public.term_report_comments FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);

DROP POLICY IF EXISTS "Families can view released term report comments" ON public.term_report_comments;
CREATE POLICY "Families can view released term report comments"
ON public.term_report_comments FOR SELECT TO authenticated
USING (
  (student_id = public.my_student_id() OR public.is_my_child(student_id))
  AND public.term_report_released(student_id, academic_period_id)
);

-- Writing, split by kind. Permissive policies combine with OR, so each FOR ALL
-- policy pins its own kind in both USING and WITH CHECK: a teacher can neither
-- write a principal row nor turn their own row into one.
DROP POLICY IF EXISTS "Class teachers can write class teacher comments" ON public.term_report_comments;
CREATE POLICY "Class teachers can write class teacher comments"
ON public.term_report_comments FOR ALL TO authenticated
USING (
  kind = 'class_teacher'
  AND NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (public.is_academic_manager(auth.uid()) OR public.holds_class_of(student_id))
)
WITH CHECK (
  kind = 'class_teacher'
  AND NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (public.is_academic_manager(auth.uid()) OR public.holds_class_of(student_id))
);

DROP POLICY IF EXISTS "Academic managers can write principal comments" ON public.term_report_comments;
CREATE POLICY "Academic managers can write principal comments"
ON public.term_report_comments FOR ALL TO authenticated
USING (
  kind = 'principal'
  AND public.is_academic_manager(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
)
WITH CHECK (
  kind = 'principal'
  AND public.is_academic_manager(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can view term report ratings" ON public.term_report_ratings;
CREATE POLICY "Staff can view term report ratings"
ON public.term_report_ratings FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);

DROP POLICY IF EXISTS "Families can view released term report ratings" ON public.term_report_ratings;
CREATE POLICY "Families can view released term report ratings"
ON public.term_report_ratings FOR SELECT TO authenticated
USING (
  (student_id = public.my_student_id() OR public.is_my_child(student_id))
  AND public.term_report_released(student_id, academic_period_id)
);

DROP POLICY IF EXISTS "Class teachers can write term report ratings" ON public.term_report_ratings;
CREATE POLICY "Class teachers can write term report ratings"
ON public.term_report_ratings FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (public.is_academic_manager(auth.uid()) OR public.holds_class_of(student_id))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
  AND (public.is_academic_manager(auth.uid()) OR public.holds_class_of(student_id))
);

-- ---------------------------------------------------------------------------
-- The computation
-- ---------------------------------------------------------------------------
-- For one arm and term. A subject's total is the sum over the arm's weighted
-- exams of score / max * weight, out of the weights of the assessments that
-- actually happened for that subject — so a pupil who missed a CA scores zero
-- for it, but a CA the class never sat does not count against anyone. A pupil
-- with no mark at all in a subject does not take it.
--
-- Averages are the mean subject percentage; positions are competition-ranked
-- on the average to two places, so pupils shown the same average share a place.
-- "level" is every arm sharing this arm's level_name in the same school.
--
-- SECURITY DEFINER because a parent must see their child's position without
-- reading anyone else's marks, so it checks the caller itself:
--   * staff as for scores — not support staff, and a plain teacher only for an
--     arm they teach — see every pupil in the arm;
--   * a pupil or parent sees only their own child, and only once released.
-- Anyone else gets an empty report.
CREATE OR REPLACE FUNCTION public.term_report(_class_id uuid, _period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  class_org uuid;
  is_staff boolean;
  is_released boolean;
  result jsonb;
BEGIN
  SELECT sc.org_id INTO class_org
  FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
  WHERE c.id = _class_id;

  is_staff := uid IS NOT NULL
    AND class_org IS NOT NULL
    AND class_org = public.get_user_org_id(uid)
    AND NOT public.is_self_service_role(uid)
    AND NOT public.is_support_staff_only(uid)
    AND (NOT public.is_teacher_only(uid) OR public.teaches_class(_class_id));

  is_released := EXISTS (
    SELECT 1 FROM public.term_report_releases
    WHERE class_id = _class_id AND academic_period_id = _period_id
  );

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
           count(*) OVER (PARTITION BY class_id) AS arm_size,
           avg(average) OVER (PARTITION BY class_id) AS arm_average,
           rank() OVER (ORDER BY average DESC) AS level_position,
           count(*) OVER () AS level_size,
           avg(average) OVER () AS level_average
    FROM student_totals
  ),
  visible AS (
    SELECT st.student_id FROM student_ranked st
    WHERE st.class_id = _class_id
      AND (
        is_staff
        OR (is_released AND (st.student_id = public.my_student_id() OR public.is_my_child(st.student_id)))
      )
  )
  SELECT jsonb_build_object(
    'released', is_released,
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
      FROM student_ranked st JOIN visible v ON v.student_id = st.student_id
      WHERE st.class_id = _class_id), '[]'::jsonb),
    'subjects', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'student_id', sr.student_id,
               'subject_id', sr.subject_id,
               'total', round(sr.total, 2),
               'out_of', sr.out_of,
               'percent', sr.percent,
               'position', sr.position,
               'class_average', round(sr.class_average, 2),
               'scores', coalesce(sr.scores, '{}'::jsonb)))
      FROM subject_ranked sr JOIN visible v ON v.student_id = sr.student_id
      WHERE sr.class_id = _class_id), '[]'::jsonb)
  ) INTO result;

  -- Nobody entitled: an empty report rather than the arm's sizes and averages.
  IF NOT is_staff AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'students')) THEN
    RETURN jsonb_build_object('released', is_released, 'components', '[]'::jsonb,
                              'students', '[]'::jsonb, 'subjects', '[]'::jsonb);
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.term_report(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.term_report_released(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.holds_class_of(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_academic_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.term_report(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.term_report_released(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.holds_class_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_academic_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_org_id(uuid) TO authenticated;
-- Term reports obey "withhold results until fees are paid".
--
-- 20260927180000_term_report_engine gave families a second road to their
-- child's marks: term_report() returns totals, per-subject scores and positions
-- once an arm's term is released, and the comments and ratings policies check
-- only that release. Neither knew about the fees gate added in
-- 20260927190100_withhold_results_until_paid, so a family in debt that could
-- not see a single score could still open the whole report card.
--
-- Two changes, both on the family side only — staff are untouched:
--
--   * term_report_released() now means "released to this family": the arm is
--     released AND the pupil's results are not withheld. It is used only by the
--     family policies on term_report_comments and term_report_ratings, so both
--     follow without being rewritten.
--   * term_report() drops a withheld pupil from what their own family sees.
--     The body below is the engine's, with only the `visible` clause changed.
--
-- results_withheld() is revoked from signed-in users; both callers here are
-- SECURITY DEFINER, so it runs as the owner.

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
  AND NOT public.results_withheld(_student_id, _period_id)
$$;

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
        OR (is_released
            AND (st.student_id = public.my_student_id() OR public.is_my_child(st.student_id))
            AND NOT public.results_withheld(st.student_id, _period_id))
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
GRANT EXECUTE ON FUNCTION public.term_report(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.term_report_released(uuid, uuid) TO authenticated;
-- Computer-based testing.
--
-- Teachers keep a question bank per subject, assemble tests from it for a
-- class, and pupils sit them in the student portal. A graded test linked to an
-- exam writes its mark straight into student_scores, so report cards, result
-- release and the fees gate apply to it with no further work. A practice test
-- never touches student_scores.
--
-- The security shape, which is the point of this file:
--
--   * Pupils never read the CBT tables directly. They have no policy on any of
--     them. Everything a pupil does goes through the SECURITY DEFINER functions
--     at the bottom, which check my_student_id() themselves and never return
--     cbt_questions.correct_option. Column-level rules cannot do that with
--     row-level security alone, which is why the paper is served by a function.
--   * Authoring is an allowlist — academic managers and teachers — not the
--     staff denylist used elsewhere. An answer key has no business in front of
--     a bursar, an HR admin or the school office, and a new role added later
--     gets none of this by default (CLAUDE.md §4).
--   * A teacher who is only a teacher is kept to their own school, and to tests
--     for classes they teach. The question bank is shared across the school.
--
-- The lab's internet is unreliable, so the deadline has a sync grace: answers
-- given before time and queued offline are still accepted for a few minutes
-- after it. The test screen stops accepting input at the deadline itself.
--
-- Safe to run twice.

-- /cbt is a new top-level route, so no school may take it as its web address.
-- Mirrors RESERVED_SLUGS in src/lib/admissions.ts.
CREATE OR REPLACE FUNCTION public.reserved_school_slugs()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    -- hostnames
    'www', 'app', 'admin', 'api', 'mail', 'demo',
    'assets', 'auth', 'blog', 'cdn', 'docs', 'ftp', 'help', 'static',
    'status', 'support', 'smtp', 'staging', 'test',
    -- top-level routes in src/App.tsx
    'achievements', 'admissions', 'announcements', 'apply', 'approvals',
    'arrears', 'attendance', 'audit-log', 'billing', 'cbt', 'dashboard', 'events',
    'exams', 'fees', 'forgot-password', 'group-overview', 'guardians',
    'invoices', 'login', 'message-delivery', 'my-pay',
    'notification-settings', 'notification-templates', 'notifications',
    'onboarding', 'parent', 'payments', 'payroll', 'performance', 'pricing',
    'privacy', 'reports', 'reset-password', 'roles', 'school-profile',
    'settings', 'signup', 'staff', 'staff-portal', 'student', 'students',
    'terms', 'timetable', 'transport', 'users', 'wall'
  ]::text[]
$$;

-- ---------------------------------------------------------------------------
-- Who may author
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_author_cbt(_school_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_self_service_role(auth.uid())
    AND (public.is_academic_manager(auth.uid()) OR public.has_role(auth.uid(), 'teacher'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = _school_id AND s.org_id = public.get_user_org_id(auth.uid())
    )
    AND (
      NOT public.is_teacher_only(auth.uid())
      OR public.get_user_school_id(auth.uid()) IS NULL
      OR _school_id = public.get_user_school_id(auth.uid())
    )
$$;

-- How long after the deadline queued answers are still accepted.
CREATE OR REPLACE FUNCTION public.cbt_sync_grace()
RETURNS interval
LANGUAGE sql IMMUTABLE
AS $$ SELECT interval '5 minutes' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbt_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  level_name text,
  topic text,
  question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false')),
  prompt text NOT NULL CHECK (length(btrim(prompt)) > 0),
  options jsonb NOT NULL CHECK (
    jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6
  ),
  correct_option text NOT NULL,
  marks numeric(5,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbt_questions_answer_is_an_option
    CHECK (options @> jsonb_build_array(jsonb_build_object('id', correct_option)))
);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_school_subject ON public.cbt_questions(school_id, subject_id);

CREATE TABLE IF NOT EXISTS public.cbt_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  instructions text,
  mode text NOT NULL DEFAULT 'graded' CHECK (mode IN ('graded', 'practice')),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 1 AND 600),
  opens_at timestamptz,
  closes_at timestamptz,
  max_attempts integer DEFAULT 1 CHECK (max_attempts IS NULL OR max_attempts >= 1),
  shuffle_questions boolean NOT NULL DEFAULT true,
  shuffle_options boolean NOT NULL DEFAULT true,
  show_score_after boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbt_tests_window CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at),
  CONSTRAINT cbt_tests_practice_is_unmarked CHECK (mode = 'graded' OR exam_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_cbt_tests_school ON public.cbt_tests(school_id);
CREATE INDEX IF NOT EXISTS idx_cbt_tests_class ON public.cbt_tests(class_id);

CREATE TABLE IF NOT EXISTS public.cbt_test_questions (
  test_id uuid NOT NULL REFERENCES public.cbt_tests(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (test_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_cbt_test_questions_question ON public.cbt_test_questions(question_id);

CREATE TABLE IF NOT EXISTS public.cbt_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.cbt_tests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  question_order uuid[] NOT NULL,
  option_order jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seq bigint NOT NULL DEFAULT 0,
  score numeric(7,2),
  max_score numeric(7,2),
  UNIQUE (test_id, student_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_student ON public.cbt_attempts(student_id);
-- At most one sitting open per pupil per test.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cbt_attempts_one_open
  ON public.cbt_attempts(test_id, student_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS public.cbt_answers (
  attempt_id uuid NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  selected_option text,
  seq bigint NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  is_correct boolean,
  PRIMARY KEY (attempt_id, question_id)
);

DROP TRIGGER IF EXISTS update_cbt_questions_updated_at ON public.cbt_questions;
CREATE TRIGGER update_cbt_questions_updated_at BEFORE UPDATE ON public.cbt_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_cbt_tests_updated_at ON public.cbt_tests;
CREATE TRIGGER update_cbt_tests_updated_at BEFORE UPDATE ON public.cbt_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Integrity: everything in one test belongs to one school, and nothing a pupil
-- has already answered can be changed underneath them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_tests_check()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id = NEW.class_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'The class does not belong to this school' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'The subject does not belong to this school' USING ERRCODE = '23514';
  END IF;
  IF NEW.exam_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM exams
    WHERE id = NEW.exam_id AND school_id = NEW.school_id
      AND (class_id IS NULL OR class_id = NEW.class_id)
  ) THEN
    RAISE EXCEPTION 'The linked exam must be for this school and this class' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
     AND NOT EXISTS (SELECT 1 FROM cbt_test_questions WHERE test_id = NEW.id) THEN
    RAISE EXCEPTION 'Add at least one question before publishing' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cbt_tests_check ON public.cbt_tests;
CREATE TRIGGER cbt_tests_check BEFORE INSERT OR UPDATE ON public.cbt_tests
  FOR EACH ROW EXECUTE FUNCTION public.cbt_tests_check();

CREATE OR REPLACE FUNCTION public.cbt_test_questions_check()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _test_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.test_id ELSE NEW.test_id END;
BEGIN
  -- A cascade from deleting the whole test is fine.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM cbt_tests WHERE id = OLD.test_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM cbt_attempts WHERE test_id = _test_id) THEN
    RAISE EXCEPTION 'Pupils have already sat this test, so its questions cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM cbt_questions q JOIN cbt_tests t ON t.school_id = q.school_id
    WHERE q.id = NEW.question_id AND t.id = NEW.test_id
  ) THEN
    RAISE EXCEPTION 'The question belongs to another school' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS cbt_test_questions_check ON public.cbt_test_questions;
CREATE TRIGGER cbt_test_questions_check BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_test_questions
  FOR EACH ROW EXECUTE FUNCTION public.cbt_test_questions_check();

CREATE OR REPLACE FUNCTION public.cbt_questions_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.prompt IS NOT DISTINCT FROM OLD.prompt
     AND NEW.options IS NOT DISTINCT FROM OLD.options
     AND NEW.correct_option IS NOT DISTINCT FROM OLD.correct_option
     AND NEW.marks IS NOT DISTINCT FROM OLD.marks THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM cbt_test_questions tq JOIN cbt_attempts a ON a.test_id = tq.test_id
    WHERE tq.question_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Pupils have already answered this question in a test; duplicate it instead of changing it'
      USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS cbt_questions_lock ON public.cbt_questions;
CREATE TRIGGER cbt_questions_lock BEFORE UPDATE OR DELETE ON public.cbt_questions
  FOR EACH ROW EXECUTE FUNCTION public.cbt_questions_lock();

-- ---------------------------------------------------------------------------
-- Row-level security: staff authors only. Pupils go through the functions.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_answers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_cbt_test(_test_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cbt_tests t
    WHERE t.id = _test_id
      AND public.can_author_cbt(t.school_id)
      AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(t.class_id))
  )
$$;

DROP POLICY IF EXISTS "CBT authors can manage questions" ON public.cbt_questions;
CREATE POLICY "CBT authors can manage questions" ON public.cbt_questions
  FOR ALL TO authenticated
  USING (public.can_author_cbt(school_id))
  WITH CHECK (
    public.can_author_cbt(school_id)
    AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = subject_id AND s.school_id = cbt_questions.school_id)
  );

DROP POLICY IF EXISTS "CBT authors can manage tests" ON public.cbt_tests;
CREATE POLICY "CBT authors can manage tests" ON public.cbt_tests
  FOR ALL TO authenticated
  USING (
    public.can_author_cbt(school_id)
    AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(class_id))
  )
  WITH CHECK (
    public.can_author_cbt(school_id)
    AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(class_id))
  );

DROP POLICY IF EXISTS "CBT authors can manage test questions" ON public.cbt_test_questions;
CREATE POLICY "CBT authors can manage test questions" ON public.cbt_test_questions
  FOR ALL TO authenticated
  USING (public.can_manage_cbt_test(test_id))
  WITH CHECK (public.can_manage_cbt_test(test_id));

DROP POLICY IF EXISTS "CBT authors can view attempts" ON public.cbt_attempts;
CREATE POLICY "CBT authors can view attempts" ON public.cbt_attempts
  FOR SELECT TO authenticated
  USING (public.can_manage_cbt_test(test_id));

-- Resetting a pupil's sitting (a crashed machine, a mistaken start).
DROP POLICY IF EXISTS "CBT authors can reset attempts" ON public.cbt_attempts;
CREATE POLICY "CBT authors can reset attempts" ON public.cbt_attempts
  FOR DELETE TO authenticated
  USING (public.can_manage_cbt_test(test_id));

DROP POLICY IF EXISTS "CBT authors can view answers" ON public.cbt_answers;
CREATE POLICY "CBT authors can view answers" ON public.cbt_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cbt_attempts a
    WHERE a.id = cbt_answers.attempt_id AND public.can_manage_cbt_test(a.test_id)
  ));

REVOKE ALL ON public.cbt_questions, public.cbt_tests, public.cbt_test_questions,
  public.cbt_attempts, public.cbt_answers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cbt_questions, public.cbt_tests,
  public.cbt_test_questions TO authenticated;
GRANT SELECT, DELETE ON public.cbt_attempts TO authenticated;
GRANT SELECT ON public.cbt_answers TO authenticated;

-- ---------------------------------------------------------------------------
-- Marking (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_student_in_class(_student_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    JOIN public.academic_periods p ON p.id = e.academic_period_id
    WHERE e.student_id = _student_id AND e.class_id = _class_id AND p.is_current
  )
$$;

CREATE OR REPLACE FUNCTION public.cbt_finalise(_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a public.cbt_attempts;
  t public.cbt_tests;
  _raw numeric;
  _total numeric;
  _best numeric;
  _target numeric;
BEGIN
  SELECT * INTO a FROM cbt_attempts WHERE id = _attempt_id FOR UPDATE;
  IF NOT FOUND OR a.status = 'submitted' THEN RETURN; END IF;
  SELECT * INTO t FROM cbt_tests WHERE id = a.test_id;

  UPDATE cbt_answers ans
     SET is_correct = (ans.selected_option IS NOT NULL AND ans.selected_option = q.correct_option)
    FROM cbt_questions q
   WHERE q.id = ans.question_id AND ans.attempt_id = _attempt_id;

  SELECT coalesce(sum(q.marks), 0) INTO _total
    FROM cbt_questions q WHERE q.id = ANY (a.question_order);
  SELECT coalesce(sum(q.marks), 0) INTO _raw
    FROM cbt_answers ans JOIN cbt_questions q ON q.id = ans.question_id
   WHERE ans.attempt_id = _attempt_id AND ans.is_correct;

  UPDATE cbt_attempts
     SET status = 'submitted', submitted_at = now(), score = _raw, max_score = _total
   WHERE id = _attempt_id;

  -- A graded test linked to an exam owns that subject's mark: the best sitting,
  -- scaled to the exam subject's maximum.
  IF t.mode = 'graded' AND t.exam_id IS NOT NULL THEN
    SELECT max(score / nullif(max_score, 0)) INTO _best
      FROM cbt_attempts
     WHERE test_id = t.id AND student_id = a.student_id AND status = 'submitted';
    SELECT coalesce(
      (SELECT es.max_score FROM exam_subjects es WHERE es.exam_id = t.exam_id AND es.subject_id = t.subject_id),
      (SELECT e.max_score FROM exams e WHERE e.id = t.exam_id)
    ) INTO _target;
    IF _best IS NOT NULL AND _target IS NOT NULL THEN
      INSERT INTO student_scores (exam_id, student_id, subject_id, score, remarks)
      VALUES (t.exam_id, a.student_id, t.subject_id, round(_best * _target, 2), 'CBT: ' || t.title)
      ON CONFLICT (exam_id, student_id, subject_id)
      DO UPDATE SET score = EXCLUDED.score, remarks = EXCLUDED.remarks, updated_at = now();
    END IF;
  END IF;
END $$;

-- Close any of this pupil's sittings whose time and sync grace have both run
-- out, or whose test has been closed.
CREATE OR REPLACE FUNCTION public.cbt_finalise_overdue(_student_id uuid, _test_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.id FROM cbt_attempts a JOIN cbt_tests t ON t.id = a.test_id
    WHERE a.status = 'in_progress'
      AND (_student_id IS NULL OR a.student_id = _student_id)
      AND (_test_id IS NULL OR a.test_id = _test_id)
      AND (now() > a.deadline_at + public.cbt_sync_grace() OR t.status = 'closed')
  LOOP
    PERFORM public.cbt_finalise(r.id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cbt_finalise(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_finalise_overdue(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cbt_student_in_class(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pupil functions
-- ---------------------------------------------------------------------------

-- The tests open to me now or soon, with my progress on each.
CREATE OR REPLACE FUNCTION public.cbt_my_tests()
RETURNS TABLE (
  test_id uuid, title text, subject_name text, mode text, instructions text,
  duration_minutes integer, opens_at timestamptz, closes_at timestamptz,
  max_attempts integer, question_count integer, attempts_used integer,
  open_attempt_id uuid, last_score numeric, last_max_score numeric, last_submitted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _me uuid := public.my_student_id();
BEGIN
  IF _me IS NULL THEN RETURN; END IF;
  PERFORM public.cbt_finalise_overdue(_me, NULL);
  RETURN QUERY
  SELECT t.id, t.title, s.name, t.mode, t.instructions, t.duration_minutes, t.opens_at, t.closes_at,
         t.max_attempts,
         (SELECT count(*)::int FROM cbt_test_questions tq WHERE tq.test_id = t.id),
         (SELECT count(*)::int FROM cbt_attempts a WHERE a.test_id = t.id AND a.student_id = _me),
         (SELECT a.id FROM cbt_attempts a WHERE a.test_id = t.id AND a.student_id = _me AND a.status = 'in_progress'),
         CASE WHEN t.mode = 'practice' OR t.show_score_after THEN last.score END,
         CASE WHEN t.mode = 'practice' OR t.show_score_after THEN last.max_score END,
         last.submitted_at
    FROM cbt_tests t
    JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN LATERAL (
      SELECT a.score, a.max_score, a.submitted_at FROM cbt_attempts a
       WHERE a.test_id = t.id AND a.student_id = _me AND a.status = 'submitted'
       ORDER BY a.submitted_at DESC LIMIT 1
    ) last ON true
   WHERE t.status = 'published'
     AND public.cbt_student_in_class(_me, t.class_id)
     AND (t.closes_at IS NULL OR t.closes_at > now() - interval '14 days')
   ORDER BY coalesce(t.opens_at, t.created_at) DESC;
END $$;

-- Start a sitting, or return the one already open. Returns the attempt id.
CREATE OR REPLACE FUNCTION public.cbt_start_attempt(_test_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _me uuid := public.my_student_id();
  t public.cbt_tests;
  _open uuid;
  _used integer;
  _order uuid[];
  _options jsonb;
  _id uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Only a pupil can sit a test' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM cbt_tests WHERE id = _test_id;
  IF NOT FOUND OR t.status <> 'published' OR NOT public.cbt_student_in_class(_me, t.class_id) THEN
    RAISE EXCEPTION 'Test not found' USING ERRCODE = '42501';
  END IF;

  -- Two tabs pressing Start at once must not open two sittings.
  PERFORM pg_advisory_xact_lock(hashtext('cbt:' || _test_id::text || ':' || _me::text));
  PERFORM public.cbt_finalise_overdue(_me, _test_id);

  SELECT id INTO _open FROM cbt_attempts
   WHERE test_id = _test_id AND student_id = _me AND status = 'in_progress';
  IF _open IS NOT NULL THEN RETURN _open; END IF;

  IF t.opens_at IS NOT NULL AND now() < t.opens_at THEN
    RAISE EXCEPTION 'This test has not opened yet' USING ERRCODE = 'P0001';
  END IF;
  IF t.closes_at IS NOT NULL AND now() >= t.closes_at THEN
    RAISE EXCEPTION 'This test has closed' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO _used FROM cbt_attempts WHERE test_id = _test_id AND student_id = _me;
  IF t.max_attempts IS NOT NULL AND _used >= t.max_attempts THEN
    RAISE EXCEPTION 'You have used all your attempts at this test' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(tq.question_id ORDER BY CASE WHEN t.shuffle_questions THEN random() ELSE tq.position END, tq.question_id)
    INTO _order FROM cbt_test_questions tq WHERE tq.test_id = _test_id;
  IF _order IS NULL THEN
    RAISE EXCEPTION 'This test has no questions' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_object_agg(q.id, (
           SELECT jsonb_agg(o->>'id' ORDER BY CASE WHEN t.shuffle_options AND q.question_type = 'mcq' THEN random() ELSE ord END)
             FROM jsonb_array_elements(q.options) WITH ORDINALITY AS x(o, ord)
         )), '{}'::jsonb)
    INTO _options FROM cbt_questions q WHERE q.id = ANY (_order);

  INSERT INTO cbt_attempts (test_id, student_id, attempt_no, deadline_at, question_order, option_order)
  VALUES (
    _test_id, _me, _used + 1,
    least(now() + make_interval(mins => t.duration_minutes), coalesce(t.closes_at, 'infinity'::timestamptz)),
    _order, _options
  )
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- The paper for one of my sittings: questions in my order, never the key.
CREATE OR REPLACE FUNCTION public.cbt_attempt_paper(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _me uuid := public.my_student_id();
  a public.cbt_attempts;
  t public.cbt_tests;
  _show boolean;
BEGIN
  SELECT * INTO a FROM cbt_attempts WHERE id = _attempt_id AND student_id = _me;
  IF NOT FOUND OR _me IS NULL THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501';
  END IF;
  IF a.status = 'in_progress' THEN
    PERFORM public.cbt_finalise_overdue(_me, a.test_id);
    SELECT * INTO a FROM cbt_attempts WHERE id = _attempt_id;
  END IF;
  SELECT * INTO t FROM cbt_tests WHERE id = a.test_id;
  _show := t.mode = 'practice' OR t.show_score_after;

  RETURN jsonb_build_object(
    'attempt_id', a.id,
    'test_id', t.id,
    'title', t.title,
    'instructions', t.instructions,
    'mode', t.mode,
    'status', a.status,
    'started_at', a.started_at,
    'deadline_at', a.deadline_at,
    'submitted_at', a.submitted_at,
    'server_now', now(),
    'last_seq', a.last_seq,
    'score', CASE WHEN a.status = 'submitted' AND _show THEN a.score END,
    'max_score', CASE WHEN a.status = 'submitted' AND _show THEN a.max_score END,
    'questions', CASE WHEN a.status = 'in_progress' THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id,
               'prompt', q.prompt,
               'question_type', q.question_type,
               'marks', q.marks,
               'options', (
                 SELECT jsonb_agg(jsonb_build_object('id', oid, 'text', (
                          SELECT o->>'text' FROM jsonb_array_elements(q.options) o WHERE o->>'id' = oid
                        )) ORDER BY pos)
                   FROM jsonb_array_elements_text(a.option_order -> q.id::text) WITH ORDINALITY AS y(oid, pos)
               )
             ) ORDER BY qo.pos), '[]'::jsonb)
        FROM unnest(a.question_order) WITH ORDINALITY AS qo(qid, pos)
        JOIN cbt_questions q ON q.id = qo.qid
    ) ELSE '[]'::jsonb END,
    'answers', (
      SELECT coalesce(jsonb_object_agg(ans.question_id, ans.selected_option), '{}'::jsonb)
        FROM cbt_answers ans WHERE ans.attempt_id = a.id
    )
  );
END $$;

-- Save a batch of answers. Each item is {question_id, option_id, seq}; the
-- highest seq per question wins, so resending a batch is harmless. Returns
-- {status, last_seq}; status 'submitted' tells the client time ran out.
CREATE OR REPLACE FUNCTION public.cbt_save_answers(_attempt_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _me uuid := public.my_student_id();
  a public.cbt_attempts;
  item jsonb;
  _qid uuid;
  _opt text;
  _seq bigint;
BEGIN
  SELECT * INTO a FROM cbt_attempts WHERE id = _attempt_id AND student_id = _me FOR UPDATE;
  IF NOT FOUND OR _me IS NULL THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501';
  END IF;
  IF a.status = 'in_progress' AND (
       now() > a.deadline_at + public.cbt_sync_grace()
       OR EXISTS (SELECT 1 FROM cbt_tests WHERE id = a.test_id AND status = 'closed')
     ) THEN
    PERFORM public.cbt_finalise(a.id);
    RETURN jsonb_build_object('status', 'submitted', 'last_seq', a.last_seq);
  END IF;
  IF a.status <> 'in_progress' THEN
    RETURN jsonb_build_object('status', a.status, 'last_seq', a.last_seq);
  END IF;
  IF jsonb_typeof(_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Answers must be a list' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_answers) LOOP
    _qid := (item->>'question_id')::uuid;
    _opt := item->>'option_id';
    _seq := coalesce((item->>'seq')::bigint, 0);
    IF NOT (_qid = ANY (a.question_order)) THEN
      RAISE EXCEPTION 'That question is not on this paper' USING ERRCODE = '22023';
    END IF;
    IF _opt IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cbt_questions q, jsonb_array_elements(q.options) o
      WHERE q.id = _qid AND o->>'id' = _opt
    ) THEN
      RAISE EXCEPTION 'That option is not on this question' USING ERRCODE = '22023';
    END IF;
    INSERT INTO cbt_answers (attempt_id, question_id, selected_option, seq, answered_at)
    VALUES (a.id, _qid, _opt, _seq, now())
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option = EXCLUDED.selected_option, seq = EXCLUDED.seq, answered_at = now()
      WHERE cbt_answers.seq < EXCLUDED.seq;
    a.last_seq := greatest(a.last_seq, _seq);
  END LOOP;

  UPDATE cbt_attempts SET last_seq = a.last_seq WHERE id = a.id;
  RETURN jsonb_build_object('status', 'in_progress', 'last_seq', a.last_seq);
END $$;

-- Hand in: save any last answers, then mark.
CREATE OR REPLACE FUNCTION public.cbt_submit_attempt(_attempt_id uuid, _answers jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  r := public.cbt_save_answers(_attempt_id, coalesce(_answers, '[]'::jsonb));
  IF r->>'status' = 'in_progress' THEN
    PERFORM public.cbt_finalise(_attempt_id);
  END IF;
  RETURN public.cbt_attempt_paper(_attempt_id);
END $$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

-- Give one pupil more time (a machine died, the power went).
CREATE OR REPLACE FUNCTION public.cbt_extend_attempt(_attempt_id uuid, _minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a public.cbt_attempts;
BEGIN
  SELECT * INTO a FROM cbt_attempts WHERE id = _attempt_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_cbt_test(a.test_id) THEN
    RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This sitting has already been handed in' USING ERRCODE = 'P0001';
  END IF;
  IF _minutes IS NULL OR _minutes < 1 OR _minutes > 240 THEN
    RAISE EXCEPTION 'Extend by between 1 and 240 minutes' USING ERRCODE = '22023';
  END IF;
  UPDATE cbt_attempts SET deadline_at = greatest(deadline_at, now()) + make_interval(mins => _minutes)
   WHERE id = _attempt_id RETURNING deadline_at INTO a.deadline_at;
  RETURN a.deadline_at;
END $$;

-- Mark every sitting of this test whose time is up (or all, once closed).
CREATE OR REPLACE FUNCTION public.cbt_close_overdue(_test_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_cbt_test(_test_id) THEN
    RAISE EXCEPTION 'Test not found' USING ERRCODE = '42501';
  END IF;
  PERFORM public.cbt_finalise_overdue(NULL, _test_id);
END $$;

REVOKE ALL ON FUNCTION public.cbt_my_tests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_start_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_attempt_paper(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_save_answers(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_submit_attempt(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_extend_attempt(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_close_overdue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_my_tests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_start_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_attempt_paper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_save_answers(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_submit_attempt(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_extend_attempt(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_close_overdue(uuid) TO authenticated;
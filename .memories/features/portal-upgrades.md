---
name: Student/teacher/parent portal upgrades
description: Portal self-service depth — student results/attendance pages, teacher roster-to-profile, guardian contacts, class analytics, parent documents & teachers
type: feature
---
Student portal: `/student/results` (per-exam subject breakdown, transcript + per-term report card) and `/student/attendance` (dated register, term filter) are student-only nav items; portal home shows "My subjects" from class_subjects. No timetable feature exists — do not fake one.

Teacher portal: roster rows link to `/students/:id`; `GuardianContactsPanel` (RLS: teachers only read guardians of students they teach, via teaches_student policy); `ClassPerformancePanel` (subject averages/pass rates per class); student recognitions listed for first 10 students.

Parent portal: per-child tab includes `ChildDocumentsAndTeachers` — transcript/report-card download via shared `printStudentTranscript(studentId, {periodId, periodName?})` helper in `src/lib/student-documents.ts`, plus class teacher names via `class_teacher_names(uuid)` SECURITY DEFINER RPC (names only, gated to enrolled-linked viewers).

`printTranscript` in print-documents.ts accepts optional `documentTitle`/`documentKicker` so one renderer serves transcript and term report card.

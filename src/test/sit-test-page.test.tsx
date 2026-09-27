import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// The exam screen against a fake backend whose connection can be cut. What
// matters is that nothing a pupil answers is lost while it is down.
const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
const paper = () => ({
  attempt_id: "att",
  title: "Maths CBT",
  instructions: null,
  mode: "graded",
  status: "in_progress",
  deadline_at: future(),
  server_now: new Date().toISOString(),
  last_seq: 0,
  score: null,
  max_score: null,
  questions: [
    { id: "q1", prompt: "7 x 8 = ?", question_type: "mcq", marks: 2, options: [{ id: "a", text: "54" }, { id: "b", text: "56" }] },
    { id: "q2", prompt: "10 is even", question_type: "true_false", marks: 1, options: [{ id: "a", text: "True" }, { id: "b", text: "False" }] },
  ],
  answers: {},
});

let online = true;
const saved: unknown[] = [];
const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === "cbt_attempt_paper") return { data: paper(), error: null };
  if (!online) return { data: null, error: { message: "Failed to fetch", code: "" } };
  if (name === "cbt_save_answers") {
    saved.push(...(args._answers as unknown[]));
    return { data: { status: "in_progress", last_seq: 0 }, error: null };
  }
  if (name === "cbt_submit_attempt") {
    saved.push(...(args._answers as unknown[]));
    return { data: { ...paper(), status: "submitted" }, error: null };
  }
  return { data: null, error: null };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => rpc(name, args) },
}));

import SitTest from "@/pages/student/SitTest";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/student/tests/att"]}>
      <Routes>
        <Route path="/student/tests/:attemptId" element={<SitTest />} />
      </Routes>
    </MemoryRouter>,
  );

describe("SitTest", () => {
  beforeEach(() => {
    online = true;
    saved.length = 0;
    rpc.mockClear();
    localStorage.clear();
  });

  it("renders the paper from the server", async () => {
    renderPage();
    expect(await screen.findByText("7 x 8 = ?")).toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
  });

  it("keeps answers given offline and sends them when the connection returns", async () => {
    renderPage();
    await screen.findByText("7 x 8 = ?");

    online = false;
    fireEvent.click(screen.getByRole("radio", { name: /56/ }));
    expect(await screen.findByText(/Offline · 1 to send/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /56/ })).toHaveAttribute("aria-checked", "true");
    expect(saved).toEqual([]);

    // Held on this computer: a reload while offline still has it.
    expect(localStorage.getItem("cbt-answers:att")).toContain('"optionId":"b"');

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saved).toEqual([{ question_id: "q1", option_id: "b", seq: 1 }]));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("restores unsent answers after a reload", async () => {
    online = false;
    const first = renderPage();
    await screen.findByText("7 x 8 = ?");
    fireEvent.click(screen.getByRole("radio", { name: /54/ }));
    first.unmount();

    renderPage();
    await screen.findByText("7 x 8 = ?");
    expect(screen.getByRole("radio", { name: /54/ })).toHaveAttribute("aria-checked", "true");
  });

  it("hands in queued answers with the submission", async () => {
    renderPage();
    await screen.findByText("7 x 8 = ?");
    online = false;
    fireEvent.click(screen.getByRole("radio", { name: /56/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("radio", { name: /True/ }));
    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Hand in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hand in" }));
    expect(await screen.findByText(/Your teacher will release the result/)).toBeInTheDocument();
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ question_id: "q1", option_id: "b" }),
      expect.objectContaining({ question_id: "q2", option_id: "a" }),
    ]));
    expect(localStorage.getItem("cbt-answers:att")).toBeNull();
  });
});

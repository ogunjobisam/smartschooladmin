import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrandColorsCard } from "@/components/settings/BrandColorsCard";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, BRAND_PRESETS } from "@/lib/theme";

const SCHOOL_PRIMARY = "#5b1520";
const SCHOOL_ACCENT = "#8a7a2f";

const previewColors = vi.fn();
let branding = { primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT };
let loading = true;

vi.mock("@/contexts/SchoolBrandingContext", () => ({
  useSchoolBranding: () => ({ branding, loading, previewColors, refetch: vi.fn() }),
}));

const primaryField = () => screen.getByLabelText("Primary") as HTMLInputElement;
const accentField = () => screen.getByLabelText("Accent") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /save colours/i });

beforeEach(() => {
  previewColors.mockClear();
  branding = { primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT };
  loading = true;
});

describe("BrandColorsCard", () => {
  it("shows the school's saved colours, not the defaults it first rendered with", async () => {
    // The bug this guards: opening Settings on a hard reload rendered the card
    // while the fetch was still in flight, so the fields held the navy-and-gold
    // defaults — and saving wrote those over the school's real branding.
    const { rerender } = render(<BrandColorsCard onSave={vi.fn()} />);
    expect(primaryField().value).toBe(DEFAULT_PRIMARY);

    branding = { primaryColor: SCHOOL_PRIMARY, accentColor: SCHOOL_ACCENT };
    loading = false;
    rerender(<BrandColorsCard onSave={vi.fn()} />);

    await waitFor(() => expect(primaryField().value).toBe(SCHOOL_PRIMARY));
    expect(accentField().value).toBe(SCHOOL_ACCENT);
  });

  it("does not throw away an edit when the branding refetches", async () => {
    loading = false;
    branding = { primaryColor: SCHOOL_PRIMARY, accentColor: SCHOOL_ACCENT };
    const { rerender } = render(<BrandColorsCard onSave={vi.fn()} />);
    await waitFor(() => expect(primaryField().value).toBe(SCHOOL_PRIMARY));

    fireEvent.change(primaryField(), { target: { value: "#123456" } });

    // Something else on the page refetches — the edit in progress must survive.
    rerender(<BrandColorsCard onSave={vi.fn()} />);
    expect(primaryField().value).toBe("#123456");
  });

  it("will not save until something has changed", async () => {
    loading = false;
    render(<BrandColorsCard onSave={vi.fn()} />);
    await waitFor(() => expect(saveButton()).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /deep maroon & gold/i }));
    expect(saveButton()).toBeEnabled();
  });

  it("refuses a half-typed colour rather than saving a fallback", async () => {
    loading = false;
    render(<BrandColorsCard onSave={vi.fn()} />);
    fireEvent.change(primaryField(), { target: { value: "#12" } });

    expect(saveButton()).toBeDisabled();
    expect(primaryField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/six-digit hex/i)).toBeInTheDocument();
  });

  it("previews valid colours live and stops previewing invalid ones", async () => {
    loading = false;
    render(<BrandColorsCard onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /forest & brass/i }));
    const forest = BRAND_PRESETS.find((p) => p.name === "Forest & Brass")!;
    await waitFor(() =>
      expect(previewColors).toHaveBeenCalledWith({
        primaryColor: forest.primary,
        accentColor: forest.accent,
      }),
    );

    fireEvent.change(primaryField(), { target: { value: "" } });
    await waitFor(() => expect(previewColors).toHaveBeenLastCalledWith(null));
  });

  it("puts the saved colours back when it unmounts", async () => {
    loading = false;
    const { unmount } = render(<BrandColorsCard onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /teal & amber/i }));
    previewColors.mockClear();

    unmount();
    // Otherwise someone who browses away without saving keeps a theme that is
    // not their school's until the next reload.
    expect(previewColors).toHaveBeenCalledWith(null);
  });

  it("hands the chosen pair to the caller, and stays dirty if the save fails", async () => {
    loading = false;
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    render(<BrandColorsCard onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: /aubergine & gold/i }));
    const aubergine = BRAND_PRESETS.find((p) => p.name === "Aubergine & Gold")!;
    fireEvent.click(saveButton());

    expect(onSave).toHaveBeenCalledWith(aubergine.primary, aubergine.accent);
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(primaryField().value).toBe(aubergine.primary);
  });

  it("resets to navy and gold", async () => {
    loading = false;
    branding = { primaryColor: SCHOOL_PRIMARY, accentColor: SCHOOL_ACCENT };
    render(<BrandColorsCard onSave={vi.fn()} />);
    await waitFor(() => expect(primaryField().value).toBe(SCHOOL_PRIMARY));

    fireEvent.click(screen.getByRole("button", { name: /reset to navy and gold/i }));
    expect(primaryField().value).toBe(DEFAULT_PRIMARY);
    expect(accentField().value).toBe(DEFAULT_ACCENT);
  });
});

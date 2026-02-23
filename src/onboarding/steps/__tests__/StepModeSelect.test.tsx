import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import StepModeSelect from "../StepModeSelect";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StepModeSelect", () => {
  it("renders two mode cards", () => {
    render(
      <StepModeSelect onModeA={vi.fn()} onModeB={vi.fn()} onBack={vi.fn()} />,
    );

    expect(screen.getByText("Keep Existing Structure")).toBeInTheDocument();
    expect(screen.getByText("Full Re-organization")).toBeInTheDocument();
  });

  it("Mode A click calls onModeA", async () => {
    const onModeA = vi.fn();
    const user = userEvent.setup();

    render(
      <StepModeSelect onModeA={onModeA} onModeB={vi.fn()} onBack={vi.fn()} />,
    );

    await user.click(screen.getByTestId("mode-a"));
    expect(onModeA).toHaveBeenCalled();
  });

  it("Mode B click calls onModeB", async () => {
    const onModeB = vi.fn();
    const user = userEvent.setup();

    render(
      <StepModeSelect onModeA={vi.fn()} onModeB={onModeB} onBack={vi.fn()} />,
    );

    await user.click(screen.getByTestId("mode-b"));
    expect(onModeB).toHaveBeenCalled();
  });

  it("Back button calls onBack", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(
      <StepModeSelect onModeA={vi.fn()} onModeB={vi.fn()} onBack={onBack} />,
    );

    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

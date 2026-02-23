import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import StepApiConfig from "../StepApiConfig";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StepApiConfig", () => {
  it("renders form fields", () => {
    render(
      <StepApiConfig
        initialConfig={{ baseUrl: "", apiKey: "", model: "" }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Model/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
  });

  it("pre-fills from existing config", () => {
    render(
      <StepApiConfig
        initialConfig={{
          baseUrl: "https://api.test.com",
          apiKey: "sk-existing",
          model: "gpt-4o",
        }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/API Base URL/i)).toHaveValue("https://api.test.com");
    expect(screen.getByLabelText(/API Key/i)).toHaveValue("sk-existing");
    expect(screen.getByLabelText(/Model/i)).toHaveValue("gpt-4o");
  });

  it("validates before allowing Next", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <StepApiConfig
        initialConfig={{ baseUrl: "", apiKey: "", model: "" }}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText("API Base URL is required")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with valid config", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <StepApiConfig
        initialConfig={{ baseUrl: "", apiKey: "", model: "" }}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText(/API Base URL/i), "https://api.openai.com/v1");
    await user.type(screen.getByLabelText(/API Key/i), "sk-test");
    await user.type(screen.getByLabelText(/Model/i), "gpt-4o-mini");
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import StepConnTest from "../StepConnTest";

vi.mock("@/shared/lib/storage", () => ({
  getDecryptedApiConfig: vi.fn(),
}));

vi.mock("@/shared/lib/api-client", () => ({
  testConnection: vi.fn(),
}));

import { getDecryptedApiConfig } from "@/shared/lib/storage";
import { testConnection } from "@/shared/lib/api-client";

const mockGetConfig = vi.mocked(getDecryptedApiConfig);
const mockTestConnection = vi.mocked(testConnection);

const fakeConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StepConnTest", () => {
  it("auto-triggers connection test on mount", async () => {
    mockGetConfig.mockResolvedValue(fakeConfig);
    mockTestConnection.mockResolvedValue(true);

    render(<StepConnTest onSuccess={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetConfig).toHaveBeenCalled();
      expect(mockTestConnection).toHaveBeenCalledWith(fakeConfig);
    });
  });

  it("shows success state and enables Next", async () => {
    mockGetConfig.mockResolvedValue(fakeConfig);
    mockTestConnection.mockResolvedValue(true);

    render(<StepConnTest onSuccess={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Connection verified/i)).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it("shows error state with retry button on failure", async () => {
    mockGetConfig.mockResolvedValue(fakeConfig);
    mockTestConnection.mockResolvedValue(false);

    render(<StepConnTest onSuccess={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();

    const nextBtn = screen.getByRole("button", { name: /Next/i });
    expect(nextBtn).toBeDisabled();
  });

  it("shows error when API config is missing", async () => {
    mockGetConfig.mockResolvedValue(undefined);

    render(<StepConnTest onSuccess={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    });

    expect(screen.getByText("API not configured")).toBeInTheDocument();
  });

  it("retry button retries the test", async () => {
    mockGetConfig.mockResolvedValue(fakeConfig);
    mockTestConnection
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const user = userEvent.setup();
    render(<StepConnTest onSuccess={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connection verified/i)).toBeInTheDocument();
    });
  });

  it("Back button calls onBack", async () => {
    mockGetConfig.mockResolvedValue(fakeConfig);
    mockTestConnection.mockResolvedValue(true);
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(<StepConnTest onSuccess={vi.fn()} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

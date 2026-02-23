import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import App from "../App";

let store: Record<string, unknown> = {};

beforeEach(() => {
  store = {};
  vi.clearAllMocks();

  vi.mocked(chrome.storage.local.get).mockImplementation(
    async (keys?: string | string[] | null) => {
      if (typeof keys === "string") return { [keys]: store[keys] };
      return store;
    },
  );

  vi.mocked(chrome.storage.local.set).mockImplementation(
    async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
  );

  (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  (chrome.storage.onChanged.removeListener as ReturnType<typeof vi.fn>).mockImplementation(() => {});
});

describe("Onboarding App", () => {
  it("renders Step 1 (Configure API) initially", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Configure API" })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
  });

  it("shows step indicators with step 1 highlighted", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("step-indicator-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("step-indicator-2")).toBeInTheDocument();
    expect(screen.getByTestId("step-indicator-3")).toBeInTheDocument();
    expect(screen.getByTestId("step-indicator-4")).toBeInTheDocument();
  });

  it("navigates to Step 2 after saving API config", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/API Base URL/i), "https://api.openai.com/v1");
    await user.type(screen.getByLabelText(/API Key/i), "sk-test123");
    await user.type(screen.getByLabelText(/Model/i), "gpt-4o-mini");

    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });
  });
});

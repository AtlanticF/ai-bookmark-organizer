import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/shared/i18n";
import App from "../App";

vi.mock("@/shared/lib/api-client", () => ({
  testConnection: vi.fn(),
}));

import { testConnection } from "@/shared/lib/api-client";

const mockTestConnection = vi.mocked(testConnection);

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

describe("Options Page", () => {
  it("renders all form fields", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Model/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Test Connection/i })).toBeInTheDocument();
  });

  it("shows validation errors for empty fields on submit", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Save/i }));

    expect(screen.getByText("API Base URL is required")).toBeInTheDocument();
    expect(screen.getByText("API Key is required")).toBeInTheDocument();
    expect(screen.getByText("Model is required")).toBeInTheDocument();
  });

  it("shows validation error for invalid URL", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/API Base URL/i), "not-a-url");
    await user.type(screen.getByLabelText(/API Key/i), "sk-test");
    await user.type(screen.getByLabelText(/Model/i), "gpt-4o");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
  });

  it("saves valid form to storage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/API Base URL/i), "https://api.openai.com/v1");
    await user.type(screen.getByLabelText(/API Key/i), "sk-testkey123");
    await user.type(screen.getByLabelText(/Model/i), "gpt-4o-mini");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/saved/i);
    });

    expect(store["api_config"]).toBeDefined();
    const saved = store["api_config"] as { baseUrl: string; model: string };
    expect(saved.baseUrl).toBe("https://api.openai.com/v1");
    expect(saved.model).toBe("gpt-4o-mini");
  });

  it("test connection success shows success toast", async () => {
    const user = userEvent.setup();
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-testkey123",
      model: "gpt-4o-mini",
    };
    mockTestConnection.mockResolvedValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Test Connection/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/successful/i);
    });
  });

  it("test connection failure shows error toast", async () => {
    const user = userEvent.setup();
    store["api_config"] = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-testkey123",
      model: "gpt-4o-mini",
    };
    mockTestConnection.mockResolvedValue(false);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Test Connection/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/failed/i);
    });
  });

  it("toggles API key visibility", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    });

    const keyInput = screen.getByLabelText(/API Key/i);
    expect(keyInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /Show/i }));
    expect(keyInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /Hide/i }));
    expect(keyInput).toHaveAttribute("type", "password");
  });

  it("renders re-run archive button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Archive/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Full Archive/i })).toBeInTheDocument();
    });
  });
});

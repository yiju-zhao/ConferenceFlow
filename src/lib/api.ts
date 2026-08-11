import { auth } from "../firebase";
import type { ApiFetchOptions } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(
      error.error || response.statusText || `API error: ${response.status}`,
      response.status,
      error.code,
      error.retryable === true,
    );
  }

  return response.json() as Promise<T>;
}

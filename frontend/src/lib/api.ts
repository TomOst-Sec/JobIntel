const API_BASE = "/api/v1";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// FastAPI returns validation errors as an array of { loc, msg, type } objects.
// This function normalizes detail into a human-readable string.
function parseErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((err) => {
        if (typeof err === "string") return err;
        if (err && typeof err === "object" && "msg" in err) {
          const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : "";
          return field ? `${field}: ${err.msg}` : String(err.msg);
        }
        return String(err);
      })
      .join(". ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "";
}

// Prevent concurrent refresh attempts
let refreshPromise: Promise<boolean> | null = null;

// function to get cookie
function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return match[2];
  return null;
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

// Public paths that should never trigger a login redirect
const PUBLIC_PATHS = ["/", "/login", "/signup", "/pricing", "/ghost-check", "/salary-check", "/reports", "/demo"];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + "/"));
}

function clearAuthAndRedirect() {
  const path = window.location.pathname;
  if (!isPublicPath(path)) {
    window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
  }
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const csrfToken = getCookie("csrf_token");
  if (csrfToken && options.method && !["GET", "HEAD", "OPTIONS", "TRACE"].includes(options.method.toUpperCase())) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  const res = await fetch(`${API_BASE}${path}`, fetchOptions);

  if (res.status === 401) {
    // Try refreshing the token (deduplicate concurrent attempts)
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      // Retry Request
      const retryRes = await fetch(`${API_BASE}${path}`, fetchOptions);
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({ detail: retryRes.statusText }));
        if (retryRes.status === 401) clearAuthAndRedirect();
        throw new ApiError(parseErrorDetail(body.detail) || "Request failed", retryRes.status);
      }
      return retryRes.json();
    } else {
      clearAuthAndRedirect();
      throw new ApiError("Session expired", 401);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(parseErrorDetail(body.detail) || "Request failed", res.status);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => fetchApi<T>(path),
  post: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    fetchApi<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => fetchApi<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = {};

    const csrfToken = getCookie("csrf_token");
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });

    if (res.status === 401) {
      clearAuthAndRedirect();
      throw new ApiError("Session expired", 401);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(parseErrorDetail(body.detail) || "Upload failed", res.status);
    }
    return res.json();
  },
};

export { ApiError };

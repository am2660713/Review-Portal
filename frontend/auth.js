const apiHost = window.location.hostname || "localhost";
const apiProtocol = window.location.protocol === "https:" ? "https:" : "http:";
export const API_BASE = `${apiProtocol}//${apiHost}:3000`;

export function getToken() { return localStorage.getItem("token") || ""; }
export function getUser() { const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw) : null; }
export function setSession(token, user) { localStorage.setItem("token", token); localStorage.setItem("user", JSON.stringify(user)); }
export function clearSession() { localStorage.removeItem("token"); localStorage.removeItem("user"); }

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Unable to reach server. Check backend is running and reachable.");
  }

  const rawText = await res.text();
  let data = {};
  if (rawText) {
    try { data = JSON.parse(rawText); } catch { data = { error: rawText.slice(0, 180) }; }
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function requireRole(role) {
  const user = getUser();
  if (!user || user.role !== role) window.location.href = "/";
}

export function requireAnyRole(roles) {
  const user = getUser();
  if (!user || !roles.includes(user.role)) window.location.href = "/";
}

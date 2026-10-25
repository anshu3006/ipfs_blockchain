// API service
// Calls the Express backend. The JWT from wallet login is attached to every request.
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");

let token = null;

export function setToken(value) {
  token = value;
}

async function request(path, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload });
  } catch {
    throw new Error(`Cannot reach the backend at ${BASE}. Is \`npm start\` running in backend/?`);
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* not JSON */
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return raw ? res : res.json();
}

function query(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? "?" + new URLSearchParams(entries).toString() : "";
}

export const api = {
  health: () => request("/health"),

  nonce: (address) => request(`/auth/nonce/${address}`),
  verify: (address, signature) => request("/auth/verify", { method: "POST", body: { address, signature } }),
  me: () => request("/auth/me"),

  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/files/upload", { method: "POST", body: form });
  },
  myFiles: () => request("/files/mine"),
  sharedFiles: () => request("/files/shared"),
  managedFiles: () => request("/files/managed"),
  file: (id) => request(`/files/${id}`),
  delegates: (id) => request(`/files/${id}/delegates`),

  /** Returns the decrypted file as a Blob, only if the contract allows it. */
  download: (id) => fetchFile(`/files/${id}/download`, `file-${id}`),

  versions: (id) => request(`/files/${id}/versions`),
  /** Owner only; fails with 410 when that version's key was destroyed by a rotation. */
  downloadVersion: (id, n) => fetchFile(`/files/${id}/versions/${n}/download`, `file-${id}.v${n}`),
  uploadVersion: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/files/${id}/versions`, { method: "POST", body: form });
  },
  prepareRotation: (id, reason) => request(`/files/${id}/rotate/prepare`, { method: "POST", body: { reason } }),
  commitRotation: (id, oldCid) => request(`/files/${id}/rotate/commit`, { method: "POST", body: { oldCid } }),

  checkAccess: (id, address) => request(`/access/${id}/check${query({ address })}`),
  user: (address) => request(`/access/user/${address}`),
  audit: (filters) => request(`/access/audit${query(filters)}`),
};

async function fetchFile(path, fallbackName) {
  const res = await request(path, { raw: true });
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    blob: await res.blob(),
    name: match ? decodeURIComponent(match[1]) : fallbackName,
    verified: res.headers.get("X-Content-Hash-Verified") === "true",
  };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

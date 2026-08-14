// api/_blob.js
// Thin wrapper around @vercel/blob's private-storage `get()`, grouped as a
// method on a plain object so tests can mock it with
// `mock.method(blobClient, 'get', ...)` — the real ZIP is never touched by
// this phase; this only defines how the download endpoint will fetch it.

import { get } from "@vercel/blob";

export const blobClient = {
  async get(pathname) {
    return get(pathname, { access: "private" });
  },
};

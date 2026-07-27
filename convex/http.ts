import { httpRouter } from "convex/server";

// Auth no longer routes through here — Firebase's SDK owns the sign-in popup and
// mints the ID token; Convex validates it via convex/auth.config.ts. This router
// stays as the mount point for future HTTP endpoints (notification callbacks,
// third-party webhooks).
const http = httpRouter();

export default http;

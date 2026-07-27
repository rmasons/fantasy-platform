import type { AuthConfig } from "convex/server";

// Firebase Auth is the identity provider, wired as a standard OIDC provider.
// Convex validates Firebase ID tokens itself against Google's public JWKS —
// there is no firebase-admin dependency and no service-account key on this side.
//
// Firebase ID tokens carry:
//   iss: https://securetoken.google.com/<project-id>   → `domain`
//   aud: <project-id>                                   → `applicationID`
// Both must match exactly. Set the project id on the Convex deployment with:
//   npx convex env set FIREBASE_PROJECT_ID <project-id>
//
// Same Firebase project as fantasy-tds, deliberately: shared UIDs let the
// existing user↔Sleeper links migrate as-is and let both apps run side by side
// during cutover. See docs/decisions/0001-auth-provider-and-native-clients.md.
const projectId = process.env.FIREBASE_PROJECT_ID!;

export default {
  providers: [
    {
      domain: `https://securetoken.google.com/${projectId}`,
      applicationID: projectId,
    },
  ],
} satisfies AuthConfig;

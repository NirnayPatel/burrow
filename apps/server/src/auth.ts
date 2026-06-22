import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db.js";
import { orgs, userOrgs } from "@burrow/core";
import { seedFirstSpec } from "./seed.js";

// Self-host posture: email+password works out of the box with zero external
// services. OAuth providers are opt-in via env. Email verification needs an
// SMTP story — milestone 7 (self-host GA), not now.
export const auth = betterAuth({
  baseURL: process.env.SERVER_URL ?? "http://localhost:8787",
  secret: process.env.AUTH_SECRET ?? "dev-only-secret-change-me",
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:3000"],
  databaseHooks: {
    user: {
      create: {
        // Every new user gets a workspace org; invites/multi-org are post-MVP
        after: async (newUser) => {
          const [org] = await db
            .insert(orgs)
            .values({ name: `${newUser.name}'s workspace` })
            .returning();
          await db.insert(userOrgs).values({
            userId: newUser.id,
            orgId: org.id,
            role: "admin",
          });
          // First-run: hand the new workspace a starter Spec (D3 seed template)
          await seedFirstSpec(org.id, newUser.id);
        },
      },
    },
  },
});

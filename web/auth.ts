/**
 * Sign-in for the application tier.
 *
 * Two ways in, and they have to agree on one user: GitHub for people who would
 * rather not have another password, and email plus password for people who
 * cannot use GitHub from where they are. The adapter keeps both on the same
 * User row, so a workspace membership means the same thing whichever door was
 * used.
 *
 * AUTH_SECRET, AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are read by Auth.js from
 * the environment by name, which is why nothing here looks them up. See
 * .env.example.
 */

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { prisma } from "./lib/db";
import { verifyPassword } from "./lib/password";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  // Credentials sign-in cannot use database sessions: Auth.js only writes a
  // Session row for flows that go through the adapter, and this one does not.
  // Both providers therefore share the JWT strategy, so that a session behaves
  // the same way whichever provider issued it.
  session: { strategy: "jwt" },
  providers: [
    // Email linking is left off. Someone who holds a GitHub account with an
    // address already registered here would otherwise take over that account by
    // signing in, so the two are linked deliberately or not at all.
    GitHub,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Returns null for every kind of failure. A thrown error would reach the
       * sign-in page as a distinct code and turn the form into a way of asking
       * whether an address is registered.
       */
      async authorize(credentials) {
        const email = asString(credentials?.email).trim();
        const password = asString(credentials?.password);
        if (!email || !password) return null;

        // Matched as stored. Folding case here would only be correct if every
        // write folded too, and it is the column's uniqueness that decides that.
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        });
        // Checked even when there is no row. verifyPassword costs the same
        // either way, and returning early here would let the time a refusal
        // took answer the question the uniform null is meant to withhold.
        const ok = await verifyPassword(password, user?.passwordHash);
        if (!user || !ok) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    /**
     * The user id travels in the token's subject, which is the only part of the
     * session the rest of the application needs: every permission decision
     * starts from a user id and a workspace id.
     */
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

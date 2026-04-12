import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("[auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set - Google OAuth will not work")
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        const { prisma } = await import("@/lib/prisma")
        await prisma.userDebateBalance.create({
          data: {
            userId: user.id,
            freeDebatesResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
          },
        }).catch((err: unknown) => {
          if (err instanceof Error && !("code" in err && (err as { code: string }).code === "P2002")) {
            console.error("[auth] Failed to create debate balance:", err)
          }
        })
      }
    },
  },
})

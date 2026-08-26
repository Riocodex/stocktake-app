import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { ROLES, type Role } from "@/lib/constants";

const COOKIE_NAME = "tribe_session";
const SESSION_DAYS = 7;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set it in .env (see .env.example).",
    );
  }
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  outletId: string | null;
  outletName: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    userId = payload.sub;
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { outlet: { select: { name: true } } },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    outletId: user.outletId,
    outletName: user.outlet?.name ?? null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== ROLES.SUPER_ADMIN) redirect("/app");
  return user;
}

export function isSuperAdmin(user: SessionUser) {
  return user.role === ROLES.SUPER_ADMIN;
}

/**
 * Resolves which outlet a request may read.
 *
 * Outlet admins are hard-locked to their own outlet regardless of what the
 * query string asks for. Super admins may target any outlet, or pass nothing
 * to mean "all outlets".
 */
export function resolveOutletScope(
  user: SessionUser,
  requestedOutletId?: string | null,
): { outletId: string | null; canSeeAll: boolean } {
  if (isSuperAdmin(user)) {
    return {
      outletId: requestedOutletId && requestedOutletId !== "all" ? requestedOutletId : null,
      canSeeAll: true,
    };
  }
  return { outletId: user.outletId, canSeeAll: false };
}

/** Throws if an outlet admin tries to act on an outlet that is not theirs. */
export function assertOutletAccess(user: SessionUser, outletId: string) {
  if (isSuperAdmin(user)) return;
  if (user.outletId !== outletId) {
    throw new Error("You do not have access to this outlet.");
  }
}

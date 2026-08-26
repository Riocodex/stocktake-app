"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { ROLES } from "@/lib/constants";

export type LoginState = { error: string | null };

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Same message for unknown email and wrong password so the form cannot be
  // used to discover which accounts exist.
  const invalid = { error: "Those details do not match an account." };

  if (!user || !user.isActive) return invalid;

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) return invalid;

  if (user.role === ROLES.OUTLET_ADMIN && !user.outletId) {
    return { error: "Your account is not linked to an outlet yet. Ask a super admin to assign one." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession(user.id);
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "LOGIN",
      detail: user.email,
    },
  });

  redirect("/app");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

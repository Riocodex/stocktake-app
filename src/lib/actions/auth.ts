"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { createSession, destroySession, loginWithPassword } from "@/lib/auth";

export type LoginState = { error: string | null };

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await loginWithPassword(email, password);
  if (!result.ok) return { error: result.error };

  await createSession(result.user.id);
  await prisma.activityLog.create({
    data: {
      userId: result.user.id,
      outletId: result.user.outletId,
      action: "LOGIN",
      detail: result.user.email,
    },
  });

  redirect("/app");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

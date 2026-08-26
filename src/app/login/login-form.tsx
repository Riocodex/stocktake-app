"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

const INITIAL: LoginState = { error: null };

const DEMO_ACCOUNTS = [
  { email: "super@tribemalta.com", label: "Super admin · all outlets" },
  { email: "valletta@tribemalta.com", label: "Outlet admin · Valletta" },
  { email: "naxxar@tribemalta.com", label: "Outlet admin · Naxxar" },
];

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="eyebrow mb-2 block text-ink-muted"
          >
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue="super@tribemalta.com"
            placeholder="you@tribemalta.com"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-clay"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="eyebrow mb-2 block text-ink-muted"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="tribe1234"
            placeholder="••••••••"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-clay"
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="rounded-2xl border border-sage-100 bg-sage-50/60 p-4">
        <p className="eyebrow text-sage-800">Demo accounts</p>
        <ul className="mt-3 space-y-1.5 text-xs text-ink-soft">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex flex-wrap gap-x-2">
              <code className="font-semibold text-ink">{account.email}</code>
              <span className="text-ink-muted">{account.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Password for every demo account:{" "}
          <code className="font-semibold text-ink">tribe1234</code>
        </p>
      </div>
    </div>
  );
}

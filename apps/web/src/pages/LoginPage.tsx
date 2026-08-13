import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginInput } from "@resitku/shared";
import { loginSchema } from "@resitku/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(input: LoginInput): Promise<void> {
    setServerError(null);

    try {
      await login(input);
      void navigate("/", { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Log masuk gagal. Cuba lagi.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Log masuk ke Resitku</h1>

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="mt-6 space-y-4"
          noValidate
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Emel
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Kata laluan
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          {serverError !== null && <p className="text-sm text-red-600">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? "Log masuk…" : "Log masuk"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Belum ada akaun?{" "}
          <Link to="/register" className="font-medium text-slate-900 underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  );
}

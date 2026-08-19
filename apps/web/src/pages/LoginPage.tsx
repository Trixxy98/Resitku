import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginInput } from "@resitku/shared";
import { loginSchema } from "@resitku/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import { errorClass, fieldClass, labelClass, mutedClass, primaryButtonClass } from "../lib/formStyles";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl text-amber">Resitku</p>
        <h1 className="mt-2 text-xl font-semibold text-paper">Snap resit. Jejak belanja.</h1>

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="mt-8 space-y-4 rounded-2xl border border-line bg-ink-2 p-6"
          noValidate
        >
          <div>
            <label htmlFor="email" className={labelClass}>
              Emel
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              className={fieldClass}
            />
            {errors.email && <p className={`mt-1 ${errorClass}`}>{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              Kata laluan
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className={fieldClass}
            />
            {errors.password && <p className={`mt-1 ${errorClass}`}>{errors.password.message}</p>}
          </div>

          {serverError !== null && <p className={errorClass}>{serverError}</p>}

          <button type="submit" disabled={isSubmitting} className={`w-full ${primaryButtonClass}`}>
            {isSubmitting ? "Log masuk…" : "Log masuk"}
          </button>
        </form>

        <p className={`mt-4 text-center ${mutedClass}`}>
          Belum ada akaun?{" "}
          <Link to="/register" className="font-medium text-amber hover:underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  );
}

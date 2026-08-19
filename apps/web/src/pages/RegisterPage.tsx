import { zodResolver } from "@hookform/resolvers/zod";
import type { RegisterInput } from "@resitku/shared";
import { registerSchema } from "@resitku/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import { errorClass, fieldClass, labelClass, mutedClass, primaryButtonClass } from "../lib/formStyles";

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(input: RegisterInput): Promise<void> {
    setServerError(null);

    try {
      await registerUser(input);
      void navigate("/", { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Pendaftaran gagal. Cuba lagi.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl text-amber">Resitku</p>
        <h1 className="mt-2 text-xl font-semibold text-paper">Buat akaun, mula snap resit.</h1>

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="mt-8 space-y-4 rounded-2xl border border-line bg-ink-2 p-6"
          noValidate
        >
          <div>
            <label htmlFor="name" className={labelClass}>
              Nama
            </label>
            <input id="name" type="text" autoComplete="name" {...register("name")} className={fieldClass} />
            {errors.name && <p className={`mt-1 ${errorClass}`}>{errors.name.message}</p>}
          </div>

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
              autoComplete="new-password"
              {...register("password")}
              className={fieldClass}
            />
            {errors.password && <p className={`mt-1 ${errorClass}`}>{errors.password.message}</p>}
            <p className="mt-1 text-xs text-mute">Sekurang-kurangnya 12 aksara.</p>
          </div>

          {serverError !== null && <p className={errorClass}>{serverError}</p>}

          <button type="submit" disabled={isSubmitting} className={`w-full ${primaryButtonClass}`}>
            {isSubmitting ? "Mendaftar…" : "Daftar"}
          </button>
        </form>

        <p className={`mt-4 text-center ${mutedClass}`}>
          Sudah ada akaun?{" "}
          <Link to="/login" className="font-medium text-amber hover:underline">
            Log masuk
          </Link>
        </p>
      </div>
    </div>
  );
}

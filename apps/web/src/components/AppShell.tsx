import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    await logout();
    void navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <NavLink to="/" className="text-lg font-semibold text-slate-900">
              Resitku
            </NavLink>
            <nav className="flex gap-3 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-800"
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/transactions/new"
                className={({ isActive }) =>
                  isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-800"
                }
              >
                Transaksi
              </NavLink>
              <NavLink
                to="/receipts"
                className={({ isActive }) =>
                  isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-800"
                }
              >
                Resit
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Log keluar
            </button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

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
    <div className="min-h-screen text-paper">
      <header className="border-b border-line bg-ink-2/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-5">
            <NavLink to="/" className="font-display text-xl tracking-tight text-amber">
              Resitku
            </NavLink>
            <nav className="flex gap-4 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive ? "font-medium text-paper" : "text-mute hover:text-paper"
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/receipts"
                className={({ isActive }) =>
                  isActive ? "font-medium text-paper" : "text-mute hover:text-paper"
                }
              >
                Resit
              </NavLink>
              <NavLink
                to="/transactions/new"
                className={({ isActive }) =>
                  isActive ? "font-medium text-paper" : "text-mute hover:text-paper"
                }
              >
                Manual
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-mute">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-xl border border-line px-3 py-1.5 text-paper hover:bg-ink-3"
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

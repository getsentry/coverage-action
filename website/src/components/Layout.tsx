import { CircleGauge } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { TokenButton } from "./TokenButton";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Shared nav bar */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl flex h-14 items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity"
          >
            <CircleGauge className="h-5 w-5" />
            <span>Coverage Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <TokenButton />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Shared footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-7xl px-6">
          This dashboard works with repositories using the{" "}
          <a
            href="https://github.com/getsentry/coverage-action"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Coverage Action
          </a>
        </div>
      </footer>
    </div>
  );
}

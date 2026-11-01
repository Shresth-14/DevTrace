import { LogoMark } from "@/components/LogoMark";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-lp-line px-6 py-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-sm text-lp-mute sm:flex-row">
        <Link href="/" className="flex items-center gap-2.5 text-lp-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2D3627] ring-1 ring-lp-glow/30">
            <LogoMark />
          </span>
          <span className="font-semibold tracking-tight">Dev Trace</span>
        </Link>

        <nav aria-label="Footer" className="flex items-center gap-6">
          <a
            href="https://github.com/Shresth-14/DevTrace"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-lp-ink"
          >
            GitHub
          </a>
          <a href="#login" className="transition-colors hover:text-lp-ink">
            Sign in
          </a>
          <a href="#signup" className="transition-colors hover:text-lp-ink">
            Sign up
          </a>
        </nav>

        <p className="font-mono text-xs">© 2026 Dev Trace · MIT licence</p>
      </div>
    </footer>
  );
}

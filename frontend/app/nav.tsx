"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";

const LINKS = [
  { href: "/", label: "home" },
  { href: "/radar", label: "radar" },
  { href: "/map", label: "map" },
  { href: "/programs", label: "programs" },
];

export default function Nav() {
  const path = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <nav className="nav">
      <span className="site-logo">
        <Link href="/" style={{ color: "inherit" }}>grant_radar</Link>
      </span>

      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`nav-link${path === l.href ? " active" : ""}`}
        >
          {l.label}
        </Link>
      ))}

      <div className="nav-controls">
        <button className="theme-toggle" onClick={toggle} title="Toggle theme">
          {theme === "dark" ? "☀" : "◑"}
        </button>
      </div>
    </nav>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";

const LINKS = [
  { href: "/",         label: "home" },
  { href: "/radar",    label: "radar" },
  { href: "/map",      label: "map" },
  { href: "/programs", label: "programs" },
  { href: "/quality",  label: "quality", green: true },
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
          {"green" in l && l.green && (
            <span style={{
              display: "inline-block", width: 6, height: 6,
              borderRadius: "50%", background: "var(--success)",
              marginLeft: 5, verticalAlign: "middle",
            }} />
          )}
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

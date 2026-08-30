"use client";

import {
  CalendarDays,
  BellRing,
  ClipboardList,
  ExternalLink,
  FileImage,
  FileText,
  Gift,
  LayoutDashboard,
  LogOut,
  Settings,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { canCmsRole, getCmsRoleLabel } from "@/domain/cms/permissions";
import type { CmsRole } from "@/domain/cms/types";
import { BrandMark } from "@/components/ui/BrandMark";

import styles from "./CmsShell.module.css";

type CmsShellProps = {
  readonly children: ReactNode;
  readonly mode: "mock" | "mongodb";
  readonly user: {
    readonly displayName: string;
    readonly email: string;
    readonly role: CmsRole;
  };
};

const navigation = [
  { href: "/cms", label: "Overview", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/cms/search", label: "Search", icon: Search, permission: "dashboard:view" },
  { href: "/cms/bookings", label: "Bookings", icon: ClipboardList, permission: "bookings:view" },
  { href: "/cms/notifications", label: "Notifications", icon: BellRing, permission: "bookings:view" },
  { href: "/cms/calendar", label: "Calendar", icon: CalendarDays, permission: "calendar:view" },
  { href: "/cms/services", label: "Services", icon: Sparkles, permission: "content:view" },
  { href: "/cms/vouchers", label: "Vouchers", icon: Gift, permission: "content:view" },
  { href: "/cms/content", label: "Website", icon: FileText, permission: "content:view" },
  { href: "/cms/team", label: "Team", icon: Users, permission: "content:view" },
  { href: "/cms/media", label: "Media", icon: FileImage, permission: "content:view" },
  { href: "/cms/settings", label: "Settings", icon: Settings, permission: "settings:view" },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/cms" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function CmsShell({ children, mode, user }: CmsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const allowedNavigation = navigation.filter((item) =>
    canCmsRole(user.role, item.permission),
  );

  async function logOut() {
    setLoggingOut(true);

    try {
      await fetch("/api/cms/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      router.replace("/cms/login");
      router.refresh();
    }
  }

  return (
    <div className={styles.canvas}>
      <a className={styles.skipLink} href="#cms-main">
        Skip to CMS content
      </a>

      <aside className={styles.sidebar}>
        <Link aria-label="Siriranee CMS overview" className={styles.brand} href="/cms">
          <BrandMark />
        </Link>

        <div className={styles.workspaceLabel}>
          <span>Content & bookings</span>
          <strong>Admin workspace</strong>
        </div>

        <nav aria-label="CMS navigation" className={styles.navigation}>
          {allowedNavigation.map(({ href, icon: Icon, label }) => {
            const active = isActivePath(pathname, href);

            return (
              <Link aria-current={active ? "page" : undefined} className={active ? styles.activeNav : undefined} href={href} key={href}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.identity}>
            <span aria-hidden="true">
              {user.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <strong>{user.displayName}</strong>
              <small>{getCmsRoleLabel(user.role)}</small>
            </div>
          </div>
          <Link href="/" rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" />
            View website
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
          <button disabled={loggingOut} onClick={logOut} type="button">
            <LogOut aria-hidden="true" />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <div className={styles.workspace}>
        {mode === "mock" ? (
          <div className={styles.mockBanner} role="note">
            <strong>Local mock CMS</strong>
            <span>Fictional data only. Changes reset when the server restarts.</span>
          </div>
        ) : null}

        <header className={styles.mobileHeader}>
          <Link aria-label="Siriranee CMS overview" href="/cms">
            <BrandMark compact />
          </Link>
          <div className={styles.mobileActions}>
            <span>Admin workspace</span>
            <Link
              aria-label="View website in a new tab"
              href="/"
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" />
            </Link>
            <button
              aria-label={loggingOut ? "Signing out" : "Sign out"}
              disabled={loggingOut}
              onClick={logOut}
              type="button"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        <nav aria-label="CMS mobile navigation" className={styles.mobileNavigation}>
          {allowedNavigation.map(({ href, label }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link aria-current={active ? "page" : undefined} className={active ? styles.activeMobileNav : undefined} href={href} key={href}>
                {label}
              </Link>
            );
          })}
        </nav>

        <main className={styles.main} id="cms-main">
          {children}
        </main>
      </div>
    </div>
  );
}

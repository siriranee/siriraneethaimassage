"use client";

import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { canCmsRole, getCmsRoleLabel } from "@/domain/cms/permissions";
import type { CmsNotificationBellItem, CmsRole } from "@/domain/cms/types";
import { BrandMark } from "@/components/ui/BrandMark";
import { CmsNotificationBell } from "./CmsNotificationBell";

import styles from "./CmsShell.module.css";

type CmsShellProps = {
  readonly children: ReactNode;
  readonly mode: "mock" | "mongodb";
  readonly notifications: readonly CmsNotificationBellItem[];
  readonly user: {
    readonly displayName: string;
    readonly username: string;
    readonly role: CmsRole;
  };
};

const navigation = [
  { href: "/cms", label: "Overview", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/cms/bookings", label: "Bookings", icon: ClipboardList, permission: "bookings:view" },
  { href: "/cms/calendar", label: "Calendar", icon: CalendarDays, permission: "calendar:view" },
  { href: "/cms/services", label: "Services", icon: Sparkles, permission: "content:view" },
  { href: "/cms/vouchers", label: "Vouchers", icon: Gift, permission: "content:view" },
  { href: "/cms/settings", label: "Settings", icon: Settings, permission: "settings:view" },
  { href: "/cms/admin", label: "Admin", icon: ShieldCheck, permission: "users:manage" },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/cms" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function CmsShell({ children, mode, notifications, user }: CmsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const drawerOpen = drawerPath === pathname;
  const allowedNavigation = navigation.filter((item) =>
    canCmsRole(user.role, item.permission),
  );
  const canViewNotifications = canCmsRole(user.role, "bookings:view");
  const currentSection = allowedNavigation.find((item) =>
    isActivePath(pathname, item.href),
  )?.label ?? "Admin workspace";

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDrawerPath(null);
      menuButtonRef.current?.focus();
    }

    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [drawerOpen]);

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

      {canViewNotifications ? (
        <CmsNotificationBell
          items={notifications}
          offsetForBanner={mode === "mock"}
          placement="desktop"
        />
      ) : null}

      <header className={styles.topbar}>
        <div className={styles.topbarPrimary}>
          <button
            aria-controls="cms-navigation-drawer"
            aria-expanded={drawerOpen}
            aria-label="Open CMS navigation"
            className={styles.menuButton}
            onClick={() => setDrawerPath(pathname)}
            ref={menuButtonRef}
            type="button"
          >
            <Menu aria-hidden="true" />
          </button>
          <Link aria-label="Siriranee CMS overview" className={styles.topbarBrand} href="/cms">
            <BrandMark compact />
          </Link>
          <div className={styles.topbarTitle}>
            <span>Siriranee CMS</span>
            <strong>{currentSection}</strong>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <Link aria-label="View website in a new tab" href="/" rel="noreferrer" target="_blank">
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
          {canViewNotifications ? (
            <CmsNotificationBell items={notifications} placement="mobile" />
          ) : null}
        </div>
      </header>

      <button
        aria-label="Close CMS navigation"
        className={styles.backdrop}
        hidden={!drawerOpen}
        onClick={() => {
          setDrawerPath(null);
          menuButtonRef.current?.focus();
        }}
        tabIndex={-1}
        type="button"
      />

      <aside
        aria-label="CMS navigation drawer"
        className={styles.sidebar}
        data-open={drawerOpen}
        id="cms-navigation-drawer"
        inert={!drawerOpen}
      >
        <div className={styles.drawerHeader}>
          <Link aria-label="Siriranee CMS overview" className={styles.brand} href="/cms">
            <BrandMark />
          </Link>
          <button
            aria-label="Close CMS navigation"
            className={styles.closeButton}
            onClick={() => {
              setDrawerPath(null);
              menuButtonRef.current?.focus();
            }}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className={styles.workspaceLabel}>
          <span>Content & bookings</span>
          <strong>Admin workspace</strong>
        </div>

        <nav aria-label="CMS navigation" className={styles.navigation}>
          {allowedNavigation.map(({ href, icon: Icon, label }) => {
            const active = isActivePath(pathname, href);

            return (
              <Link aria-current={active ? "page" : undefined} className={active ? styles.activeNav : undefined} href={href} key={href} onClick={() => setDrawerPath(null)}>
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
              <small>@{user.username} · {getCmsRoleLabel(user.role)}</small>
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

        <main className={styles.main} id="cms-main">
          {children}
        </main>
      </div>
    </div>
  );
}

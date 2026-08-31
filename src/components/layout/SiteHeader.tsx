"use client";

import {
  CalendarDays,
  ChevronDown,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/ui/BrandMark";
import type { PublicSiteData } from "@/domain/public-site";

import { headerNavigation } from "./navigation";
import styles from "./SiteHeader.module.css";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function SiteHeader({ site }: Readonly<{ site: PublicSiteData }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [treatmentsOpen, setTreatmentsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const treatmentsMenuRef = useRef<HTMLDivElement>(null);
  const treatmentsButtonRef = useRef<HTMLButtonElement>(null);
  const whatsappUrl = site.contact.whatsapp.url;
  const treatmentNavigation = site.treatments;

  useEffect(() => {
    if (!treatmentsOpen) {
      return;
    }

    const closeIfOutside = (event: PointerEvent | FocusEvent) => {
      if (
        event.target instanceof Node &&
        !treatmentsMenuRef.current?.contains(event.target)
      ) {
        setTreatmentsOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setTreatmentsOpen(false);
      treatmentsButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", closeWithEscape);

    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [treatmentsOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const body = document.body;
    const root = document.documentElement;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const previousOverscrollBehavior = root.style.overscrollBehavior;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const bodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    ) || 0;
    const inertTargets = [
      document.getElementById("main-content"),
      document.querySelector("footer"),
      document.getElementById("contact-fab"),
    ].filter((target): target is HTMLElement => target instanceof HTMLElement);
    const previousInert = inertTargets.map((target) => target.inert);

    body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
    inertTargets.forEach((target) => {
      target.inert = true;
    });

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      root.style.overscrollBehavior = previousOverscrollBehavior;
      inertTargets.forEach((target, index) => {
        target.inert = previousInert[index];
      });
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      menuButtonRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const drawerElements = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        const focusableElements = menuButtonRef.current
          ? [menuButtonRef.current, ...drawerElements]
          : drawerElements;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      setMenuOpen(false);
      window.requestAnimationFrame(() => {
        menuButtonRef.current?.focus({ preventScroll: true });
      });
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setTreatmentsOpen(false);
    window.requestAnimationFrame(() => {
      menuButtonRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <header className={styles.header}>
      <div className={`container ${styles.mainBar}`}>
        <Link aria-label="Siriranee home" className={styles.logo} href="/" onClick={() => setTreatmentsOpen(false)}>
          <BrandMark />
        </Link>

        <nav aria-label="Main navigation" className={styles.desktopNav}>
          {headerNavigation.map((item) =>
            item.href === "/services" ? (
              <div className={styles.desktopTreatments} key={item.href} ref={treatmentsMenuRef}>
                <Link
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={`${styles.treatmentsIndex} ${
                    isActive(pathname, item.href) ? styles.active : ""
                  }`}
                  href={item.href}
                  onClick={() => setTreatmentsOpen(false)}
                >
                  {item.label}
                </Link>
                <button
                  aria-controls="desktop-treatments-menu"
                  aria-expanded={treatmentsOpen}
                  aria-haspopup="true"
                  aria-label={`${treatmentsOpen ? "Close" : "Open"} treatments menu`}
                  className={styles.treatmentsToggle}
                  onClick={() => setTreatmentsOpen((open) => !open)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown") {
                      return;
                    }

                    event.preventDefault();
                    setTreatmentsOpen(true);
                    window.requestAnimationFrame(() => {
                      treatmentsMenuRef.current?.querySelector<HTMLAnchorElement>(
                        `#desktop-treatments-menu a`,
                      )?.focus();
                    });
                  }}
                  ref={treatmentsButtonRef}
                  type="button"
                >
                  <ChevronDown aria-hidden="true" />
                </button>
                <div
                  aria-hidden={!treatmentsOpen}
                  className={`${styles.treatmentsDropdown} ${
                    treatmentsOpen ? styles.treatmentsDropdownOpen : ""
                  }`}
                  id="desktop-treatments-menu"
                >
                  <Link className={styles.allTreatmentsLink} href="/services" onClick={() => setTreatmentsOpen(false)}>
                    View all treatments
                  </Link>
                  {treatmentNavigation.map((treatment) => (
                    <Link
                      aria-current={pathname === treatment.href ? "page" : undefined}
                      className={pathname === treatment.href ? styles.dropdownActive : undefined}
                      href={treatment.href}
                      key={treatment.href}
                      onClick={() => setTreatmentsOpen(false)}
                    >
                      {treatment.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={isActive(pathname, item.href) ? styles.active : undefined}
                href={item.href}
                key={item.href}
                onClick={() => setTreatmentsOpen(false)}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className={styles.actions}>
          <Link className={styles.bookButton} href="/book" onClick={() => setTreatmentsOpen(false)}>
            <CalendarDays aria-hidden="true" />
            <span>Book Now</span>
          </Link>
          <button
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            className={styles.menuButton}
            onClick={() => setMenuOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <button
        aria-label="Close navigation"
        aria-hidden={!menuOpen}
        className={`${styles.backdrop} ${menuOpen ? styles.backdropOpen : ""}`}
        onClick={closeMenu}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-modal="true"
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
        className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ""}`}
        id="mobile-navigation"
        inert={!menuOpen}
        ref={drawerRef}
        role="dialog"
      >
        <div aria-hidden="true" className={styles.drawerTop} />
        <nav aria-label="Mobile navigation links" className={styles.mobileNav}>
          {headerNavigation.map((item) =>
            item.href === "/services" ? (
              <div className={styles.mobileTreatments} key={item.href}>
                <Link
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={isActive(pathname, item.href) ? styles.mobileActive : undefined}
                  href={item.href}
                  onClick={closeMenu}
                >
                  {item.label}
                  <span>View all</span>
                </Link>
                <ul aria-label="Treatments">
                  {treatmentNavigation.map((treatment) => (
                    <li key={treatment.href}>
                      <Link
                        aria-current={pathname === treatment.href ? "page" : undefined}
                        className={
                          pathname === treatment.href ? styles.mobileTreatmentActive : undefined
                        }
                        href={treatment.href}
                        onClick={closeMenu}
                      >
                        {treatment.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Link
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={isActive(pathname, item.href) ? styles.mobileActive : undefined}
                href={item.href}
                key={item.href}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className={styles.drawerContact}>
          <Link className={styles.drawerBook} href="/book" onClick={closeMenu}>
            <CalendarDays aria-hidden="true" /> Book Now
          </Link>
          <a href={site.contact.phone.href}>
            <Phone aria-hidden="true" /> {site.contact.phone.display}
          </a>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden="true" /> WhatsApp<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          <a href={site.address.directionsUrl} target="_blank" rel="noreferrer">
            <MapPin aria-hidden="true" /> Get directions<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </aside>
    </header>
  );
}

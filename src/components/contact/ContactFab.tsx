"use client";

import { MessageCircle, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import type { PublicSiteData } from "@/domain/public-site";

import styles from "./ContactFab.module.css";

type ContactAction = {
  readonly detail: string;
  readonly external?: boolean;
  readonly href: string;
  readonly icon?: LucideIcon;
  readonly iconSrc?: string;
  readonly label: string;
};

export function ContactFab({ site }: Readonly<{ site: PublicSiteData }>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const actionsId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const whatsappUrl = site.contact.whatsapp.url;
  const email = site.contact.email;
  const instagram = site.social.instagram;

  const actions: readonly ContactAction[] = [
    {
      detail: site.contact.phone.internationalDisplay,
      href: site.contact.phone.href,
      iconSrc: "/icons/Phone-2.png",
      label: "Call Siriranee",
    },
    ...(whatsappUrl
      ? ([
          {
            detail: "Message the team",
            external: true,
            href: whatsappUrl,
            icon: MessageCircle,
            label: "WhatsApp",
          },
        ] satisfies readonly ContactAction[])
      : []),
    ...(email
      ? ([
          {
            detail: email.address,
            href: email.href,
            iconSrc: "/icons/Email.png",
            label: "Email",
          },
        ] satisfies readonly ContactAction[])
      : []),
    ...(instagram
      ? ([
          {
            detail: instagram.handle,
            external: true,
            href: instagram.url,
            iconSrc: "/icons/IG.svg",
            label: "Instagram",
          },
        ] satisfies readonly ContactAction[])
      : []),
    {
      detail: "Harbour House, Howth",
      external: true,
      href: site.address.directionsUrl,
      iconSrc: "/icons/Location.png",
      label: "Get directions",
    },
  ];

  useEffect(() => {
    const closeFrame = window.requestAnimationFrame(() => setIsOpen(false));

    return () => window.cancelAnimationFrame(closeFrame);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isOpen]);

  return (
    <div
      className={styles.fabWrap}
      data-contact-fab
      data-open={isOpen ? "true" : "false"}
      id="contact-fab"
      ref={rootRef}
    >
      <button
        aria-controls={actionsId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close quick contact menu" : "Open quick contact menu"}
        className={`${styles.mainButton} ${isOpen ? styles.mainButtonOpen : ""}`}
        data-contact-fab-toggle
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className={styles.mainIcon} aria-hidden="true">
          <Image
            alt=""
            className={styles.mainIconImage}
            height={88}
            loading="eager"
            src={isOpen ? "/icons/Call-end.png" : "/icons/Call-start.png"}
            width={88}
          />
        </span>
      </button>

      <nav
        aria-hidden={!isOpen}
        aria-label="Quick contact actions"
        className={`${styles.items} ${isOpen ? styles.itemsOpen : ""}`}
        data-contact-fab-menu
        id={actionsId}
        inert={!isOpen}
      >
        {actions.map((action, index) => {
          const Icon = action.icon;
          const content = (
            <>
              <span className={styles.itemCopy}>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </span>
              <span className={styles.itemIcon} aria-hidden="true">
                {action.iconSrc ? (
                  <Image
                    alt=""
                    className={styles.itemIconImage}
                    height={56}
                    src={action.iconSrc}
                    width={56}
                  />
                ) : Icon ? (
                  <Icon className={styles.itemIconSvg} />
                ) : null}
              </span>
            </>
          );
          const actionProps = {
            "aria-label": `${action.label}: ${action.detail}`,
            className: styles.item,
            onClick: () => setIsOpen(false),
            style: { "--item-index": index } as CSSProperties,
            tabIndex: isOpen ? 0 : -1,
          };

          return (
            <a
              href={action.href}
              key={action.label}
              rel={action.external ? "noopener noreferrer" : undefined}
              target={action.external ? "_blank" : undefined}
              {...actionProps}
            >
              {content}
              {action.external ? (
                <span className="sr-only"> (opens in a new tab)</span>
              ) : null}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CmsLoginForm } from "@/components/cms/CmsLoginForm";
import { BrandMark } from "@/components/ui/BrandMark";
import { getCurrentCmsUser } from "@/server/cms/auth/session";
import { getCmsMode } from "@/server/cms/config";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "CMS Sign In | Siriranee Thai Massage" },
  description: "Secure administration access for Siriranee Thai Massage.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CmsLoginPage() {
  const mode = getCmsMode();

  if (mode !== "disabled" && (await getCurrentCmsUser())) {
    redirect("/cms");
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-label="Siriranee CMS sign in">
        <Link
          aria-label="Return to the Siriranee Thai Massage website"
          className={styles.logoLink}
          href="/"
        >
          <BrandMark eager />
        </Link>

        <section className={styles.formPanel}>
          <CmsLoginForm mode={mode} />
        </section>

        <div className={styles.footer}>
          <span>Private administration</span>
          <Link href="/">Return to website</Link>
        </div>
      </section>
    </main>
  );
}

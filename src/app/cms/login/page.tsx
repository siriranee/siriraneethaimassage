import { LockKeyhole, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { CmsLoginForm } from "@/components/cms/CmsLoginForm";
import { BrandMark } from "@/components/ui/BrandMark";
import { getCurrentCmsUser } from "@/server/cms/auth/session";
import { getCmsMode } from "@/server/cms/config";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function CmsLoginPage() {
  const mode = getCmsMode();

  if (mode !== "disabled" && (await getCurrentCmsUser())) {
    redirect("/cms");
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <BrandMark />
          <span>Private workspace</span>
        </div>
        <div className={styles.brandCopy}>
          <span><Sparkles aria-hidden="true" /> Siriranee administration</span>
          <h1>A calm place to manage the details.</h1>
          <p>
            Keep treatments, prices, business information and appointments
            organised without changing the warmth of the public website.
          </p>
        </div>
        <small>Siriranee Thai Massage · Howth, Dublin</small>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <span className={styles.lock}><LockKeyhole aria-hidden="true" /></span>
          <CmsLoginForm mode={mode} />
        </div>
      </section>
    </main>
  );
}

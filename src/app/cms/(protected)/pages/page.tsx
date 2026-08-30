import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";

import { CmsPageHeader } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsPagesPage() {
  await requireCmsPageUser("content:view");
  const content = await getCmsContent();
  return (
    <>
      <CmsPageHeader description="Edit the main heading, introduction and search appearance for each public page." eyebrow="Website content" title="Page headings & SEO" />
      <div className={styles.cardGrid}>
        {(content.pages ?? []).map((page) => (
          <article className={styles.card} key={page.id}><span className={styles.cardIcon}><FileText aria-hidden="true" /></span><h2>{page.title}</h2><p>{page.description}</p><Link href={`/cms/pages/${page.id}/edit`}>Edit {page.id} page <ArrowRight aria-hidden="true" /></Link></article>
        ))}
      </div>
    </>
  );
}

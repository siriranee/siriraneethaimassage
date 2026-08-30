import { AlertTriangle, CheckCircle2, CircleDot, History } from "lucide-react";

import { PublishContentButton } from "@/components/cms/PublishContentButton";
import { RestorePublicationButton } from "@/components/cms/RestorePublicationButton";
import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsPublicationPreview } from "@/server/cms/content-service";
import styles from "@/components/cms/CmsViews.module.css";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(value));
}

export default async function CmsContentPreviewPage() {
  await requireCmsPageUser("content:publish");
  const preview = await getCmsPublicationPreview();
  const changed = preview.changes.filter((item) => item.changed);

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/content" secondary>Back to content</CmsPrimaryLink>}
        description="Review change groups and readiness checks before replacing the complete public website snapshot."
        eyebrow="Publication workflow"
        title="Review & publish"
      />

      <div className={styles.detailGrid}>
        <CmsPanel title={`Draft revision ${preview.draft.revision}`} description={preview.published ? `Live revision ${preview.published.revision}` : "No live publication yet"}>
          <ul className={styles.activityList}>
            {preview.changes.map((item) => (
              <li key={item.key}>{item.changed ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<div><strong>{item.label}</strong><span>{item.changed ? "Changed since the live publication" : "No detected change"}</span></div></li>
            ))}
          </ul>
        </CmsPanel>
        <CmsPanel title="Publication readiness" description="Errors block publishing; warnings require review.">
          {preview.readiness.errors.map((message) => <CmsNotice key={message} tone="warning" title="Must fix"><AlertTriangle aria-hidden="true" /> {message}</CmsNotice>)}
          {preview.readiness.warnings.map((message) => <CmsNotice key={message} tone="warning" title="Review before launch"><AlertTriangle aria-hidden="true" /> {message}</CmsNotice>)}
          {!preview.readiness.errors.length && !preview.readiness.warnings.length ? <CmsNotice title="Ready to publish"><CheckCircle2 aria-hidden="true" /> No content-readiness issues were detected.</CmsNotice> : null}
        </CmsPanel>
      </div>

      <CmsPanel title="Publish complete snapshot" description={changed.length ? `${changed.length} content group${changed.length === 1 ? "" : "s"} will change.` : "This republishes the current draft without content differences."}>
        <PublishContentButton disabled={preview.readiness.errors.length > 0} />
      </CmsPanel>

      <CmsPanel title={`Publication history · ${preview.history.length}`} description="Restoring creates a new draft. It never silently overwrites the live website.">
        <ul className={styles.activityList}>
          {preview.history.map((publication) => (
            <li key={publication.id}>
              <History aria-hidden="true" />
              <div><strong>Revision {publication.revision} {publication.id === preview.published?.id ? <CmsStatusBadge label="Live" tone="success" /> : null}</strong><span>{formatTimestamp(publication.publishedAt)} · publisher {publication.publishedBy}</span></div>
              {publication.id !== preview.published?.id ? <RestorePublicationButton expectedRevision={preview.draft.revision} publicationId={publication.id} /> : null}
            </li>
          ))}
        </ul>
      </CmsPanel>
    </>
  );
}

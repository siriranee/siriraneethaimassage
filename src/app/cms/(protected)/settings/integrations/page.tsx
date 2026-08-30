import { CalendarDays, Camera, HeartPulse, MapPinned, MessageCircle, Star } from "lucide-react";
import Link from "next/link";

import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsIntegrationsPage() {
  await requireCmsPageUser("settings:view");
  const content = await getCmsContent();
  const items = [
    { icon: CalendarDays, name: "Booking provider", value: content.site.booksyUrl, configured: Boolean(content.site.booksyUrl), edit: "/cms/settings/business" },
    { icon: MessageCircle, name: "Booking notifications", value: "Dashboard preview queue only — no messages are sent", configured: false, edit: "/cms/notifications" },
    { icon: Camera, name: "Media storage", value: "Project images and metadata only — uploads are disabled", configured: false, edit: "/cms/media" },
    { icon: HeartPulse, name: "Monitoring & alerts", value: process.env.CMS_MONITORING_READY === "true" ? "Marked operationally ready" : "Provider and alert recipient required", configured: process.env.CMS_MONITORING_READY === "true", edit: "/cms/settings/recovery" },
    { icon: MessageCircle, name: "WhatsApp", value: content.site.whatsappNumber, configured: Boolean(content.site.whatsappNumber), edit: "/cms/settings/business" },
    { icon: Camera, name: "Instagram", value: content.site.instagramUrl, configured: Boolean(content.site.instagramUrl), edit: "/cms/settings/business" },
    { icon: Star, name: "Google reviews", value: content.site.googleReviewUrl, configured: Boolean(content.site.googleReviewUrl), edit: "/cms/settings/business" },
    { icon: MapPinned, name: "Google Maps", value: "Public embed and directions link", configured: true, edit: "/cms/settings/business" },
  ];

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>}
        description="Review external channels without exposing provider secrets in the browser."
        eyebrow="Settings"
        title="Integrations"
      />
      <CmsNotice title="Server-only credentials">
        Booking, email and media credentials will be configured through environment
        variables after providers are approved. This screen records public links and honest connection health only.
      </CmsNotice>
      <CmsPanel title="Connection overview" description="Public links can be edited in Business information.">
        <ul className={styles.activityList}>
          {items.map(({ configured, edit, icon: Icon, name, value }) => (
            <li key={name}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{name} <CmsStatusBadge label={configured ? "Configured" : "Not configured"} tone={configured ? "success" : "warning"} /></strong>
                <span>{value || "Owner or provider information required."} · <Link className={styles.miniLink} href={edit}>Edit</Link></span>
              </div>
            </li>
          ))}
        </ul>
      </CmsPanel>
    </>
  );
}

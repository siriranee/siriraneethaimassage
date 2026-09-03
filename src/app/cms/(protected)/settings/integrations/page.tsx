import { CalendarDays, Camera, Mail, MapPinned, MessageCircle, Star } from "lucide-react";
import Link from "next/link";

import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";
import { getCloudinaryMediaReadiness } from "@/server/media/config";
import { getResendBookingEmailReadiness } from "@/server/booking/resend-booking-email";

import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsIntegrationsPage() {
  await requireCmsPageUser("settings:view");
  const content = await getCmsContent();
  const media = getCloudinaryMediaReadiness();
  const bookingEmail = getResendBookingEmailReadiness();
  const items = [
    { icon: CalendarDays, name: "Booking provider", value: content.site.booksyUrl, configured: Boolean(content.site.booksyUrl), edit: "/cms/settings/business" },
    {
      icon: Camera,
      name: "Media storage",
      value: media.ready
        ? "Cloudinary signed uploads and browser compression are ready"
        : media.approved
          ? "Cloudinary configuration is incomplete — uploads remain disabled"
          : "Cloudinary uploads are disabled by the deployment gate",
      configured: media.ready,
      edit: "/cms/services",
    },
    {
      icon: Mail,
      name: "Owner booking emails",
      value: `${bookingEmail.summary}. New website requests are saved before Resend is called.`,
      configured: bookingEmail.ready,
      edit: "",
    },
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
        Provider credentials stay in server environment variables and are never sent
        to this page. This overview reports connection readiness without exposing secrets.
      </CmsNotice>
      <CmsPanel title="Connection overview" description="Public links can be edited in Business information.">
        <ul className={styles.activityList}>
          {items.map(({ configured, edit, icon: Icon, name, value }) => (
            <li key={name}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{name} <CmsStatusBadge label={configured ? "Configured" : "Not configured"} tone={configured ? "success" : "warning"} /></strong>
                <span>
                  {value || "Owner or provider information required."}
                  {edit ? <> · <Link className={styles.miniLink} href={edit}>Edit</Link></> : " · Deployment settings"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CmsPanel>
    </>
  );
}

import { notFound } from "next/navigation";

import { ServiceEditorForm } from "@/components/cms/ServiceEditorForm";
import { CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsContent } from "@/server/cms/content-service";

type PageProps = {
  readonly params: Promise<{ readonly serviceId: string }>;
};

export default async function CmsServiceEditPage({ params }: PageProps) {
  await requireCmsPageUser("content:write");
  const { serviceId } = await params;
  const content = await getCmsContent();
  const service = content.services.find((item) => item.id === serviceId);
  if (!service) notFound();

  return (
    <>
      <CmsPageHeader
        actions={<CmsPrimaryLink href="/cms/services" secondary>Back to services</CmsPrimaryLink>}
        description="Edit the draft record, review every field, then publish the complete website snapshot when ready."
        eyebrow="Treatment editor"
        title={service.name}
      />
      <ServiceEditorForm service={service} />
    </>
  );
}

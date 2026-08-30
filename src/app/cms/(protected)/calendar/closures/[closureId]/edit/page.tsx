import { notFound } from "next/navigation";

import { ClosureForm } from "@/components/cms/ClosureForm";
import { CmsNotice, CmsPageHeader, CmsPrimaryLink } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { listCmsClosures } from "@/server/cms/read-service";

type PageProps = { readonly params: Promise<{ readonly closureId: string }> };

export default async function CmsEditClosurePage({ params }: PageProps) {
  await requireCmsPageUser("calendar:write");
  const { closureId } = await params;
  const closure = (await listCmsClosures()).find((item) => item.id === closureId);
  if (!closure) notFound();
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/calendar/closures" secondary>Back to closures</CmsPrimaryLink>} description="Change a blocked period or deactivate it without deleting its operational history." eyebrow="Availability" title={`Closure · ${closure.localDate}`} />
      <CmsNotice title="Soft deactivation preserves history">Turning a closure off releases its time while keeping the reason and audit event available.</CmsNotice>
      <ClosureForm closure={closure} defaultDate={closure.localDate} />
    </>
  );
}

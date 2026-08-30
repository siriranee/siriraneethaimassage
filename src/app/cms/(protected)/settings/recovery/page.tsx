import { DatabaseBackup, HeartPulse, KeyRound, ShieldCheck } from "lucide-react";

import { CmsNotice, CmsPageHeader, CmsPanel, CmsPrimaryLink, CmsStatusBadge } from "@/components/cms/CmsUi";
import { requireCmsPageUser } from "@/server/cms/auth/guards";
import { getCmsMode } from "@/server/cms/config";
import { hasCmsPiiEncryptionKey } from "@/server/cms/pii";
import styles from "@/components/cms/CmsViews.module.css";

export default async function CmsRecoveryStatusPage() {
  await requireCmsPageUser("settings:view");
  const mode = getCmsMode();
  const checks = [
    { icon: DatabaseBackup, label: "Production persistence", ready: mode === "mongodb", detail: mode === "mongodb" ? "MongoDB mode configured" : "Local mock or disabled mode" },
    { icon: KeyRound, label: "PII recovery key", ready: hasCmsPiiEncryptionKey(), detail: hasCmsPiiEncryptionKey() ? "Key is present in this environment" : "No valid 32-byte key detected" },
    {
      icon: DatabaseBackup,
      label: "Backup automation",
      ready: false,
      detail:
        process.env.CMS_BACKUP_DIRECTORY && process.env.CMS_BACKUP_ENCRYPTION_KEY
          ? "Reserved values are present; automation still requires explicit approval and implementation"
          : "No approved automation or private destination is configured",
    },
    { icon: ShieldCheck, label: "Isolated restore drill", ready: process.env.CMS_RECOVERY_DRILL_VERIFIED === "true", detail: process.env.CMS_RECOVERY_DRILL_VERIFIED === "true" ? "Explicitly marked verified" : "No verified drill recorded" },
    { icon: HeartPulse, label: "Production monitoring", ready: process.env.CMS_MONITORING_READY === "true", detail: process.env.CMS_MONITORING_READY === "true" ? "Operational monitoring marked ready" : "Provider and alert recipient required" },
  ];
  return (
    <>
      <CmsPageHeader actions={<CmsPrimaryLink href="/cms/settings" secondary>Back to settings</CmsPrimaryLink>} description="Review fail-closed production gates without displaying credentials or recovery keys." eyebrow="Operations" title="Recovery & monitoring" />
      <CmsNotice tone="warning" title="A green screen does not replace a restore drill">
        Test every backup against a newly named isolated database. Never restore over production by default.
      </CmsNotice>
      <CmsPanel title="Operational readiness" description="Environment values are reported only as present or missing.">
        <ul className={styles.activityList}>
          {checks.map(({ detail, icon: Icon, label, ready }) => (
            <li key={label}><Icon aria-hidden="true" /><div><strong>{label} <CmsStatusBadge label={ready ? "Ready" : "Not ready"} tone={ready ? "success" : "warning"} /></strong><span>{detail}</span></div></li>
          ))}
        </ul>
      </CmsPanel>
      <CmsPanel title="Runbook" description="No backup or restore is triggered from the browser.">
        <p>Use the repository recovery runbook and trusted command line from a protected workstation. Public booking stays disabled until monitoring and the isolated drill are both verified.</p>
      </CmsPanel>
    </>
  );
}

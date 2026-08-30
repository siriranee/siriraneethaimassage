import type { Metadata } from "next";

import { AdminPreview } from "@/components/admin-preview/AdminPreview";

export const metadata: Metadata = {
  title: {
    absolute: "Admin Dashboard Prototype | Siriranee",
  },
  description:
    "A non-functional interface prototype for a future Siriranee administration workspace.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminPreviewPage() {
  return <AdminPreview />;
}

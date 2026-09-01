import type { NextConfig } from "next";

import {
  getConfiguredCloudinaryCloudName,
  getConfiguredCloudinaryFolder,
} from "./src/lib/media/cloudinary-delivery";

const cloudinaryCloudName = getConfiguredCloudinaryCloudName();
const cloudinaryFolder = getConfiguredCloudinaryFolder();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
    remotePatterns: cloudinaryCloudName && cloudinaryFolder
      ? [
          {
            protocol: "https",
            hostname: "res.cloudinary.com",
            port: "",
            pathname: `/${cloudinaryCloudName}/image/upload/v*/${cloudinaryFolder}/assets/**`,
            search: "",
          },
        ]
      : [],
  },
  async redirects() {
    return [
      {
        source: "/admin-preview",
        destination: "/cms",
        permanent: true,
      },
      {
        source: "/services/back-neck-shoulder-massage",
        destination: "/services/neck-shoulder-upper-back-massage",
        permanent: true,
      },
      {
        source: "/services/full-body-massage",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/services/couples-massage",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/services/head-massage",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/services/foot-massage-reflexology",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/services/cupping-therapy",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/services/sports-massage",
        destination: "/services",
        permanent: true,
      },
      {
        source: "/masseuses",
        destination: "/therapists",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/cms",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/cms/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;

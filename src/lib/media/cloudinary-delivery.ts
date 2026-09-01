const CLOUDINARY_DELIVERY_HOST = "res.cloudinary.com";
const CLOUDINARY_CLOUD_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/i;
const CLOUDINARY_FOLDER_PATTERN =
  /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/i;
const CLOUDINARY_RASTER_IMAGE_PATTERN = /\.(?:avif|jpe?g|png|webp)$/i;

export type CloudinaryDeliveryOwnership = Readonly<{
  cloudName: string;
  folder: string;
}>;

export function getConfiguredCloudinaryCloudName() {
  const value = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  return CLOUDINARY_CLOUD_NAME_PATTERN.test(value) ? value : null;
}

export function getConfiguredCloudinaryFolder() {
  const value = process.env.CLOUDINARY_FOLDER?.trim() ?? "";
  return CLOUDINARY_FOLDER_PATTERN.test(value) ? value : null;
}

export function isProjectImagePath(value: string) {
  if (
    !value.startsWith("/images/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    !CLOUDINARY_RASTER_IMAGE_PATTERN.test(value)
  ) {
    return false;
  }

  try {
    return !value
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .some((segment) => segment === ".." || segment.includes("\\"));
  } catch {
    return false;
  }
}

export function isConfiguredCloudinaryImageUrl(
  value: string,
  cloudName = getConfiguredCloudinaryCloudName(),
  folder = getConfiguredCloudinaryFolder(),
) {
  if (
    !cloudName ||
    !folder ||
    !CLOUDINARY_CLOUD_NAME_PATTERN.test(cloudName) ||
    !CLOUDINARY_FOLDER_PATTERN.test(folder)
  ) {
    return false;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== CLOUDINARY_DELIVERY_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return false;
    }

    const prefix = `/${cloudName}/image/upload/`;
    if (
      !url.pathname.startsWith(prefix) ||
      url.pathname.length <= prefix.length ||
      !CLOUDINARY_RASTER_IMAGE_PATTERN.test(url.pathname)
    ) {
      return false;
    }

    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment === ".." || segment.includes("\\"))) {
      return false;
    }

    if (
      segments[0] !== cloudName ||
      segments[1] !== "image" ||
      segments[2] !== "upload" ||
      !/^v[1-9]\d*$/.test(segments[3] ?? "")
    ) {
      return false;
    }

    const assetPath = segments.slice(4).join("/");
    return assetPath.startsWith(`${folder}/assets/`);
  } catch {
    return false;
  }
}

export function isApprovedPublicImageUrl(value: string) {
  return isProjectImagePath(value) || isConfiguredCloudinaryImageUrl(value);
}

export function isApprovedImageUrlForOwnership(
  value: string,
  ownership: CloudinaryDeliveryOwnership | null | undefined,
) {
  return (
    isProjectImagePath(value) ||
    Boolean(
      ownership &&
        isConfiguredCloudinaryImageUrl(
          value,
          ownership.cloudName,
          ownership.folder,
        ),
    )
  );
}

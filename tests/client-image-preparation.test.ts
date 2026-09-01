import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  ClientImagePreparationError,
  containClientImageDimensions,
  formatBytes,
  inspectClientImageBytes,
  prepareClientImage,
  validateClientImageFile,
} from "../src/lib/media/client-image";

function uint32BigEndian(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function pngChunk(type: string, data: readonly number[]) {
  return [
    ...uint32BigEndian(data.length),
    ...Array.from(type, (character) => character.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

function pngBytes(width = 1_600, height = 900, animated = false) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [
    ...uint32BigEndian(width),
    ...uint32BigEndian(height),
    8,
    6,
    0,
    0,
    0,
  ]);
  const animation = animated
    ? pngChunk("acTL", [...uint32BigEndian(2), ...uint32BigEndian(0)])
    : [];
  return new Uint8Array([...signature, ...ihdr, ...animation, ...pngChunk("IEND", [])]);
}

function webpBytes(width = 1_600, height = 900, animated = false) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([22, 0, 0, 0], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes.set([10, 0, 0, 0], 16);
  bytes[20] = animated ? 0x02 : 0;
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set(
    [encodedWidth & 0xff, (encodedWidth >> 8) & 0xff, (encodedWidth >> 16) & 0xff],
    24,
  );
  bytes.set(
    [encodedHeight & 0xff, (encodedHeight >> 8) & 0xff, (encodedHeight >> 16) & 0xff],
    27,
  );
  return bytes;
}

function jpegBytes(width = 1_600, height = 900) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

test("header inspection recognises supported still-image formats and dimensions", () => {
  assert.deepEqual(inspectClientImageBytes(jpegBytes()), {
    mimeType: "image/jpeg",
    dimensions: { width: 1_600, height: 900 },
    animated: false,
  });
  assert.deepEqual(inspectClientImageBytes(pngBytes()), {
    mimeType: "image/png",
    dimensions: { width: 1_600, height: 900 },
    animated: false,
  });
  assert.deepEqual(inspectClientImageBytes(webpBytes()), {
    mimeType: "image/webp",
    dimensions: { width: 1_600, height: 900 },
    animated: false,
  });
});

test("animated PNG and WebP inputs are rejected before browser decoding", async () => {
  for (const [name, type, bytes] of [
    ["animated.png", "image/png", pngBytes(800, 600, true)],
    ["animated.webp", "image/webp", webpBytes(800, 600, true)],
  ] as const) {
    const result = await validateClientImageFile(
      new File([bytes], name, { type }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issue.code, "animated-image");
      assert.equal(result.issue.scope, "animation");
    }
  }
});

test("selection validation rejects spoofed types, unsupported data and byte-limit breaches", async () => {
  const spoofed = await validateClientImageFile(
    new File([pngBytes()], "spoofed.jpg", { type: "image/jpeg" }),
  );
  assert.equal(spoofed.ok, false);
  if (!spoofed.ok) assert.equal(spoofed.issue.code, "type-mismatch");

  const unsupported = await validateClientImageFile(
    new File([new Uint8Array([0x47, 0x49, 0x46])], "image.gif", {
      type: "image/gif",
    }),
  );
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.equal(unsupported.issue.scope, "selection");

  const tooLarge = await validateClientImageFile(
    new File([pngBytes()], "large.png", { type: "image/png" }),
    { maxInputBytes: 10 },
  );
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.equal(tooLarge.issue.code, "file-too-large");
});

test("dimension containment preserves ratio and never upscales", () => {
  assert.deepEqual(containClientImageDimensions(4_000, 2_000, 2_000, 2_000), {
    width: 2_000,
    height: 1_000,
  });
  assert.deepEqual(containClientImageDimensions(800, 600, 2_560, 2_560), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(containClientImageDimensions(1_000, 3_000, 1_200, 900), {
    width: 300,
    height: 900,
  });
});

test("browser preparation downscales, encodes WebP and closes decoded resources", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  let bitmapClosed = false;
  const phases: string[] = [];
  const drawCalls: unknown[][] = [];

  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    globalCompositeOperation: "source-over",
    fillStyle: "",
    drawImage: (...args: unknown[]) => drawCalls.push(args),
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => undefined,
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback, type?: string) =>
      callback(new Blob([new Uint8Array(128)], { type })),
  };

  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => ({
      width: 4_000,
      height: 2_000,
      close: () => {
        bitmapClosed = true;
      },
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
  });

  try {
    const prepared = await prepareClientImage(
      new File([jpegBytes()], "room.jpg", { type: "image/jpeg" }),
      {
        outputWidthLimit: 1_000,
        outputHeightLimit: 1_000,
        keepOriginalWhenSmaller: false,
        onProgress: ({ phase }) => phases.push(phase),
      },
    );

    assert.equal(prepared.file.type, "image/webp");
    assert.equal(prepared.file.name, "room.webp");
    assert.deepEqual(prepared.prepared, {
      bytes: 128,
      mimeType: "image/webp",
      width: 1_000,
      height: 500,
    });
    assert.equal(prepared.wasResized, true);
    assert.equal(prepared.wasReencoded, true);
    assert.equal(canvas.width, 1_000);
    assert.equal(canvas.height, 500);
    assert.equal(drawCalls.length, 1);
    assert.deepEqual(phases, ["validating", "decoding", "resizing", "encoding", "ready"]);
  } finally {
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: originalCreateImageBitmap,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  }

  assert.equal(bitmapClosed, true);
});

test("utility and field preserve deferred upload and object URL cleanup boundaries", async () => {
  const [utility, field, styles] = await Promise.all([
    readFile(resolve(process.cwd(), "src/lib/media/client-image.ts"), "utf8"),
    readFile(resolve(process.cwd(), "src/components/cms/CmsImageUploadField.tsx"), "utf8"),
    readFile(resolve(process.cwd(), "src/components/cms/CmsImageUploadField.module.css"), "utf8"),
  ]);

  assert.match(utility, /imageOrientation: "from-image"/);
  assert.match(utility, /encodedType !== "image\/webp" \|\| !resolved\.jpegFallback/);
  assert.match(utility, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(utility, /maxOutputBytes: 5 \* 1024 \* 1024/);
  assert.match(utility, /keepOriginalWhenSmaller: false/);
  assert.match(utility, /outputWidthLimit\?: number/);
  assert.match(utility, /outputHeightLimit\?: number/);
  assert.match(field, /onUpload\?: \(/);
  assert.match(field, /onClick=\{\(\) => void uploadPreparedImage\(\)\}/);
  assert.match(field, /if \(file\) void prepareSelectedFile\(file\)/);
  assert.match(field, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);
  assert.match(field, /previousPreparedIdRef/);
  assert.match(field, /onBusyChange\?: \(isBusy: boolean\) => void/);
  assert.match(field, /onBusyChangeRef\.current\?\.\(isBusy\)/);
  assert.match(field, /onBusyChangeRef\.current\?\.\(false\)/);
  assert.match(field, /operation === "preparing"/);
  assert.match(field, /setStatusMessage\("No image selected\."\)/);
  assert.match(field, /type="file"/);
  assert.doesNotMatch(field, /multiple/);
  assert.match(field, /role="status"/);
  assert.match(field, /role="alert"/);
  assert.doesNotMatch(styles, /font-size:\s*(?:0\.|[0-9]+px)/);
  assert.doesNotMatch(styles, /^\s*max-width\s*:/gm);
  assert.equal(formatBytes(5 * 1024 * 1024), "5.00 MB");
});

test("structured preparation errors retain their validation scope", () => {
  assert.throws(
    () => inspectClientImageBytes(new Uint8Array([0x47, 0x49, 0x46])),
    (error) =>
      error instanceof ClientImagePreparationError &&
      error.code === "unsupported-type" &&
      error.scope === "file-header",
  );
});

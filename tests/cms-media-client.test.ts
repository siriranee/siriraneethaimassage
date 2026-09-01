import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  CmsMediaClientError,
  createCmsMediaSubmissionEnvelope,
  isExactCloudinaryUploadEndpoint,
  rollbackStagedCmsMediaAssets,
  uploadPreparedCmsImage,
  type CmsStagedMediaAsset,
} from "../src/lib/media/cms-media-client";
import type { PreparedClientImage } from "../src/lib/media/client-image";

const submissionId = "media_12345678";
const cloudName = "siriranee-demo";
const providerPublicId =
  "siriranee/assets/0123456789abcdef/media_12345678/image-one";
const providerSecureUrl =
  `https://res.cloudinary.com/${cloudName}/image/upload/v123/${providerPublicId}.webp`;
const providerUpload = {
  public_id: providerPublicId,
  secure_url: providerSecureUrl,
  signature: "b".repeat(40),
  version: 123,
  resource_type: "image",
  format: "webp",
  bytes: 120,
  width: 1_000,
  height: 625,
};

function preparedImage(): PreparedClientImage {
  const file = new File([new Uint8Array(256)], "treatment-room.webp", {
    type: "image/webp",
  });
  return {
    id: "prepared-image-one",
    file,
    original: {
      name: "treatment-room.jpg",
      bytes: 1_024,
      mimeType: "image/jpeg",
      width: 2_000,
      height: 1_250,
    },
    prepared: {
      bytes: file.size,
      mimeType: "image/webp",
      width: 1_000,
      height: 625,
    },
    wasResized: true,
    wasReencoded: true,
  };
}

function authorizationResponse() {
  return {
    upload: {
      endpoint: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      cloudName,
      apiKey: "public_api_key_123",
      parameters: {
        overwrite: false,
        public_id: providerPublicId,
        timestamp: 1_800_000_000,
        upload_preset: "siriranee-cms",
      },
      signature: "a".repeat(64),
      uploadToken: "upload-token-".padEnd(40, "x"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function stagedAsset(): CmsStagedMediaAsset {
  return {
    publicId: providerPublicId,
    secureUrl: providerSecureUrl,
    scope: "service-gallery",
    format: "webp",
    bytes: providerUpload.bytes,
    width: providerUpload.width,
    height: providerUpload.height,
    stagedToken: "staged-token-".padEnd(40, "y"),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchCall = {
  input: string;
  init: RequestInit;
};

type XhrRecord = {
  method: string;
  endpoint: string;
  async: boolean;
  withCredentials: boolean;
  timeout: number;
  form: FormData;
};

function installBrowserMocks(
  fetchHandler: (call: FetchCall) => Promise<Response>,
  providerResponses: readonly unknown[] = [providerUpload],
) {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  const fetchCalls: FetchCall[] = [];
  const xhrRecords: XhrRecord[] = [];
  const pendingProviderResponses = [...providerResponses];

  class FakeXmlHttpRequest {
    status = 0;
    response: unknown = null;
    responseText = "";
    responseType: XMLHttpRequestResponseType = "";
    timeout = 0;
    withCredentials = true;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    upload = {
      onprogress: null as ((event: {
        lengthComputable: boolean;
        loaded: number;
        total: number;
      }) => void) | null,
    };
    private method = "";
    private endpoint = "";
    private async = true;

    open(method: string, endpoint: string, async = true) {
      this.method = method;
      this.endpoint = endpoint;
      this.async = async;
    }

    send(form: FormData) {
      xhrRecords.push({
        method: this.method,
        endpoint: this.endpoint,
        async: this.async,
        withCredentials: this.withCredentials,
        timeout: this.timeout,
        form,
      });
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 128,
        total: 256,
      });
      this.responseText = JSON.stringify(
        pendingProviderResponses.shift() ?? providerUpload,
      );
      this.status = 200;
      this.onload?.();
    }

    abort() {
      this.onabort?.();
    }
  }

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request, init: RequestInit = {}) => {
      const call = { input: String(input), init };
      fetchCalls.push(call);
      return fetchHandler(call);
    },
  });
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    configurable: true,
    value: FakeXmlHttpRequest,
  });

  return {
    fetchCalls,
    xhrRecords,
    restore() {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(globalThis, "XMLHttpRequest", {
        configurable: true,
        value: originalXhr,
      });
    },
  };
}

function requestBody(call: FetchCall) {
  const body = call.init.body;
  assert.equal(typeof body, "string");
  if (typeof body !== "string") throw new TypeError("Expected a JSON string body.");
  return JSON.parse(body) as Record<string, unknown>;
}

test("Cloudinary upload endpoints must exactly match the signed account path", () => {
  const valid = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  assert.equal(isExactCloudinaryUploadEndpoint(valid, cloudName), true);

  for (const unsafe of [
    `http://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    `https://api.cloudinary.com/v1_1/other/image/upload`,
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload/extra`,
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload?next=evil`,
    `https://user:pass@api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    `https://api.cloudinary.com.evil.example/v1_1/${cloudName}/image/upload`,
  ]) {
    assert.equal(isExactCloudinaryUploadEndpoint(unsafe, cloudName), false);
  }
});

test("prepared image upload uses same-origin authorization and direct XHR progress", async () => {
  const progress: Array<{ stage: string; percent: number }> = [];
  const expectedAsset = stagedAsset();
  const mock = installBrowserMocks(async ({ input, init }) => {
    if (input === "/api/cms/media-upload" && init.method === "POST") {
      return jsonResponse(authorizationResponse());
    }
    if (input === "/api/cms/media-upload/complete" && init.method === "POST") {
      return jsonResponse({ asset: expectedAsset }, 201);
    }
    return jsonResponse({ error: "Unexpected request." }, 500);
  });

  try {
    const asset = await uploadPreparedCmsImage({
      submissionId,
      scope: "service-gallery",
      image: preparedImage(),
      onProgress: (event) => progress.push(event),
    });

    assert.deepEqual(asset, expectedAsset);
    assert.equal(mock.fetchCalls.length, 2);
    for (const call of mock.fetchCalls) {
      assert.equal(call.init.credentials, "same-origin");
      assert.equal(call.init.cache, "no-store");
    }
    assert.deepEqual(requestBody(mock.fetchCalls[0]), {
      submissionId,
      scope: "service-gallery",
      fileName: "treatment-room.webp",
      contentType: "image/webp",
      bytes: 256,
    });
    assert.deepEqual(requestBody(mock.fetchCalls[1]), {
      submissionId,
      scope: "service-gallery",
      uploadToken: authorizationResponse().upload.uploadToken,
      upload: {
        publicId: providerUpload.public_id,
        secureUrl: providerUpload.secure_url,
        signature: providerUpload.signature,
        version: providerUpload.version,
        resourceType: providerUpload.resource_type,
        format: providerUpload.format,
        bytes: providerUpload.bytes,
        width: providerUpload.width,
        height: providerUpload.height,
      },
    });

    assert.equal(mock.xhrRecords.length, 1);
    const xhr = mock.xhrRecords[0];
    assert.equal(xhr?.method, "POST");
    assert.equal(
      xhr?.endpoint,
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    );
    assert.equal(xhr?.withCredentials, false);
    assert.equal(xhr?.timeout, 120_000);
    assert.deepEqual(
      [...(xhr?.form.keys() ?? [])],
      ["file", "overwrite", "public_id", "timestamp", "upload_preset", "api_key", "signature"],
    );
    assert.ok(xhr?.form.get("file") instanceof File);
    assert.equal(xhr?.form.get("api_key"), "public_api_key_123");
    assert.equal(xhr?.form.get("signature"), "a".repeat(64));
    assert.ok(progress.some((event) => event.stage === "uploading" && event.percent === 50));
  } finally {
    mock.restore();
  }
});

test("malformed provider metadata is cleaned with the signed public ID", async () => {
  const mock = installBrowserMocks(async ({ input, init }) => {
    if (input === "/api/cms/media-upload" && init.method === "POST") {
      return jsonResponse(authorizationResponse());
    }
    if (input === "/api/cms/media-upload" && init.method === "DELETE") {
      return jsonResponse({ removed: true });
    }
    return jsonResponse({ error: "Completion must not be called." }, 500);
  }, [{ resource_type: "image", secure_url: "invalid" }]);

  try {
    await assert.rejects(
      uploadPreparedCmsImage({
        submissionId,
        scope: "service-gallery",
        image: preparedImage(),
      }),
      (error) =>
        error instanceof CmsMediaClientError &&
        error.code === "invalid-response" &&
        error.stage === "uploading",
    );
    assert.equal(mock.fetchCalls.length, 2);
    assert.deepEqual(requestBody(mock.fetchCalls[1]), {
      submissionId,
      scope: "service-gallery",
      publicId: providerPublicId,
      uploadToken: authorizationResponse().upload.uploadToken,
    });
  } finally {
    mock.restore();
  }
});

test("completion failure triggers exact upload-token cleanup fallback", async () => {
  const mock = installBrowserMocks(async ({ input, init }) => {
    if (input === "/api/cms/media-upload" && init.method === "POST") {
      return jsonResponse(authorizationResponse());
    }
    if (input === "/api/cms/media-upload/complete") {
      return jsonResponse({ error: "The provider response could not be verified." }, 502);
    }
    if (input === "/api/cms/media-upload" && init.method === "DELETE") {
      return jsonResponse({ removed: true });
    }
    return jsonResponse({ error: "Unexpected request." }, 500);
  });

  try {
    await assert.rejects(
      uploadPreparedCmsImage({
        submissionId,
        scope: "service-gallery",
        image: preparedImage(),
      }),
      (error) =>
        error instanceof CmsMediaClientError && error.stage === "verifying",
    );
    assert.equal(mock.fetchCalls.length, 3);
    assert.deepEqual(requestBody(mock.fetchCalls[2]), {
      submissionId,
      scope: "service-gallery",
      publicId: providerPublicId,
      uploadToken: authorizationResponse().upload.uploadToken,
    });
  } finally {
    mock.restore();
  }
});

test("staged rollback is sequential, deduplicated and best effort", async () => {
  let attempt = 0;
  const secondAsset: CmsStagedMediaAsset = {
    ...stagedAsset(),
    publicId: `${providerPublicId}-two`,
    secureUrl: providerSecureUrl.replace("image-one", "image-one-two"),
  };
  const mock = installBrowserMocks(async () => {
    attempt += 1;
    return attempt === 1
      ? jsonResponse({ removed: true })
      : jsonResponse({ error: "Cleanup unavailable." }, 503);
  }, []);

  try {
    const result = await rollbackStagedCmsMediaAssets(submissionId, [
      stagedAsset(),
      stagedAsset(),
      secondAsset,
    ]);
    assert.deepEqual(result, {
      attempted: 2,
      removed: 1,
      failed: 1,
      items: [
        { publicId: providerPublicId, removed: true },
        { publicId: secondAsset.publicId, removed: false },
      ],
    });
    assert.equal(mock.fetchCalls.length, 2);
    assert.deepEqual(requestBody(mock.fetchCalls[0]), {
      submissionId,
      scope: "service-gallery",
      publicId: providerPublicId,
      secureUrl: providerSecureUrl,
      stagedToken: stagedAsset().stagedToken,
    });
    assert.equal(mock.fetchCalls[0]?.init.credentials, "same-origin");
    assert.equal(mock.fetchCalls[0]?.init.cache, "no-store");
  } finally {
    mock.restore();
  }
});

test("submission envelope contains only server-verified staged references", () => {
  assert.deepEqual(createCmsMediaSubmissionEnvelope(submissionId, [stagedAsset()]), {
    submissionId,
    assets: [
      {
        scope: "service-gallery",
        publicId: providerPublicId,
        secureUrl: providerSecureUrl,
        stagedToken: stagedAsset().stagedToken,
      },
    ],
  });
});

test("client source has no immediate fetch upload, secret handling or logging", async () => {
  const source = await readFile(
    resolve(process.cwd(), "src/lib/media/cms-media-client.ts"),
    "utf8",
  );

  assert.match(source, /new XMLHttpRequest\(\)/);
  assert.match(source, /form\.append\("file", file, file\.name\)/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /cleanupAuthorizedUpload/);
  assert.match(source, /xhr\.responseType = "text"/);
  assert.match(source, /authorization\.publicId/);
  assert.match(source, /Date\.parse\(expiresAt\) <= Date\.now\(\)/);
  assert.match(source, /rollbackStagedCmsMediaAssets/);
  assert.match(source, /for \(let index = 0; index < items\.length; index \+= 1\)/);
  assert.doesNotMatch(source, /apiSecret|api_secret|CLOUDINARY_API_SECRET/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
});

"use client";

import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ImagePlus,
  Images,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";

import {
  MAX_SERVICE_GALLERY_IMAGES,
  type CmsServiceGalleryImage,
} from "@/domain/cms/service-gallery";
import type { PreparedClientImage } from "@/lib/media/client-image";
import {
  isApprovedImageUrlForOwnership,
  type CloudinaryDeliveryOwnership,
} from "@/lib/media/cloudinary-delivery";

import { CmsImageUploadField } from "./CmsImageUploadField";

import styles from "./ServiceGalleryEditor.module.css";

export type ServiceGalleryEditorProps = {
  readonly images: readonly CmsServiceGalleryImage[];
  readonly onChange: (images: readonly CmsServiceGalleryImage[]) => void;
  readonly cloudinaryOwnership?: CloudinaryDeliveryOwnership | null;
  readonly preparedImages?: Readonly<
    Record<string, PreparedClientImage | null | undefined>
  >;
  readonly onPreparedImageChange?: (
    imageId: string,
    image: PreparedClientImage | null,
  ) => void;
  readonly onPreparationBusyChange?: (
    imageId: string,
    isBusy: boolean,
  ) => void;
};

export function ServiceGalleryEditor({
  images,
  onChange,
  cloudinaryOwnership,
  preparedImages = {},
  onPreparedImageChange,
  onPreparationBusyChange,
}: ServiceGalleryEditorProps) {
  const editorId = useId();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function updateImage(
    imageId: string,
    changes: Partial<CmsServiceGalleryImage>,
  ) {
    onChange(
      images.map((image) =>
        image.id === imageId ? { ...image, ...changes } : image,
      ),
    );
  }

  function addImage() {
    if (images.length >= MAX_SERVICE_GALLERY_IMAGES) return;

    onChange([
      ...images,
      {
        id: `gallery-${crypto.randomUUID()}`,
        imageUrl: "",
        altText: "",
        caption: "",
      },
    ]);
    setStatusMessage(`Added image ${images.length + 1}.`);
  }

  function removeImage(imageId: string, index: number) {
    const nextImages = images.filter((image) => image.id !== imageId);
    const focusImage = nextImages[Math.min(index, nextImages.length - 1)];

    onPreparedImageChange?.(imageId, null);
    onChange(nextImages);
    setStatusMessage(
      `Removed image ${index + 1}. ${nextImages.length} ${nextImages.length === 1 ? "image remains" : "images remain"}.`,
    );
    window.requestAnimationFrame(() => {
      if (focusImage) {
        removeButtonRefs.current[focusImage.id]?.focus();
      } else {
        addButtonRef.current?.focus();
      }
    });
  }

  function moveImageBy(imageId: string, direction: -1 | 1) {
    const currentIndex = images.findIndex((image) => image.id === imageId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= images.length) return;

    const reordered = [...images];
    [reordered[currentIndex], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[currentIndex],
    ];
    onChange(reordered);
    setStatusMessage(
      `Moved image ${currentIndex + 1} to position ${nextIndex + 1}.`,
    );
  }

  function moveImageTo(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    const sourceIndex = images.findIndex((image) => image.id === sourceId);
    const targetIndex = images.findIndex((image) => image.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reordered = [...images];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    onChange(reordered);
    const nextIndex = reordered.findIndex((image) => image.id === sourceId);
    setStatusMessage(
      `Moved image ${sourceIndex + 1} to position ${nextIndex + 1}.`,
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <p>
          <strong>{images.length} of {MAX_SERVICE_GALLERY_IMAGES}</strong>
          <span> images in display order</span>
        </p>
        <button
          className={styles.addButton}
          disabled={images.length >= MAX_SERVICE_GALLERY_IMAGES}
          onClick={addImage}
          ref={addButtonRef}
          type="button"
        >
          <ImagePlus aria-hidden="true" />
          Add image
        </button>
      </div>

      <div className={styles.providerNotice}>
        <Images aria-hidden="true" />
        <p>
          Choose a file inside an image card to prepare it locally. It stays on
          this device until the service form is saved. Removing a card only
          detaches its saved image from this treatment.
        </p>
      </div>

      {images.length ? (
        <div className={styles.list}>
          {images.map((image, index) => {
            const canPreview = isApprovedImageUrlForOwnership(
              image.imageUrl,
              cloudinaryOwnership,
            );
            const isDropTarget = dropTargetId === image.id && draggedId !== image.id;
            const cardHeadingId = `${editorId}-image-${index + 1}-heading`;

            return (
              <article
                aria-labelledby={cardHeadingId}
                className={`${styles.card} ${isDropTarget ? styles.dropTarget : ""}`}
                key={image.id}
                onDragEnter={(event) => {
                  if (!draggedId || draggedId === image.id) return;
                  event.preventDefault();
                  setDropTargetId(image.id);
                }}
                onDragOver={(event) => {
                  if (!draggedId || draggedId === image.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId =
                    event.dataTransfer.getData("text/plain") || draggedId;
                  if (sourceId) moveImageTo(sourceId, image.id);
                  setDraggedId(null);
                  setDropTargetId(null);
                }}
              >
                <header className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.order} id={cardHeadingId}>Image {index + 1}</h3>
                    <span className={styles.orderHint}>Drag or use the arrow buttons</span>
                  </div>
                  <div className={styles.orderActions}>
                    <span
                      aria-hidden="true"
                      className={styles.dragHandle}
                      data-drag-handle
                      draggable={images.length > 1}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTargetId(null);
                      }}
                      onDragStart={(event) => {
                        setDraggedId(image.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", image.id);
                      }}
                      title="Drag to reorder"
                    >
                      <GripVertical aria-hidden="true" />
                    </span>
                    <button
                      aria-label={`Move image ${index + 1} up`}
                      className={styles.iconButton}
                      disabled={index === 0}
                      onClick={() => moveImageBy(image.id, -1)}
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Move image ${index + 1} down`}
                      className={styles.iconButton}
                      disabled={index === images.length - 1}
                      onClick={() => moveImageBy(image.id, 1)}
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Remove image ${index + 1} from this treatment`}
                      className={styles.removeButton}
                      onClick={() => removeImage(image.id, index)}
                      ref={(element) => {
                        removeButtonRefs.current[image.id] = element;
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div className={styles.cardBody}>
                  <div className={styles.previewColumn}>
                    <div className={styles.preview}>
                      {canPreview ? (
                        <Image
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="(max-width: 760px) 100vw, 34vw"
                          src={image.imageUrl}
                        />
                      ) : (
                        <div className={styles.previewEmpty}>
                          <Images aria-hidden="true" />
                          <span>Choose a file below to prepare this image</span>
                        </div>
                      )}
                    </div>
                    <p className={styles.previewHint}>
                      Gallery images use a centred 16:9 crop on the public page.
                    </p>
                  </div>

                  <div className={styles.fields}>
                    <div className={styles.compressor}>
                      <CmsImageUploadField
                        description="Choose a replacement for this gallery position. The compressed file stays local until the service form is saved."
                        inputId={`${editorId}-image-${index + 1}-file`}
                        label={`Prepare file for image ${index + 1}`}
                        onBusyChange={(isBusy) =>
                          onPreparationBusyChange?.(image.id, isBusy)
                        }
                        onPreparedImageChange={(preparedImage) =>
                          onPreparedImageChange?.(image.id, preparedImage)
                        }
                        preparedImage={preparedImages[image.id] ?? null}
                        required={!image.imageUrl && !preparedImages[image.id]}
                      />
                    </div>
                    <label className={styles.fullField}>
                      Alternative text
                      <input
                        maxLength={180}
                        minLength={8}
                        onChange={(event) =>
                          updateImage(image.id, { altText: event.target.value })
                        }
                        required
                        value={image.altText}
                      />
                      <small>Describe what is visible without starting with “image of”.</small>
                    </label>
                    <label className={styles.fullField}>
                      Caption
                      <input
                        maxLength={240}
                        minLength={2}
                        onChange={(event) =>
                          updateImage(image.id, { caption: event.target.value })
                        }
                        required
                        value={image.caption}
                      />
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Images aria-hidden="true" />
          <div>
            <strong>No gallery images</strong>
            <p>The public treatment page will safely use its primary image.</p>
          </div>
        </div>
      )}
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>
    </div>
  );
}

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
  DEFAULT_HOME_HERO_FOCAL_POSITION,
  MAX_HOME_HERO_SLIDES,
  type CmsPageHeroSlide,
} from "@/domain/cms/page-hero";
import type { PreparedClientImage } from "@/lib/media/client-image";
import {
  isApprovedImageUrlForOwnership,
  type CloudinaryDeliveryOwnership,
} from "@/lib/media/cloudinary-delivery";

import { CmsImageUploadField } from "./CmsImageUploadField";

import styles from "./HomeHeroSlidesEditor.module.css";

export type HomeHeroSlidesEditorProps = {
  readonly slides: readonly CmsPageHeroSlide[];
  readonly onChange: (slides: readonly CmsPageHeroSlide[]) => void;
  readonly cloudinaryOwnership?: CloudinaryDeliveryOwnership | null;
  readonly preparedImages?: Readonly<
    Record<string, PreparedClientImage | null | undefined>
  >;
  readonly onPreparedImageChange?: (
    slideId: string,
    image: PreparedClientImage | null,
  ) => void;
  readonly onPreparationBusyChange?: (
    slideId: string,
    isBusy: boolean,
  ) => void;
};

export function HomeHeroSlidesEditor({
  slides,
  onChange,
  cloudinaryOwnership,
  preparedImages = {},
  onPreparedImageChange,
  onPreparationBusyChange,
}: HomeHeroSlidesEditorProps) {
  const editorId = useId();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function updateSlide(slideId: string, changes: Partial<CmsPageHeroSlide>) {
    onChange(
      slides.map((slide) =>
        slide.id === slideId ? { ...slide, ...changes } : slide,
      ),
    );
  }

  function addSlide() {
    if (slides.length >= MAX_HOME_HERO_SLIDES) return;
    onChange([
      ...slides,
      {
        id: `home-slide-${crypto.randomUUID()}`,
        imageUrl: "",
        altText: "",
        title: "",
        focalX: DEFAULT_HOME_HERO_FOCAL_POSITION,
        focalY: DEFAULT_HOME_HERO_FOCAL_POSITION,
      },
    ]);
    setStatusMessage(`Added slide ${slides.length + 1}.`);
  }

  function moveSlideBy(slideId: string, direction: -1 | 1) {
    const currentIndex = slides.findIndex((slide) => slide.id === slideId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= slides.length) return;
    const reordered = [...slides];
    [reordered[currentIndex], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[currentIndex],
    ];
    onChange(reordered);
    setStatusMessage(
      `Moved slide ${currentIndex + 1} to position ${nextIndex + 1}.`,
    );
  }

  function moveSlideTo(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const sourceIndex = slides.findIndex((slide) => slide.id === sourceId);
    const targetIndex = slides.findIndex((slide) => slide.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    onChange(reordered);
    const nextIndex = reordered.findIndex((slide) => slide.id === sourceId);
    setStatusMessage(
      `Moved slide ${sourceIndex + 1} to position ${nextIndex + 1}.`,
    );
  }

  function removeSlide(slideId: string, index: number) {
    const nextSlides = slides.filter((item) => item.id !== slideId);
    const focusSlide = nextSlides[Math.min(index, nextSlides.length - 1)];

    onPreparedImageChange?.(slideId, null);
    onChange(nextSlides);
    setStatusMessage(
      `Removed slide ${index + 1}. ${nextSlides.length} ${nextSlides.length === 1 ? "slide remains" : "slides remain"}.`,
    );
    window.requestAnimationFrame(() => {
      if (focusSlide) {
        removeButtonRefs.current[focusSlide.id]?.focus();
      } else {
        addButtonRef.current?.focus();
      }
    });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <p>
          <strong>{slides.length} of {MAX_HOME_HERO_SLIDES}</strong>
          <span> slides in display order</span>
        </p>
        <button
          className={styles.addButton}
          disabled={slides.length >= MAX_HOME_HERO_SLIDES}
          onClick={addSlide}
          ref={addButtonRef}
          type="button"
        >
          <ImagePlus aria-hidden="true" />
          Add slide
        </button>
      </div>

      <div className={styles.providerNotice}>
        <Images aria-hidden="true" />
        <p>
          Choose a file inside a slide card to prepare it locally. It stays on
          this device until the page form is saved. Existing project paths and
          approved HTTPS URLs remain usable; removing a slide only detaches it
          and never deletes the stored asset.
        </p>
      </div>

      <div className={styles.list}>
        {slides.map((slide, index) => {
          const canPreview = isApprovedImageUrlForOwnership(
            slide.imageUrl,
            cloudinaryOwnership,
          );
          const isDropTarget =
            dropTargetId === slide.id && draggedId !== slide.id;
          const cardHeadingId = `${editorId}-slide-${index + 1}-heading`;

          return (
            <article
              aria-labelledby={cardHeadingId}
              className={`${styles.card} ${isDropTarget ? styles.dropTarget : ""}`}
              key={slide.id}
              onDragEnter={(event) => {
                if (!draggedId || draggedId === slide.id) return;
                event.preventDefault();
                setDropTargetId(slide.id);
              }}
              onDragOver={(event) => {
                if (!draggedId || draggedId === slide.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId =
                  event.dataTransfer.getData("text/plain") || draggedId;
                if (sourceId) moveSlideTo(sourceId, slide.id);
                setDraggedId(null);
                setDropTargetId(null);
              }}
            >
              <header className={styles.cardHeader}>
                <div>
                  <h3 id={cardHeadingId}>Slide {index + 1}</h3>
                  <span>Drag or use the arrow buttons</span>
                </div>
                <div className={styles.orderActions}>
                  <span
                    aria-hidden="true"
                    className={styles.iconButton}
                    data-drag-handle
                    draggable={slides.length > 1}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTargetId(null);
                    }}
                    onDragStart={(event) => {
                      setDraggedId(slide.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", slide.id);
                    }}
                    title="Drag to reorder"
                  >
                    <GripVertical aria-hidden="true" />
                  </span>
                  <button
                    aria-label={`Move slide ${index + 1} up`}
                    className={styles.iconButton}
                    disabled={index === 0}
                    onClick={() => moveSlideBy(slide.id, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Move slide ${index + 1} down`}
                    className={styles.iconButton}
                    disabled={index === slides.length - 1}
                    onClick={() => moveSlideBy(slide.id, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Remove slide ${index + 1}`}
                    className={styles.removeButton}
                    disabled={slides.length <= 1}
                    onClick={() => removeSlide(slide.id, index)}
                    ref={(element) => {
                      removeButtonRefs.current[slide.id] = element;
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div className={styles.cardBody}>
                <div className={styles.preview}>
                  {canPreview ? (
                    <Image
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes="(max-width: 760px) 100vw, 36vw"
                      src={slide.imageUrl}
                      style={{
                        objectPosition: `${slide.focalX}% ${slide.focalY}%`,
                      }}
                    />
                  ) : (
                    <div className={styles.previewEmpty}>
                      <Images aria-hidden="true" />
                      <span>
                        {slide.imageUrl.startsWith("https://")
                          ? "This remote image is outside the approved Cloudinary library"
                          : "Choose a file or enter a valid project image path"}
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.fields}>
                  <div className={styles.compressor}>
                    <CmsImageUploadField
                      description="Choose a replacement for this slide. The compressed file stays local until the page form is saved."
                      inputId={`${editorId}-slide-${index + 1}-file`}
                      label={`Prepare file for slide ${index + 1}`}
                      onBusyChange={(isBusy) =>
                        onPreparationBusyChange?.(slide.id, isBusy)
                      }
                      onPreparedImageChange={(preparedImage) =>
                        onPreparedImageChange?.(slide.id, preparedImage)
                      }
                      preparedImage={preparedImages[slide.id] ?? null}
                    />
                  </div>
                  <label className={styles.fullField}>
                    Image path or approved HTTPS URL
                    <input
                      maxLength={2_048}
                      onChange={(event) =>
                        updateSlide(slide.id, { imageUrl: event.target.value })
                      }
                      placeholder="/images/hero/slide-new.webp"
                      required={!preparedImages[slide.id]}
                      value={slide.imageUrl}
                    />
                  </label>
                  <label className={styles.field}>
                    Slide label
                    <input
                      maxLength={100}
                      minLength={2}
                      onChange={(event) =>
                        updateSlide(slide.id, { title: event.target.value })
                      }
                      required
                      value={slide.title}
                    />
                    <small>Used by screen-reader slide announcements.</small>
                  </label>
                  <label className={styles.field}>
                    Alternative text
                    <input
                      maxLength={180}
                      minLength={8}
                      onChange={(event) =>
                        updateSlide(slide.id, { altText: event.target.value })
                      }
                      required
                      value={slide.altText}
                    />
                    <small>Describe the visible scene without saying “image of”.</small>
                  </label>
                  <div className={styles.focalGrid}>
                    <label>
                      <span>Horizontal focus <strong>{slide.focalX}%</strong></span>
                      <input
                        aria-label={`Horizontal focal position for slide ${index + 1}`}
                        max={100}
                        min={0}
                        onChange={(event) =>
                          updateSlide(slide.id, {
                            focalX: Number(event.target.value),
                          })
                        }
                        type="range"
                        value={slide.focalX}
                      />
                    </label>
                    <label>
                      <span>Vertical focus <strong>{slide.focalY}%</strong></span>
                      <input
                        aria-label={`Vertical focal position for slide ${index + 1}`}
                        max={100}
                        min={0}
                        onChange={(event) =>
                          updateSlide(slide.id, {
                            focalY: Number(event.target.value),
                          })
                        }
                        type="range"
                        value={slide.focalY}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>
    </div>
  );
}

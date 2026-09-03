"use client";

import Image from "next/image";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import type { PublicVoucher } from "@/domain/public-site";

import styles from "./VoucherSlider.module.css";

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
};

export function VoucherSlider({
  vouchers,
}: Readonly<{ vouchers: readonly PublicVoucher[] }>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.removeAttribute("data-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.currentTarget.scrollBy({
      behavior: "smooth",
      left: event.key === "ArrowRight"
        ? event.currentTarget.clientWidth * 0.72
        : event.currentTarget.clientWidth * -0.72,
    });
  }

  return (
    <div className={styles.slider}>
      <p className={styles.instructions} id="voucher-slider-instructions">
        Drag horizontally, swipe, or use the left and right arrow keys to browse vouchers.
      </p>
      <div
        aria-describedby="voucher-slider-instructions"
        aria-label="Gift vouchers"
        aria-roledescription="carousel"
        className={styles.track}
        onKeyDown={handleKeyDown}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: event.currentTarget.scrollLeft,
          };
          event.currentTarget.dataset.dragging = "true";
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.currentTarget.scrollLeft =
            drag.startScrollLeft - (event.clientX - drag.startX);
        }}
        onPointerUp={endDrag}
        ref={trackRef}
        role="region"
        tabIndex={0}
      >
        {vouchers.map((voucher) => (
          <article className={styles.card} key={voucher.id}>
            <div className={styles.imageFrame}>
              <Image
                alt={voucher.imageAlt}
                draggable={false}
                fill
                sizes="(max-width: 700px) 88vw, 58vw"
                src={voucher.imageUrl}
              />
            </div>
            <h3>{voucher.title}</h3>
          </article>
        ))}
      </div>
    </div>
  );
}

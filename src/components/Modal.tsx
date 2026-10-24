"use client";
import { useEffect, useRef, useId } from "react";
export default function Modal({
  title,
  close,
  children,
  message,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  message?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const outsidePointer = useRef(false);
  function isOutside(dialog: HTMLDialogElement, x: number, y: number) {
    const box = dialog.getBoundingClientRect();
    return x < box.left || x > box.right || y < box.top || y > box.bottom;
  }
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const d = ref.current!;
    d.showModal();
    return () => {
      d.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onPointerDown={(e) => {
        outsidePointer.current =
          e.target === e.currentTarget &&
          isOutside(e.currentTarget, e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        outsidePointer.current = false;
      }}
      onClick={(e) => {
        const shouldClose =
          outsidePointer.current &&
          e.target === e.currentTarget &&
          isOutside(e.currentTarget, e.clientX, e.clientY);
        outsidePointer.current = false;
        if (shouldClose) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon secondary"
          aria-label="Fermer"
          onClick={close}
        >
          ✕
        </button>
      </header>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {children}
    </dialog>
  );
}

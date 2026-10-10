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
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon secondary" aria-label="Fermer" onClick={close}>
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

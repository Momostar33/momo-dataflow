import { useState, useRef, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
export function SidePanel({
  children,
  initial = 280,
}: {
  children: ReactNode;
  initial?: number;
}) {
  const [width, setWidth] = useState(initial),
    start = useRef<{ x: number; width: number } | null>(null);
  return (
    <aside className="studio-side" style={{ width }}>
      {children}
      <div
        role="separator"
        tabIndex={0}
        aria-label="调整侧栏宽度"
        aria-valuenow={width}
        aria-valuemin={220}
        aria-valuemax={520}
        className="studio-resize"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth((w) => Math.max(220, w - 20));
          if (e.key === "ArrowRight") setWidth((w) => Math.min(520, w + 20));
        }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current)
            setWidth(
              Math.max(
                220,
                Math.min(
                  520,
                  start.current.width + e.clientX - start.current.x,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          start.current = null;
        }}
      />
    </aside>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="studio-empty">{children}</div>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,select,button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="studio-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
              ),
            ];
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="studio-modal-title">
          <h3>{title}</h3>
          <button aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

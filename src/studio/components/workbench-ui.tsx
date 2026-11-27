import { uiText, useUiLanguage } from "../i18n";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
export function SidePanel({
  children,
  initial = 280,
}: {
  children: ReactNode;
  initial?: number;
}) {
  useUiLanguage();
  const [width, setWidth] = useState(initial),
    start = useRef<{
      x: number;
      width: number;
    } | null>(null);
  return (
    <aside className="studio-side" style={{ width }}>
      {children}
      <div
        role="separator"
        tabIndex={0}
        aria-label={uiText("调整侧栏宽度")}
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
  useUiLanguage();
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
  useUiLanguage();
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
          <button aria-label={uiText("关闭")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
/** Right-hand inspector. Folding keeps private form components mounted. */
export function PropertiesPanel({ children }: { children: ReactNode }) {
  useUiLanguage();
  const preference = "stackrender.properties-width";
  const [width, setWidth] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(preference);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value)
        ? Math.max(280, Math.min(640, value))
        : null;
    } catch {
      return null;
    }
  });
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef<HTMLElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(440);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () =>
      setMeasuredWidth(Math.round(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const start = useRef<{
    x: number;
    width: number;
  } | null>(null);
  useEffect(() => {
    try {
      if (width === null) localStorage.removeItem(preference);
      else localStorage.setItem(preference, String(width));
    } catch {
      /* Width changes still work when browser storage is unavailable. */
    }
  }, [width]);
  const clamp = (value: number) => Math.max(280, Math.min(640, value));
  return (
    <aside
      ref={panel}
      className={`studio-properties ${collapsed ? "is-collapsed" : ""}`}
      style={collapsed ? { width: 32 } : width === null ? undefined : { width }}
    >
      {!collapsed && (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={uiText("调整右侧属性栏宽度")}
          aria-valuenow={measuredWidth}
          aria-valuemin={280}
          aria-valuemax={640}
          className="studio-properties-resize"
          title={uiText("拖动调整宽度，双击恢复默认")}
          onDoubleClick={() => setWidth(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const current =
                e.currentTarget.parentElement?.getBoundingClientRect().width ??
                440;
              setWidth(clamp(current + (e.key === "ArrowLeft" ? 20 : -20)));
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            start.current = {
              x: e.clientX,
              width:
                e.currentTarget.parentElement?.getBoundingClientRect().width ??
                440,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current)
              setWidth(
                clamp(start.current.width + start.current.x - e.clientX),
              );
          }}
          onPointerUp={(e) => {
            start.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
          onLostPointerCapture={() => {
            start.current = null;
          }}
        />
      )}
      <button
        className="studio-properties-toggle"
        aria-label={
          collapsed ? uiText("展开右侧属性栏") : uiText("收起右侧属性栏")
        }
        aria-expanded={!collapsed}
        title={collapsed ? uiText("展开属性栏") : uiText("收起属性栏")}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? "‹" : "›"}
      </button>
      <div className="studio-properties-body" hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}

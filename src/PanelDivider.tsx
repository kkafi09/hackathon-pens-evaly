import { useRef } from 'react';

export default function PanelDivider({
  ratio,
  onChange,
}: {
  ratio: number;
  onChange: (value: number) => void;
}) {
  const dragging = useRef(false);
  function apply(element: HTMLElement, value: number) {
    const width = element.parentElement!.getBoundingClientRect().width;
    const min = (320 / width) * 100,
      max = Math.min(60, ((width - 370) / width) * 100);
    const next = Math.max(min, Math.min(max, value));
    onChange(next);
    localStorage.setItem('evaly-panel-ratio', String(next));
  }
  return (
    <div
      className="panel-divider"
      role="separator"
      tabIndex={0}
      aria-label="Lebar sidebar analisis"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={60}
      aria-valuenow={Math.round(ratio)}
      title="Geser untuk mengubah lebar. Klik dua kali untuk reset."
      onDoubleClick={(e) => apply(e.currentTarget, 100 / 3)}
      onKeyDown={(e) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'Enter'].includes(e.key)) {
          e.preventDefault();
          apply(
            e.currentTarget,
            e.key === 'Home' || e.key === 'Enter'
              ? 100 / 3
              : ratio + (e.key === 'ArrowLeft' ? 2 : -2),
          );
        }
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const bounds = e.currentTarget.parentElement!.getBoundingClientRect();
        apply(e.currentTarget, ((bounds.right - e.clientX) / bounds.width) * 100);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
      }}
    >
      <span />
    </div>
  );
}

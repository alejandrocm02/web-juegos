import { useRef, useState, type ReactNode } from 'react';

/** A held control releases on cancellation/capture loss and supports keyboard use. */
export function HoldButton({
  label,
  children,
  onChange,
  active,
}: {
  label: string;
  children: ReactNode;
  onChange: (active: boolean) => void;
  active?: boolean;
}) {
  const held = useRef(false);
  const [pressed, setPressed] = useState(false);
  const change = (next: boolean) => {
    if (held.current === next) return;
    held.current = next;
    setPressed(next);
    onChange(next);
  };
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? pressed}
      className="game-hold-button"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        change(true);
      }}
      onPointerUp={() => change(false)}
      onPointerCancel={() => change(false)}
      onLostPointerCapture={() => change(false)}
      onBlur={() => change(false)}
      onKeyDown={(event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        event.preventDefault();
        change(true);
      }}
      onKeyUp={(event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        event.preventDefault();
        change(false);
      }}
    >
      {children}
    </button>
  );
}

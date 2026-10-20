/** Keyboard shortcuts must leave forms, buttons and modal dialogs usable. */
export function acceptsGameKeys(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !(
      target instanceof Element &&
      target.closest('input, textarea, select, button, a, [contenteditable="true"]')
    ) &&
    !document.querySelector('[aria-modal="true"]')
  );
}

/** Tracks physical keys so releasing W does not release a still-held ArrowUp. */
export function listenGameKeys(
  mapping: Record<string, string>,
  changed: (actions: Set<string>) => void,
  reset: () => void,
): () => void {
  const held = new Set<string>();
  const publish = () => changed(new Set([...held].map((code) => mapping[code]!)));
  const clear = () => {
    held.clear();
    reset();
  };
  const down = (event: KeyboardEvent) => {
    if (!mapping[event.code] || !acceptsGameKeys(event)) return;
    event.preventDefault();
    if (event.repeat || held.has(event.code)) return;
    held.add(event.code);
    publish();
  };
  const up = (event: KeyboardEvent) => {
    if (!held.delete(event.code)) return;
    event.preventDefault();
    publish();
  };
  const visibility = () => {
    if (document.hidden) clear();
  };
  const focus = (event: FocusEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest('input, textarea, select, button, [aria-modal="true"]')
    )
      clear();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('focusin', focus);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('focusin', focus);
    clear();
  };
}

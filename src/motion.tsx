import { useEffect, useState, type ReactNode } from 'react';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return reduced;
}

// Retain the last visible value only for its exit transition; never delay model status.
export function usePresence<T>(value: T | null, duration = 200, scope?: unknown) {
  const reduced = useReducedMotion();
  const [retained, setRetained] = useState({ value, scope });
  if (value !== null && (retained.value !== value || retained.scope !== scope)) {
    setRetained({ value, scope });
  }
  useEffect(() => {
    if (value !== null) return;
    const timer = setTimeout(() => setRetained({ value: null, scope }), reduced ? 0 : duration);
    return () => clearTimeout(timer);
  }, [value, duration, reduced, scope]);
  return {
    value: value ?? (reduced || retained.scope !== scope ? null : retained.value),
    exiting: value === null,
  };
}

export function useAnimatedTab(value: string) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(value);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (reduced || value === visible) return;
    const timer = setTimeout(() => {
      setVisible(value);
      setEntering(true);
    }, 90);
    return () => clearTimeout(timer);
  }, [value, visible, reduced]);
  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(() => setEntering(false), 180);
    return () => clearTimeout(timer);
  }, [entering, visible]);
  return {
    visible: reduced ? value : visible,
    phase: value !== visible && !reduced ? 'exit' : entering ? 'enter' : 'idle',
  };
}

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const presence = usePresence(open ? true : null, 250);
  return (
    <div className={`motion-collapse ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
      <div>{presence.value && children}</div>
    </div>
  );
}

import type React from 'react';

/**
 * Controles compartidos por todos los paneles de configuracion.
 *
 * Viven aparte para que anadir un juego nuevo consista en escribir su panel y
 * registrarlo, sin tocar ningun fichero grande.
 */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={
            'rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ' +
            (option.value === value
              ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Texto para las configuraciones que un modo concreto deja fijas. */
export function FixedNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field label={label}>
      <p className="text-sm text-slate-400">{children}</p>
    </Field>
  );
}

import { useEffect, useState } from 'react';

/**
 * A number box you can clear and retype freely. It keeps what you typed as text
 * (so "" or "7." are fine mid-edit) and reports a number, or NaN while empty or invalid.
 */
export default function NumberField({ value, onChange, placeholder, className, ariaLabel, style }: {
  value: number | null; onChange: (n: number) => void; placeholder?: string;
  className?: string; ariaLabel?: string; style?: React.CSSProperties;
}) {
  const shown = (v: number | null) => (v === null || Number.isNaN(v) ? '' : String(v));
  const [text, setText] = useState(shown(value));
  // Follow outside changes (switching tabs, loading, resets) without fighting the user's typing.
  useEffect(() => {
    const typed = text.trim() === '' ? NaN : Number(text);
    const same = (Number.isNaN(typed) && (value === null || Number.isNaN(value))) || typed === value;
    if (!same) setText(shown(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input type="text" inputMode="decimal" className={className} style={style} aria-label={ariaLabel} placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        onChange(t.trim() === '' || t === '.' ? NaN : Number(t));
      }} />
  );
}

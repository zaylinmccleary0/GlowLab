import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { colors, styles } from './theme';

/**
 * A number box you can clear and retype freely. It keeps what you typed as text
 * (so "" or "7." are fine mid-edit) and reports a number, or NaN while empty or invalid.
 */
export default function NumberInput({ value, onChange, placeholder }: {
  value: number | null; onChange: (n: number) => void; placeholder?: string;
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
    <TextInput style={styles.input} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={colors.muted}
      value={text}
      onChangeText={(v) => {
        const t = v.replace(/[^0-9.]/g, '');
        setText(t);
        onChange(t.trim() === '' || t === '.' ? NaN : Number(t));
      }} />
  );
}

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon } from 'lucide-react';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className = 'form-input',
  style,
  placeholder,
  min,
  max,
  required,
  autoFocus,
  disabled,
  ...props
}) => {
  const { i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    if (hiddenDateRef.current) {
      if ('showPicker' in HTMLInputElement.prototype) {
        try {
          hiddenDateRef.current.showPicker();
        } catch {
          hiddenDateRef.current.focus();
        }
      } else {
        hiddenDateRef.current.focus();
      }
    }
  };

  if (!isEn) {
    return (
      <input
        type="date"
        className={className}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        {...props}
      />
    );
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', ...style }}>
      <input
        type="text"
        className={className}
        placeholder={placeholder || 'YYYY-MM-DD'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', paddingRight: '36px' }}
        pattern="\d{4}-\d{2}-\d{2}"
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        style={{
          position: 'absolute',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: 'var(--border-radius-sm)',
        }}
        title="Open calendar"
      >
        <CalendarIcon size={16} />
      </button>
      <input
        ref={hiddenDateRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
        }}
        tabIndex={-1}
      />
    </div>
  );
};
export default DateInput;

import { useId, useRef } from 'react';

type SearchBarProps = {
  value: string;
  onChange(value: string): void;
  /** Read by screen readers and shown as the placeholder. */
  label?: string;
};

/**
 * The search input. It only reports what was typed: results are the caller's business,
 * so the input never waits for them (docs/plans/search.md §5).
 */
function SearchBar({ value, onChange, label = 'Hae tuotteita' }: SearchBarProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className="search-bar"
      onSubmit={(event) => {
        // Search runs as you type; Enter only hides the phone keyboard.
        event.preventDefault();
        input.current?.blur();
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Tyhjennä haku"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </form>
  );
}

export default SearchBar;

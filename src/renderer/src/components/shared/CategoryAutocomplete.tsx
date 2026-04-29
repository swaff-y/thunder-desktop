import { useState, useRef, useEffect } from "react";
import { useCategoryList } from "../../hooks/useCategories";
import { nameEncode } from "../../utils/nameEncode";
import type { RecordRef } from "../../types";

interface CategoryAutocompleteProps {
  apiPath: string;
  placeholder?: string;
  onSelect: (item: RecordRef) => void;
  disabled?: boolean;
}

const MIN_CHARS = 3;

export default function CategoryAutocomplete({
  apiPath,
  placeholder = "Search...",
  onSelect,
  disabled = false,
}: CategoryAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data } = useCategoryList(apiPath);
  const allItems = data?.pages.flatMap((p) => p.data) ?? [];

  const lower = query.toLowerCase();
  const filtered =
    query.length >= MIN_CHARS
      ? allItems.filter((item) => item.name.toLowerCase().includes(lower))
      : [];

  const showCreate =
    query.length >= MIN_CHARS &&
    !allItems.some((item) => item.name.toLowerCase() === lower);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: RecordRef) => {
    onSelect(item);
    setQuery("");
    setOpen(false);
  };

  const handleCreate = async () => {
    const trimmed = query.trim();
    const id = await nameEncode(trimmed);
    onSelect({ id, name: trimmed });
    setQuery("");
    setOpen(false);
  };

  const showDropdown = open && query.length >= MIN_CHARS && (filtered.length > 0 || showCreate);

  return (
    <div className="cat-autocomplete" ref={wrapperRef}>
      <input
        type="text"
        className="cat-autocomplete-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.length >= MIN_CHARS && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {showDropdown && (
        <div className="cat-autocomplete-dropdown">
          {filtered.slice(0, 8).map((item) => (
            <button
              key={item.id}
              className="cat-autocomplete-option"
              onClick={() => handleSelect({ id: item.id, name: item.name })}
            >
              {item.name}
            </button>
          ))}
          {showCreate && (
            <button
              className="cat-autocomplete-option cat-autocomplete-create"
              onClick={handleCreate}
            >
              Create: {query.trim()}
            </button>
          )}
        </div>
      )}

      <style>{`
        .cat-autocomplete {
          position: relative;
        }
        .cat-autocomplete-input {
          width: 100%;
          padding: var(--space-xs) var(--space-sm);
          background: var(--color-bg-alt);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          font-size: var(--text-body-sm);
          outline: none;
          transition: border-color 0.2s;
        }
        .cat-autocomplete-input:focus {
          border-color: var(--color-accent);
        }
        .cat-autocomplete-input:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cat-autocomplete-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 100;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          margin-top: 2px;
          max-height: 200px;
          overflow-y: auto;
          box-shadow: var(--shadow-floating);
        }
        .cat-autocomplete-option {
          display: block;
          width: 100%;
          padding: var(--space-xs) var(--space-sm);
          background: none;
          border: none;
          color: var(--color-text);
          font-size: var(--text-body-sm);
          text-align: left;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cat-autocomplete-option:hover {
          background: rgba(14, 165, 233, 0.1);
        }
        .cat-autocomplete-create {
          color: var(--color-accent);
          font-style: italic;
          border-top: 1px solid var(--color-border);
        }
      `}</style>
    </div>
  );
}

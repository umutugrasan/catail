// The language to translate into: a button that opens a searchable list. Type a language's
// name in any of its forms ("almanca", "deutsch", "german") or its code.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { t } from "../../lib/i18n";
import { searchLanguages, translateTargets } from "../../lib/languages";
import { ChevronIcon } from "./icons";

interface Props {
  value: string;
  onChange: (code: string) => void;
}

export function LanguagePicker({ value, onChange }: Props) {
  const languages = useMemo(translateTargets, []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchLanguages(languages, query), [languages, query]);
  const current = languages.find((l) => l.code === value);

  // Opens below the button, or above it when the screen ends first.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom);
    inputRef.current?.focus();
  }, [open]);

  // Close on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) pick(results[active].code);
    } else if (e.key === "Escape") {
      // Closes only the list, not the whole card.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="lang-picker">
      <button
        type="button"
        className={`lang-picker__button${open ? " open" : ""}`}
        title={t("ocr.translate_to")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{current?.name ?? value}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className={`lang-picker__popup${up ? " lang-picker__popup--up" : ""}`}>
          <input
            ref={inputRef}
            className="lang-picker__search"
            value={query}
            placeholder={t("ocr.search_language")}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <ul ref={listRef} className="lang-picker__list" role="listbox">
            {results.map((l, i) => (
              <li
                key={l.code}
                role="option"
                aria-selected={l.code === value}
                className={`${i === active ? "active" : ""}${l.code === value ? " current" : ""}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(l.code)}
              >
                <span>{l.name}</span>
                {l.native !== l.name && <span className="lang-picker__native">{l.native}</span>}
              </li>
            ))}
            {results.length === 0 && <li className="lang-picker__empty">{t("ocr.no_language_found")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

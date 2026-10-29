import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plane, Search, X } from "lucide-react";
import {
  AIRPORT_LOGO_PLACEHOLDER_URL,
  getAirportByCode,
  searchAirports,
} from "./airportData.js";

const formatAirport = (airport) => airport ? `${airport.city} (${airport.iata})` : "";

export default function AirportAutocomplete({
  id,
  label,
  value,
  onChange,
  exclude = "",
  placeholder,
}) {
  const selectedAirport = getAirportByCode(value);
  const [query, setQuery] = useState(() => formatAirport(selectedAirport));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const clearingSelectionForTypingRef = useRef(false);
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;

  useEffect(() => {
    if (!value && clearingSelectionForTypingRef.current) {
      clearingSelectionForTypingRef.current = false;
      return;
    }
    setQuery(formatAirport(getAirportByCode(value)));
  }, [value]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const selectedText = formatAirport(selectedAirport);
  const searchQuery = selectedAirport && query === selectedText ? "" : query;
  const matches = useMemo(
    () => searchAirports(searchQuery, exclude),
    [searchQuery, exclude]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery, exclude]);

  const selectAirport = (airport) => {
    onChange(airport.iata);
    setQuery(formatAirport(airport));
    setIsOpen(false);
  };

  const clearSelection = () => {
    onChange("");
    setQuery("");
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && isOpen && matches[activeIndex]) {
      event.preventDefault();
      selectAirport(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery(selectedText);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && matches[activeIndex] ? `${listboxId}-${matches[activeIndex].iata}` : undefined}
          autoComplete="off"
          spellCheck="false"
          value={query}
          placeholder={placeholder || "Search city, airport, or IATA"}
          onFocus={(event) => {
            setIsOpen(true);
            if (selectedAirport) event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) {
              clearingSelectionForTypingRef.current = true;
              onChange("");
            }
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!isOpen) setQuery(selectedText);
          }}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 pl-10 pr-10 text-[14px] font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
        />
        {(query || value) && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={clearSelection}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
          <div className="border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Select an airport
          </div>
          <ul id={listboxId} role="listbox" className="max-h-80 overflow-y-auto overscroll-contain p-1.5">
            {matches.length > 0 ? matches.map((airport, index) => (
              <li
                id={`${listboxId}-${airport.iata}`}
                key={airport.iata}
                role="option"
                aria-selected={value === airport.iata}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectAirport(airport)}
                className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 py-3 transition ${
                  index === activeIndex ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[14px] leading-snug text-slate-800">
                    <span className="font-bold">{airport.city}</span>, {airport.country}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-slate-500">{airport.airportName}</div>
                </div>

                <span className="inline-flex rounded-lg border border-slate-200 bg-white p-1" title="ClaimYourTrip">
                  <img
                    src={AIRPORT_LOGO_PLACEHOLDER_URL}
                    alt=""
                    width="44"
                    height="28"
                    className="h-7 w-11 rounded object-cover"
                  />
                </span>

                <span className="inline-flex h-10 min-w-12 items-center justify-center rounded-xl bg-teal-50 px-2.5 text-[13px] font-extrabold tracking-wide text-[#0B2545]">
                  {airport.iata}
                </span>
              </li>
            )) : (
              <li className="px-4 py-8 text-center text-[13px] text-slate-500">
                <Plane aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                No matching airport found.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

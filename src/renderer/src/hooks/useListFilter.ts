import { useState, useEffect } from "react";

export function useListFilter(minLength = 3) {
  const [filterValue, setFilterValue] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");

  // Debounce is time-dependent state, so it must live in an effect, not be derived during render.
  useEffect(() => {
    const next = filterValue.length >= minLength ? filterValue : "";
    const timer = setTimeout(() => setDebouncedFilter(next), 200);
    return () => clearTimeout(timer);
  }, [filterValue, minLength]);

  return { filterValue, setFilterValue, debouncedFilter };
}

import { useState } from "react";

export function useListFilter<T extends { name: string }>(
  items: T[],
  minLength = 3
) {
  const [filterValue, setFilterValue] = useState("");

  const filteredItems =
    filterValue.length >= minLength
      ? items.filter((item) =>
          item.name.toLowerCase().includes(filterValue.toLowerCase())
        )
      : items;

  return { filterValue, setFilterValue, filteredItems };
}

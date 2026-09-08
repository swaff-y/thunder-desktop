# TD-081 — Filter the actors list by gender

**Type:** Enhancement — feature
**Blocked on:** [HALO-265](https://github.com/swaff-y/halo) (`gender` on an actor, `?gender=` on the collection). Merged as `cc662bc`, deployed to kaos and prod in build 839, so the parameter is live in both environments today.
**Relates to:** TD-049 (moved name matching server-side; this is the second parameter on the same request). Companions: thunder TH-042, web-thunder THW-33 — the same control, three times, because `CategoryList` was ported rather than shared.

---

## Description

Halo actors now carry a gender, and `GET /v1/actor` takes a `gender=` parameter that narrows the collection. The desktop category list has no way to send it.

This adds a gender control to the actors list and threads the value through to the request, alongside the `filter=` prefix TD-049 already sends. The two compose — `?filter=anna&gender=female` is the intersection.

### The API contract, exactly

- `GET /v1/actor?gender=male` and `?gender=female`. **Those two literals and nothing else.**
- The stored form is `m` / `f` and it is *not* accepted as input — `?gender=f` is a **400**, not a match.
- "No filter" is the parameter being **absent**. Do not send `gender=`.
- An unknown value returns a **400** with `{ "message": "gender must be one of: male, female", "invalid_fields": { "gender": "…" } }` — not an empty 200. Since a three-way toggle can only emit the two literals, this is unreachable from here; it is written down so nobody adds a free-text gender box later.
- Actor payloads — list rows and `GET /v1/actor/{id}` alike — now carry `gender: "male" | "female" | null`. `null` is a row Halo could not read a gender off; treat it as unknown, never as female.

### The thing to know before designing the control

The HALO-265 migration set **every existing actor to `female`** in both kaos and prod, and the only way to make one male is `PATCH /v1/actor/{id}`, which no client calls yet. So on the day this ships, `?gender=male` returns an empty list everywhere — correctly, but not cheaply: Halo post-filters in Ruby and walks up to **20 pages** before giving up, which is 20 DynamoDB queries for a guaranteed empty answer.

Two consequences, and they are requirements rather than trivia:

1. The control **defaults to "All"** and sends no parameter. A page that mounts with a gender preselected pays that 20-page walk on every navigation, for a list that is currently always empty.
2. A gender-filtered page can come back **shorter than `limit` with a cursor still set**. That is the existing post-filter contract, not a bug — the `IntersectionObserver` sentinel and `LoadMore` must keep paging on `hasNextPage` rather than reading a short page as the end. The empty state already guards on `!hasNextPage` for the prefix filter (`CategoryList.tsx`); that guard is what makes this correct here too, so do not weaken it.

---

## Current state

| Step | File / line |
| --- | --- |
| List URL builder (shared by all four categories) | `src/renderer/src/api/halo.ts:27-36` (`buildListUrl`) |
| Actor fetch | `src/renderer/src/api/halo.ts:40-43` (`fetchActors`) |
| Generic dispatch | `src/renderer/src/api/halo.ts` (`categoryFetchers`, `fetchCategoryItems`) |
| Paged query + key | `src/renderer/src/hooks/useCategories.ts` (`queryKey: ["category", apiPath, filter]`) |
| Page | `src/renderer/src/pages/CategoryList.tsx` |
| Search input | `src/renderer/src/components/shared/FilterBar.tsx` |
| Category config + row type | `src/renderer/src/types/index.ts` (`CategoryConfig`, `CATEGORIES`, `CategoryItem`) |

`CategoryList` is one page serving actors, series, movies and tags through `getCategoryConfig`. Gender exists on actors only, so the control must be gated by config — not by a `category === "actors"` check scattered through the page.

---

## Requirements

1. **Types** in `src/renderer/src/types/index.ts`.
   - `export type ActorGender = "male" | "female";`
   - `CategoryItem` gains `gender?: ActorGender | null` — optional, because the other three types never send it.
   - `CategoryConfig` gains `genderFilterable: boolean`, `true` for actors and `false` for the other three. This is the single switch the page reads; it sits beside `filterable`, which already works this way.

2. **The URL** in `src/renderer/src/api/halo.ts`.
   - `PaginationParams` gains `gender?: ActorGender | null`.
   - `buildListUrl` sets `gender` only when the value is one of the two literals; nullish or empty sets nothing.
   - `buildListUrl` is shared by all four categories, so the guarantee that it is never sent to `/v1/series` comes from the **caller** — the page only produces a value when `config.genderFilterable`. Say so in a comment at the `params.set` line, because the helper itself cannot tell which path it is building.

3. **The query** in `src/renderer/src/hooks/useCategories.ts`.
   - `useCategoryList(apiPath, enabled = true, filter = "", gender: ActorGender | null = null)`.
   - Put the gender in the `queryKey` — `["category", apiPath, filter, gender]`. A gender change is a *different* paginated stream with its own cursor, exactly as a filter change is; appending page 2 of "female" onto the accumulated pages of "all" is the bug this prevents.
   - Normalise to `null` before it reaches the key so `undefined` and `null` are one cache entry, not two.

4. **The control** in `CategoryList.tsx`, rendered only when `config.genderFilterable`.
   - Three states: **All / Male / Female**. "All" is the initial state and sends no parameter.
   - It applies **immediately** on click — it is not text, so it does not go through `useListFilter`'s debounce.
   - A react-bootstrap `ToggleButtonGroup` (radio) next to the `FilterBar`, styled with the existing `--color-surface` / `--color-border` / `--color-accent` tokens. Give the group an accessible name; the buttons are a radio set, not three independent toggles.
   - It sits in the same row as the search input on wide windows and wraps beneath it on narrow ones. Do not push the grid down by a whole row at every width.

5. **Empty state names the filter that emptied the list.** The current message speaks only of the prefix (`No actors starting with "…"`). With a gender and no prefix it must read as `No male actors`; with both, name both. Never render `starting with ""`.

6. **Do not** filter client-side as a fallback, and do not hold an unfiltered list alongside the filtered one. Whatever the query returns is the list — the same rule TD-049 established.

---

## ACs

- [ ] The actors page mounts with the control on **All** and issues `v1/actor?limit=50` — no `gender` parameter.
- [ ] Clicking **Female** issues `v1/actor?limit=50&gender=female` once, immediately.
- [ ] Clicking back to **All** issues the unfiltered request again.
- [ ] With a prefix typed and a gender selected, one request carries both: `v1/actor?limit=50&filter=anna&gender=female`.
- [ ] Changing gender mid-scroll starts a fresh stream — no rows from the previous selection remain once the new page lands, and infinite scroll continues under the new selection.
- [ ] The search input and the gender control both stay mounted while a new selection is in flight; the page is not replaced by a full-screen spinner.
- [ ] The sentinel keeps paging while `hasNextPage` is set, including through a page that came back shorter than `limit` or empty.
- [ ] `?gender=male` today returns an empty list; the page shows `No male actors`, not an error and not the full list.
- [ ] Series, movies and tags render no gender control and issue byte-identical requests to today.
- [ ] No request this client can produce contains `gender=m`, `gender=f` or `gender=` (empty).

---

## Test plan

**Unit (vitest)** — a new `src/renderer/src/pages/__tests__/CategoryList.test.tsx`, or extend the URL-building coverage nearest `buildListUrl`:
- `buildListUrl` with `gender: "female"` produces `…&gender=female`; with `null` / `undefined` produces no `gender` key at all; it composes with `filter` and `start_key`.
- `useCategoryList` puts the gender in the key and starts a new stream when it changes.
- The page renders the control for actors and not for tags, and clicking a segment fires exactly one fetch carrying the parameter.
- The empty state names the gender when only a gender is set.

**Manual (`npm run dev`, against kaos)**
- Actors → **Female** → the full catalogue comes back. Every actor is female today, so this is the positive case that proves the parameter reaches Halo and is understood — an empty result here means the value is wrong, not that there are no matches.
- Actors → **Male** → empty list, `No male actors`, no error. Expect visible latency: that is the 20-page walk, not a hang.
- Type "an", select Female, finish typing "anna" → one request with both parameters.
- Navigate away to Series and back → the control is back on All, the request is unfiltered, and Series never showed a control.
- Resize the window narrow → the control wraps rather than overflowing the filter row.

---

## Out of scope

- **Showing gender on a card or on `CategoryDetail`.** The field is on the payload now; rendering it is a separate ticket if it is wanted.
- **Editing an actor's gender.** `PATCH /v1/actor/{id}` exists in Halo and nothing here calls it. Correcting the data — currently 100% female in both environments — needs its own ticket and a decision about who may do it.
- **Gender on any other list.** Halo accepts the parameter on `/v1/actor` only. Records embed actors as `{id, name}` with no gender.
- **Persisting the selection across navigations or launches.** The page owns its filter state, as today.
- **Asking the chat for actors by gender.** That is a thunder-context / halo-mcp tool-schema change, not a renderer one.

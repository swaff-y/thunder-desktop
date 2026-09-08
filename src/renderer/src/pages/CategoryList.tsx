// Desktop-only port — web-thunder's mobile branch is intentionally dropped (TD-012).
import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Row, Col, ToggleButton, ToggleButtonGroup } from "react-bootstrap";
import { useCategoryList } from "../hooks/useCategories";
import { useListFilter } from "../hooks/useListFilter";
import { getCategoryConfig } from "../types";
import type { ActorGender } from "../types";
import { trackEntityClick } from "../api/halo";
import FilterBar from "../components/shared/FilterBar";
import LoadMore from "../components/shared/LoadMore";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

/** react-bootstrap types `ToggleButtonGroup`'s value as `any`, so narrow it here. */
function toGender(value: unknown): ActorGender | null {
  return value === "male" || value === "female" ? value : null;
}

export default function CategoryList() {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const config = getCategoryConfig(category);

  const { filterValue, setFilterValue, debouncedFilter } = useListFilter();
  const [gender, setGender] = useState<ActorGender | null>(null);

  // Each category owns its selection, and the route reuses this component, so
  // the control has to fall back to "All" when the category underneath changes.
  const [renderedCategory, setRenderedCategory] = useState(category);
  if (category !== renderedCategory) {
    setRenderedCategory(category);
    setGender(null);
  }

  // Gender only exists on actors, so nothing else can ever put it on the wire.
  const activeGender = config?.genderFilterable ? gender : null;

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useCategoryList(
    config?.apiPath ?? "",
    !!config,
    debouncedFilter,
    activeGender
  );

  const items = data?.pages.flatMap((page) => page.data) ?? [];

  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0,
      rootMargin: "0px 0px 50% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  if (!config) return <ErrorState message={`Unknown category: ${category}`} />;

  // A gender-filtered page can come back shorter than `limit` with a cursor
  // still set, so an empty run of pages is only the end once `hasNextPage` is
  // false.
  const emptyState = items.length === 0 && !hasNextPage && (
    <div
      role="status"
      style={{
        textAlign: "center",
        padding: "var(--space-xl)",
        color: "var(--color-text-muted)",
      }}
    >
      {emptyMessage(config.label.toLowerCase(), filterValue, activeGender)}
    </div>
  );

  return (
    <div>
      <h1 className="page-title">{config.label}</h1>
      {(config.filterable || config.genderFilterable) && (
        <div className="category-controls">
          {config.filterable && (
            <FilterBar
              value={filterValue}
              onChange={setFilterValue}
              placeholder={`Find ${config.label.toLowerCase()} — starts with...`}
            />
          )}
          {config.genderFilterable && (
            <ToggleButtonGroup
              className="gender-filter"
              type="radio"
              role="radiogroup"
              name="gender"
              aria-label={`Filter ${config.label.toLowerCase()} by gender`}
              value={gender ?? "all"}
              onChange={(next: unknown) => setGender(toGender(next))}
            >
              <ToggleButton id="gender-all" value="all" variant="outline-light">
                All
              </ToggleButton>
              <ToggleButton id="gender-male" value="male" variant="outline-light">
                Male
              </ToggleButton>
              <ToggleButton
                id="gender-female"
                value="female"
                variant="outline-light"
              >
                Female
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </div>
      )}
      {isLoading && <LoadingSpinner />}
      {isError && (
        <ErrorState
          message={error?.message || "Failed to load"}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && (
        <>
          <Row xs={2} md={3} lg={4} className="g-3">
            {items.map((item, i) => (
              <Col key={item.id ?? i}>
                <div
                  className="desktop-list-card"
                  onClick={() => {
                    trackEntityClick(config!.apiPath, item.id);
                    navigate(`/${category}/${item.id}`);
                  }}
                >
                  <div className="dlc-image">
                    {item.status === "processed" && item.url ? (
                      <img src={item.url} alt={item.name} />
                    ) : (
                      <div className="dlc-placeholder">Processing...</div>
                    )}
                    <div className="dlc-overlay">
                      <h3 className="dlc-title">{item.name}</h3>
                      {item.description && (
                        <p className="dlc-desc">{item.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
          {emptyState}
          <LoadMore
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        </>
      )}
      <div ref={sentinelRef} />

      <style>{`
        .page-title {
          font-size: var(--text-h1);
          font-weight: var(--weight-bold);
          color: var(--color-text);
          margin-bottom: var(--space-md);
        }
        .category-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: var(--space-md);
          margin-bottom: var(--space-md);
        }
        .category-controls .filter-bar {
          flex: 1 1 260px;
          margin-bottom: 0;
        }
        .gender-filter .btn {
          background: var(--color-surface);
          border-color: var(--color-border);
          color: var(--color-text-muted);
        }
        .gender-filter .btn-check:checked + .btn {
          background: var(--color-accent);
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .desktop-list-card {
          cursor: pointer;
          border-radius: var(--radius-lg);
          overflow: hidden;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          transition: transform 0.2s, box-shadow 0.2s;
          height: 100%;
        }
        .desktop-list-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .dlc-image {
          position: relative;
          height: 220px;
          overflow: hidden;
          background: var(--color-bg-alt);
        }
        .dlc-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }
        .desktop-list-card:hover .dlc-image img {
          transform: scale(1.05);
        }
        .dlc-image-loading {
          width: 100%;
          height: 100%;
          background: var(--color-bg-alt);
        }
        .dlc-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.8));
          padding: var(--space-xl) var(--space-md) var(--space-md);
        }
        .dlc-title {
          font-size: var(--text-body);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0;
        }
        .dlc-desc {
          font-size: var(--text-caption);
          color: var(--color-text-muted);
          margin: var(--space-xs) 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dlc-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-faint);
        }
      `}</style>
    </div>
  );
}

/** Names whichever filters emptied the list, and never `starting with ""`. */
function emptyMessage(
  label: string,
  filter: string,
  gender: ActorGender | null
): string {
  const noun = gender ? `${gender} ${label}` : label;
  if (filter) return `No ${noun} starting with "${filter}"`;
  return gender ? `No ${noun}` : "No items";
}

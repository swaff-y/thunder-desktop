// Desktop-only port — web-thunder's mobile branch is intentionally dropped (TD-012).
import { useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Row, Col } from "react-bootstrap";
import { useCategoryList } from "../hooks/useCategories";
import { useListFilter } from "../hooks/useListFilter";
import { useImage } from "../hooks/useImage";
import { buildImageCacheKey } from "../utils/imageCacheKey";
import { getCategoryConfig } from "../types";
import type { CategoryItem } from "../types";
import { trackEntityClick } from "../api/halo";
import FilterBar from "../components/shared/FilterBar";
import LoadMore from "../components/shared/LoadMore";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

// Always-on cache path. Mounted only when a stable cache key exists.
function CachedCategoryImage({
  cacheKey,
  url,
  alt,
}: {
  cacheKey: string;
  url: string;
  alt: string;
}) {
  const src = useImage(cacheKey, url);
  // Loading: render an empty same-dimensions div so the parent's
  // background-coloured slot stays in place (no layout shift).
  if (!src) return <div className="dlc-image-loading" aria-hidden="true" />;
  return <img src={src} alt={alt} />;
}

// Picks between cached and direct rendering. Falls through to a plain <img>
// when the BE response did not include imageKey, so the component still works
// against any endpoint that hasn't been HALO-124-updated yet.
function CategoryImage({ item }: { item: CategoryItem }) {
  const cacheKey = buildImageCacheKey(item);
  if (cacheKey) {
    return (
      <CachedCategoryImage cacheKey={cacheKey} url={item.url} alt={item.name} />
    );
  }
  return <img src={item.url} alt={item.name} />;
}

export default function CategoryList() {
  const { category } = useParams<{ category: string }>();
  const config = getCategoryConfig(category);

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useCategoryList(config?.apiPath ?? "", !!config);

  const items = data?.pages.flatMap((page) => page.data) ?? [];
  const { filterValue, setFilterValue, filteredItems } = useListFilter(items);

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
  if (isLoading) return <LoadingSpinner fullScreen />;
  if (isError)
    return (
      <ErrorState
        message={error?.message || "Failed to load"}
        onRetry={() => refetch()}
      />
    );

  const displayedItems = config.filterable ? filteredItems : items;

  const emptyState = displayedItems.length === 0 && (
    <div
      style={{
        textAlign: "center",
        padding: "var(--space-xl)",
        color: "var(--color-text-muted)",
      }}
    >
      {filterValue ? "No results found" : "No items"}
    </div>
  );

  return (
    <div>
      <h1 className="page-title">{config.label}</h1>
      {config.filterable && (
        <FilterBar
          value={filterValue}
          onChange={setFilterValue}
          placeholder={`Search ${config.label.toLowerCase()}...`}
        />
      )}
      <Row xs={2} md={3} lg={4} className="g-3">
        {displayedItems.map((item, i) => (
          <Col key={item.id ?? i}>
            <div
              className="desktop-list-card"
              onClick={() => {
                trackEntityClick(config!.apiPath, item.id);
                window.location.href = `/${category}/${item.id}`;
              }}
            >
              <div className="dlc-image">
                {item.status === "processed" && item.url ? (
                  <CategoryImage item={item} />
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
      <div ref={sentinelRef} />

      <style>{`
        .page-title {
          font-size: var(--text-h1);
          font-weight: var(--weight-bold);
          color: var(--color-text);
          margin-bottom: var(--space-md);
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

import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { IoInformationCircleOutline, IoCopy, IoCheckmark } from 'react-icons/io5'
import { useCategoryRecords } from '../hooks/useRecords'
import { getCategoryConfig } from '../types'
import VirtualRecordList from '../components/shared/VirtualRecordList'
import LoadMore from '../components/shared/LoadMore'
import LoadingSpinner from '../components/shared/LoadingSpinner'
import ErrorState from '../components/shared/ErrorState'
import BackButton from '../components/shared/BackButton'

export default function CategoryDetail() {
  const { category, id } = useParams<{ category: string; id: string }>()
  const navigate = useNavigate()
  const config = getCategoryConfig(category)
  const [isIdVisible, setIsIdVisible] = useState(false)
  const [justCopied, setJustCopied] = useState(false)
  const copyResetRef = useRef<number | null>(null)

  function handleBack() {
    if (category) navigate(`/${category}`)
  }

  function handleToggleId() {
    setIsIdVisible((v) => !v)
  }

  async function handleCopyId() {
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      setJustCopied(true)
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current)
      }
      copyResetRef.current = window.setTimeout(() => {
        setJustCopied(false)
        copyResetRef.current = null
      }, 1500)
    } catch {
      setJustCopied(false)
    }
  }

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current)
      }
    }
  }, [])

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch
  } = useCategoryRecords(config?.apiPath ?? '', id!, !!config)

  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0,
      rootMargin: '0px 0px 50% 0px'
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleIntersection])

  if (!config) return <ErrorState message={`Unknown category: ${category}`} />
  if (isLoading) return <LoadingSpinner fullScreen />
  if (isError)
    return (
      <ErrorState message={error?.message || 'Failed to load records'} onRetry={() => refetch()} />
    )

  const allRecords = data?.pages.flatMap((page) => page.data) ?? []

  return (
    <div style={{ minWidth: 0 }}>
      <BackButton onClick={handleBack} label={`Back to ${config.label}`} />
      <div className="detail-title-row">
        <h1 className="detail-page-title">{config.label} Detail</h1>
        <button
          type="button"
          className="id-info-btn"
          onClick={handleToggleId}
          aria-label={isIdVisible ? 'Hide entity ID' : 'Show entity ID'}
          aria-expanded={isIdVisible}
          aria-controls="entity-id-panel"
        >
          <IoInformationCircleOutline size={18} aria-hidden />
        </button>
      </div>
      <div id="entity-id-panel" className="entity-id-panel" data-visible={isIdVisible}>
        <code className="entity-id-value">{id ?? ''}</code>
        <button
          type="button"
          className="id-info-btn"
          onClick={handleCopyId}
          aria-label={justCopied ? 'Copied' : 'Copy entity ID'}
        >
          {justCopied ? <IoCheckmark size={16} aria-hidden /> : <IoCopy size={16} aria-hidden />}
        </button>
        <span className="entity-id-status" aria-live="polite">
          {justCopied ? 'Copied' : ''}
        </span>
      </div>
      {data && allRecords.length === 0 && !isFetchingNextPage ? (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--space-xl)',
            color: 'var(--color-text-muted)'
          }}
        >
          No records
        </div>
      ) : (
        <VirtualRecordList records={allRecords} />
      )}
      <LoadMore
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
      <div ref={sentinelRef} />

      <style>{`
        .detail-title-row {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-lg);
        }
        .detail-page-title {
          font-size: var(--text-h1);
          font-weight: var(--weight-bold);
          color: var(--color-text);
          margin: 0;
        }
        .id-info-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-xs);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .id-info-btn:hover,
        .id-info-btn:focus-visible {
          background: rgba(14, 165, 233, 0.08);
          color: var(--color-accent);
          border-color: var(--color-accent);
        }
        .id-info-btn:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
        .entity-id-panel {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
          visibility: hidden;
        }
        .entity-id-panel[data-visible="true"] {
          visibility: visible;
        }
        .entity-id-value {
          font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
          font-size: var(--text-body);
          color: var(--color-text);
          background: var(--color-surface, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-xs) var(--space-sm);
          user-select: text;
        }
        .entity-id-status {
          font-size: var(--text-body);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  )
}

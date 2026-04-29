import { useState } from "react";
import { Link } from "react-router-dom";
import { IoPencil, IoCheckmark, IoClose } from "react-icons/io5";
import type { ContentRecord, RecordRef, RecordRefInput, RecordPatchBody } from "../../types";
import CategoryAutocomplete from "./CategoryAutocomplete";

interface ContentTableProps {
  record: ContentRecord;
  onUpdate?: (body: RecordPatchBody) => Promise<void>;
}

export default function ContentTable({ record, onUpdate }: ContentTableProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftSeries, setDraftSeries] = useState<RecordRef | null>(null);
  const [draftMovie, setDraftMovie] = useState<RecordRef | null>(null);
  const [draftActors, setDraftActors] = useState<RecordRef[]>([]);
  const [draftTags, setDraftTags] = useState<RecordRef[]>([]);

  const startEditing = () => {
    setDraftSeries(record.series ?? null);
    setDraftMovie(record.movie ?? null);
    setDraftActors([...(record.actors ?? [])]);
    setDraftTags([...(record.tags ?? [])]);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const refsEqual = (a: RecordRef | undefined, b: RecordRef | null) =>
    (a?.id ?? null) === (b?.id ?? null) && (a?.name ?? null) === (b?.name ?? null);

  const refArraysEqual = (a: RecordRef[], b: RecordRef[]) =>
    a.length === b.length && a.every((item, i) => item.id === b[i].id && item.name === b[i].name);

  const cleanRef = (r: RecordRef): RecordRefInput =>
    r.id ? { id: r.id, name: r.name } : { name: r.name };

  const cleanRefs = (refs: RecordRef[]): RecordRefInput[] =>
    refs.map(cleanRef);

  const actorsChanged = !refArraysEqual(record.actors ?? [], draftActors);
  const actorsEmpty = actorsChanged && draftActors.length === 0;
  const tagsChanged = !refArraysEqual(record.tags ?? [], draftTags);
  const tagsEmpty = tagsChanged && draftTags.length === 0;
  const hasValidationError = actorsEmpty || tagsEmpty;

  const handleSave = async () => {
    if (!onUpdate || hasValidationError) return;
    setSaving(true);
    try {
      const body: RecordPatchBody = { name: record.name };
      if (!refsEqual(record.series, draftSeries)) body.series = draftSeries ? cleanRef(draftSeries) : null;
      if (!refsEqual(record.movie, draftMovie)) body.movie = draftMovie ? cleanRef(draftMovie) : null;
      if (actorsChanged) body.actors = cleanRefs(draftActors);
      if (tagsChanged) body.tags = cleanRefs(draftTags);
      await onUpdate(body);
      setEditing(false);
    } catch {
      // Stay in edit mode so the user can retry
    } finally {
      setSaving(false);
    }
  };

  const removeActor = (actor: RecordRef) =>
    setDraftActors((prev) =>
      prev.filter((a) => !(a.id === actor.id && a.name === actor.name))
    );

  const removeTag = (tag: RecordRef) =>
    setDraftTags((prev) =>
      prev.filter((t) => !(t.id === tag.id && t.name === tag.name))
    );

  const isDuplicate = (list: RecordRef[], item: RecordRef) =>
    list.some(
      (existing) =>
        (existing.id && existing.id === item.id) ||
        existing.name.toLowerCase() === item.name.toLowerCase()
    );

  if (editing) {
    return (
      <div className="content-table">
        <div className="content-table-header">
          <span className="edit-label">Editing</span>
          <div className="edit-actions">
            <button
              className="edit-action-btn save"
              onClick={handleSave}
              disabled={saving || hasValidationError}
              title="Save"
            >
              <IoCheckmark size={16} />
            </button>
            <button
              className="edit-action-btn cancel"
              onClick={cancelEditing}
              disabled={saving}
              title="Cancel"
            >
              <IoClose size={16} />
            </button>
          </div>
        </div>

        <div className="content-table-row">
          <div className="content-table-col">
            <div className="content-field">
              <span className="field-label">Series:</span>
              {draftSeries ? (
                <div className="edit-pill-row">
                  <span className="edit-pill">
                    {draftSeries.name}
                    <button
                      className="pill-remove"
                      onClick={() => setDraftSeries(null)}
                    >
                      <IoClose size={12} />
                    </button>
                  </span>
                </div>
              ) : (
                <CategoryAutocomplete
                  apiPath="series"
                  placeholder="Search series..."
                  onSelect={(item) => setDraftSeries(item)}
                  disabled={!!draftMovie}
                />
              )}
            </div>

            <div className="content-field">
              <span className="field-label">Movie:</span>
              {draftMovie ? (
                <div className="edit-pill-row">
                  <span className="edit-pill">
                    {draftMovie.name}
                    <button
                      className="pill-remove"
                      onClick={() => setDraftMovie(null)}
                    >
                      <IoClose size={12} />
                    </button>
                  </span>
                </div>
              ) : (
                <CategoryAutocomplete
                  apiPath="movie"
                  placeholder="Search movies..."
                  onSelect={(item) => setDraftMovie(item)}
                  disabled={!!draftSeries}
                />
              )}
            </div>

            <div className="content-field">
              <span className="field-label">Actors:</span>
              {actorsEmpty && (
                <span className="field-error">At least one actor is required</span>
              )}
              <div className="edit-pill-row">
                {draftActors.map((actor) => (
                  <span key={actor.id || actor.name} className="edit-pill">
                    {actor.name}
                    <button
                      className="pill-remove"
                      onClick={() => removeActor(actor)}
                    >
                      <IoClose size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <CategoryAutocomplete
                apiPath="actor"
                placeholder="Add actor..."
                onSelect={(item) =>
                  setDraftActors((prev) =>
                    isDuplicate(prev, item) ? prev : [...prev, item]
                  )
                }
              />
            </div>
          </div>

          <div className="content-table-col">
            <div className="content-field">
              <span className="field-label">Tags:</span>
              {tagsEmpty && (
                <span className="field-error">At least one tag is required</span>
              )}
              <div className="edit-pill-row">
                {draftTags.map((tag) => (
                  <span key={tag.id || tag.name} className="edit-pill">
                    {tag.name}
                    <button
                      className="pill-remove"
                      onClick={() => removeTag(tag)}
                    >
                      <IoClose size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <CategoryAutocomplete
                apiPath="tag"
                placeholder="Add tag..."
                onSelect={(item) =>
                  setDraftTags((prev) =>
                    isDuplicate(prev, item) ? prev : [...prev, item]
                  )
                }
              />
            </div>
          </div>
        </div>

        <style>{`
          ${sharedStyles}
          ${editStyles}
        `}</style>
      </div>
    );
  }

  // View mode
  return (
    <div className="content-table">
      {onUpdate && (
        <div className="content-table-header">
          <span />
          <button
            className="edit-action-btn"
            onClick={startEditing}
            title="Edit"
          >
            <IoPencil size={14} />
          </button>
        </div>
      )}

      <div className="content-table-row">
        <div className="content-table-col">
          {record.series && (
            <div className="content-field">
              <span className="field-label">Series:</span>
              <Link to={`/series/${record.series.id}`}>
                {record.series.name}
              </Link>
            </div>
          )}
          {record.movie && (
            <div className="content-field">
              <span className="field-label">Movie:</span>
              <Link to={`/movies/${record.movie.id}`}>
                {record.movie.name}
              </Link>
            </div>
          )}
          {record.actors?.length > 0 && (
            <div className="content-field">
              <span className="field-label">Actors:</span>
              <div className="field-links">
                {record.actors.map((actor) => (
                  <Link key={actor.id} to={`/actors/${actor.id}`}>
                    {actor.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="content-table-col">
          {record.tags?.length > 0 && (
            <div className="content-field">
              <span className="field-label">Tags:</span>
              <div className="field-links">
                {record.tags.map((tag) => (
                  <Link key={tag.id} to={`/tags/${tag.id}`}>
                    {tag.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`${sharedStyles}`}</style>
    </div>
  );
}

const sharedStyles = `
  .content-table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
  }
  .content-table-row {
    display: flex;
    gap: var(--space-md);
  }
  .content-table-col {
    flex: 1;
  }
  .content-field {
    margin-bottom: var(--space-sm);
  }
  .field-label {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    display: block;
    margin-bottom: 2px;
  }
  .field-links {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .field-links a,
  .content-field a {
    font-size: var(--text-body-sm);
    color: var(--color-accent);
  }
  .field-links a:hover,
  .content-field a:hover {
    color: var(--color-accent-light);
  }
  .edit-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }
  .edit-action-btn:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .edit-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const editStyles = `
  .edit-label {
    font-size: var(--text-body-sm);
    color: var(--color-text-muted);
    font-style: italic;
  }
  .edit-actions {
    display: flex;
    gap: var(--space-xs);
  }
  .edit-action-btn.save:hover:not(:disabled) {
    border-color: var(--color-success);
    color: var(--color-success);
  }
  .edit-action-btn.cancel:hover:not(:disabled) {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
  .field-error {
    font-size: var(--text-caption);
    color: var(--color-danger);
    display: block;
    margin-bottom: var(--space-xs);
  }
  .edit-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-bottom: var(--space-xs);
  }
  .edit-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--space-sm);
    background: rgba(14, 165, 233, 0.15);
    color: var(--color-accent-light);
    border-radius: var(--radius-full);
    font-size: var(--text-caption);
  }
  .pill-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  .pill-remove:hover {
    opacity: 1;
  }
`;

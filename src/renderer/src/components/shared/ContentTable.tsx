import { useState } from "react";
import { Link } from "react-router-dom";
import { IoPencil, IoCheckmark, IoClose } from "react-icons/io5";
import type { ContentRecord, RecordRef, RecordPatchBody } from "../../types";
import { catalogueRoute } from "../chat/entity-routes";
import CategoryAutocomplete from "./CategoryAutocomplete";
import { buildRecordPatch, refArraysEqual, SOURCE_KEYS, type SourceKey } from "./record-patch";

interface SourceField {
  key: SourceKey;
  label: string;
  placeholder: string;
}

/** One row per source halo accepts; `key` doubles as its singular api path. */
const SOURCE_FIELDS: SourceField[] = [
  { key: "series", label: "Series", placeholder: "Search series..." },
  { key: "movie", label: "Movie", placeholder: "Search movies..." },
  { key: "webscene", label: "Webscene", placeholder: "Search webscenes..." },
];

const NO_SOURCES: Record<SourceKey, RecordRef | null> = {
  series: null,
  movie: null,
  webscene: null,
};

interface ContentTableProps {
  record: ContentRecord;
  onUpdate?: (body: RecordPatchBody) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
}

export default function ContentTable({ record, onUpdate, onEditingChange }: ContentTableProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [draftSources, setDraftSources] = useState(NO_SOURCES);
  const [draftActors, setDraftActors] = useState<RecordRef[]>([]);
  const [draftTags, setDraftTags] = useState<RecordRef[]>([]);

  const startEditing = () => {
    setDraftSources({
      series: record.series ?? null,
      movie: record.movie ?? null,
      webscene: record.webscene ?? null,
    });
    setDraftActors([...(record.actors ?? [])]);
    setDraftTags([...(record.tags ?? [])]);
    setSaveError(null);
    setEditing(true);
    onEditingChange?.(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    onEditingChange?.(false);
  };

  const actorsEmpty =
    !refArraysEqual(record.actors ?? [], draftActors) && draftActors.length === 0;
  const tagsEmpty = !refArraysEqual(record.tags ?? [], draftTags) && draftTags.length === 0;
  const hasValidationError = actorsEmpty || tagsEmpty;

  // Halo takes exactly one of the three, so whichever is already picked locks
  // the other two out.
  const hasSource = SOURCE_KEYS.some((key) => draftSources[key]);

  const handleSourceChange = (key: SourceKey, value: RecordRef | null) =>
    setDraftSources((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!onUpdate || hasValidationError) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdate(
        buildRecordPatch(record, { ...draftSources, actors: draftActors, tags: draftTags })
      );
      setEditing(false);
      onEditingChange?.(false);
    } catch (error: unknown) {
      // Stay in edit mode so the user can retry, and say why it refused.
      setSaveError(error instanceof Error ? error.message : "Could not save the record");
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

        {saveError && (
          <p className="save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="content-table-row">
          <div className="content-table-col">
            {SOURCE_FIELDS.map((field) => (
              <SourceRow
                key={field.key}
                field={field}
                value={draftSources[field.key]}
                lockedOut={hasSource && !draftSources[field.key]}
                onChange={handleSourceChange}
              />
            ))}

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
          {SOURCE_FIELDS.map((field) => (
            <SourceLink key={field.key} field={field} value={record[field.key]} />
          ))}
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

interface SourceRowProps {
  field: SourceField;
  value: RecordRef | null;
  lockedOut: boolean;
  onChange: (key: SourceKey, value: RecordRef | null) => void;
}

function SourceRow({ field, value, lockedOut, onChange }: SourceRowProps) {
  function handleRemove() {
    onChange(field.key, null);
  }

  function handleSelect(selected: RecordRef) {
    onChange(field.key, selected);
  }

  return (
    <div className="content-field">
      <span className="field-label">{field.label}:</span>
      {value ? (
        <div className="edit-pill-row">
          <span className="edit-pill">
            {value.name}
            <button
              className="pill-remove"
              aria-label={`Remove ${field.key}`}
              onClick={handleRemove}
            >
              <IoClose size={12} />
            </button>
          </span>
        </div>
      ) : (
        <CategoryAutocomplete
          apiPath={field.key}
          placeholder={field.placeholder}
          onSelect={handleSelect}
          disabled={lockedOut}
        />
      )}
    </div>
  );
}

interface SourceLinkProps {
  field: SourceField;
  value: RecordRef | undefined;
}

function SourceLink({ field, value }: SourceLinkProps) {
  const route = value && catalogueRoute(field.key, value.id);
  if (!value || !route) return null;

  return (
    <div className="content-field">
      <span className="field-label">{field.label}:</span>
      <Link to={route}>{value.name}</Link>
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
  .save-error {
    font-size: var(--text-body-sm);
    color: var(--color-error-text);
    margin: 0 0 var(--space-sm);
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

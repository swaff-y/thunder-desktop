import { useEffect, useState } from "react";
import { Modal, Form, Button, Alert } from "react-bootstrap";
import { queryClient } from "../../api/cache";
import { CHAT_ENABLED_KEY } from "../../hooks/useSettings";
import type { ThunderSettings } from "../../../../shared/settings";

interface SettingsModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * TD-056: the modal's open state lives in TopBar, which the chat panel has
 * no path to. Errors whose fix is a settings change dispatch this instead.
 */
export const OPEN_SETTINGS_EVENT = "thunder:open-settings";

interface FormState {
  apiUrl: string;
  downloadFolder: string;
  userAgent: string;
  contextUrl: string;
  chatEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  apiUrl: "",
  downloadFolder: "",
  userAgent: "",
  contextUrl: "",
  chatEnabled: false,
};

/**
 * Persists one key only if the user actually changed it. Main rejects
 * an empty string, so a cleared text field means "leave the stored
 * value alone" rather than "store nothing" — booleans are exempt
 * because `false` is a real value, not an absent one.
 */
async function saveIfChanged<K extends keyof ThunderSettings>(
  key: K,
  value: ThunderSettings[K],
  previous: ThunderSettings[K] | undefined,
): Promise<void> {
  if (value === (previous ?? "")) return;
  if (typeof value === "string" && value.length === 0) return;
  await window.thunder.settings.set(key, value);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default function SettingsModal({ show, onHide }: SettingsModalProps): React.JSX.Element {
  const [initial, setInitial] = useState<FormState>(EMPTY_FORM);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [urlError, setUrlError] = useState<string>("");
  const [folderError, setFolderError] = useState<string>("");
  const [contextUrlError, setContextUrlError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    if (!show) return;
    setUrlError("");
    setFolderError("");
    setContextUrlError("");
    setNotice("");
    let cancelled = false;
    (async () => {
      // A rejection means IPC is unavailable (vitest, dev harness) —
      // leave the fields blank rather than guessing at them.
      const settings = await window.thunder?.settings.getAll().catch(() => undefined);
      if (cancelled || !settings) return;
      const next: FormState = {
        apiUrl: settings.apiUrl ?? "",
        downloadFolder: settings.downloadFolder ?? "",
        userAgent: settings.userAgent ?? "",
        contextUrl: settings.contextUrl ?? "",
        chatEnabled: settings.chatEnabled ?? false,
      };
      setInitial(next);
      setForm(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  const handleSave = async () => {
    if (!isValidUrl(form.apiUrl)) {
      setUrlError("Enter a valid URL (e.g. https://example.com/).");
      return;
    }
    // TD-033 rule: trim before validating, so a pasted value with a
    // trailing newline validates on what we're actually going to store.
    const contextUrl = form.contextUrl.trim();
    if (contextUrl.length > 0 && !isValidUrl(contextUrl)) {
      setContextUrlError("Enter a valid URL (e.g. https://thunder-context.example/v1).");
      return;
    }
    setUrlError("");
    setContextUrlError("");
    setSaving(true);
    const apiUrlChanged = form.apiUrl !== initial.apiUrl;
    try {
      await saveIfChanged("apiUrl", form.apiUrl, initial.apiUrl);
      await saveIfChanged("downloadFolder", form.downloadFolder, initial.downloadFolder);
      await saveIfChanged("userAgent", form.userAgent, initial.userAgent);
      await saveIfChanged("contextUrl", contextUrl, initial.contextUrl);
      await saveIfChanged("chatEnabled", form.chatEnabled, initial.chatEnabled);
      // TD-056: Home reads this at mount, and the modal closes over a Home
      // that never unmounted — without this the toggle looks like a no-op.
      if (form.chatEnabled !== initial.chatEnabled) {
        await queryClient.invalidateQueries({ queryKey: CHAT_ENABLED_KEY });
      }

      const saved: FormState = { ...form, contextUrl };
      setForm(saved);
      if (apiUrlChanged) {
        setNotice("API base URL updated. Reload to take effect.");
        setInitial(saved);
      } else {
        onHide();
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleChatEnabledChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;
    setForm((f) => ({ ...f, chatEnabled: checked }));
  };

  const handleContextUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setContextUrlError("");
    setForm((f) => ({ ...f, contextUrl: value }));
  };

  const handleChooseFolder = async () => {
    setFolderError("");
    try {
      const result = await window.thunder.dialog.openDirectory();
      if (result.canceled) return;
      if ("error" in result) {
        setFolderError("That folder isn't writable. Pick another.");
        return;
      }
      setForm((f) => ({ ...f, downloadFolder: result.path }));
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Failed to open folder picker.");
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <Form.Group className="mb-3">
            <Form.Label>API URL</Form.Label>
            <Form.Control
              type="text"
              value={form.apiUrl}
              onChange={(e) => setForm((f) => ({ ...f, apiUrl: e.target.value }))}
              isInvalid={Boolean(urlError)}
              placeholder="https://api.example.com/"
            />
            {urlError && (
              <Form.Control.Feedback type="invalid">{urlError}</Form.Control.Feedback>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Download Folder</Form.Label>
            <div className="settings-folder-row">
              <Form.Control
                type="text"
                value={form.downloadFolder}
                readOnly
                isInvalid={Boolean(folderError)}
              />
              <Button variant="secondary" onClick={handleChooseFolder} type="button">
                Choose…
              </Button>
              {folderError && (
                <Form.Control.Feedback type="invalid">{folderError}</Form.Control.Feedback>
              )}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>User-Agent override</Form.Label>
            <Form.Control
              type="text"
              value={form.userAgent}
              onChange={(e) => setForm((f) => ({ ...f, userAgent: e.target.value }))}
              placeholder="Leave blank to use webview default"
            />
          </Form.Group>

          <fieldset className="settings-section">
            <legend className="settings-legend">AI Chat</legend>

            <Form.Check
              type="switch"
              id="settings-chat-enabled"
              className="mb-3"
              label="Enable AI chat"
              checked={form.chatEnabled}
              onChange={handleChatEnabledChange}
            />

            <Form.Group className="mb-3" controlId="settings-context-url">
              <Form.Label>Context server URL</Form.Label>
              <Form.Control
                type="url"
                value={form.contextUrl}
                onChange={handleContextUrlChange}
                isInvalid={Boolean(contextUrlError)}
                placeholder="https://thunder-context.example/v1"
              />
              {contextUrlError && (
                <Form.Control.Feedback type="invalid">{contextUrlError}</Form.Control.Feedback>
              )}
            </Form.Group>
          </fieldset>

          {notice && <Alert className="settings-notice">{notice}</Alert>}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={saving}>
          Cancel
        </Button>
        <Button className="btn-cta" onClick={() => void handleSave()} disabled={saving}>
          Save
        </Button>
      </Modal.Footer>

      <style>{`
        .settings-folder-row {
          display: flex;
          gap: var(--space-sm);
        }
        .settings-folder-row .form-control {
          flex: 1;
        }
        .settings-folder-row .invalid-feedback {
          /* Force the feedback element onto its own row beneath the
             input + button rather than wedging between them in the
             flex layout. */
          flex-basis: 100%;
        }
        .settings-section {
          border: 1px solid var(--color-border, rgba(148, 163, 184, 0.3));
          border-radius: var(--radius-sm);
          padding: var(--space-sm);
          margin-bottom: var(--space-md, 1rem);
        }
        .settings-legend {
          float: none;
          width: auto;
          padding: 0 var(--space-xs, 0.25rem);
          font-size: var(--text-body-sm);
          font-weight: 600;
        }
        .settings-notice {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid var(--color-accent);
          color: var(--color-text);
          font-size: var(--text-body-sm);
          border-radius: var(--radius-sm);
        }
      `}</style>
    </Modal>
  );
}

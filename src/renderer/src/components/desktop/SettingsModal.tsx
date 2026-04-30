import { useEffect, useState } from "react";
import { Modal, Form, Button, Alert } from "react-bootstrap";
import type { ThunderSettings } from "../../../../shared/settings";

interface SettingsModalProps {
  show: boolean;
  onHide: () => void;
}

interface FormState {
  apiUrl: string;
  downloadFolder: string;
  userAgent: string;
}

const EMPTY_FORM: FormState = {
  apiUrl: "",
  downloadFolder: "",
  userAgent: "",
};

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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    if (!show) return;
    setUrlError("");
    setNotice("");
    let cancelled = false;
    (async () => {
      try {
        const all = (await window.thunder?.settings.getAll()) as ThunderSettings | undefined;
        if (cancelled || !all) return;
        const next: FormState = {
          apiUrl: all.apiUrl ?? "",
          downloadFolder: all.downloadFolder ?? "",
          userAgent: all.userAgent ?? "",
        };
        setInitial(next);
        setForm(next);
      } catch {
        // IPC unavailable — leave fields blank.
      }
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
    setUrlError("");
    setSaving(true);
    try {
      const apiUrlChanged = form.apiUrl !== initial.apiUrl;
      if (apiUrlChanged) {
        await window.thunder.settings.set("apiUrl", form.apiUrl);
      }
      if (form.downloadFolder !== initial.downloadFolder && form.downloadFolder.length > 0) {
        await window.thunder.settings.set("downloadFolder", form.downloadFolder);
      }
      if (form.userAgent !== (initial.userAgent ?? "") && form.userAgent.length > 0) {
        await window.thunder.settings.set("userAgent", form.userAgent);
      }
      if (apiUrlChanged) {
        setNotice("API base URL updated. Reload to take effect.");
        setInitial(form);
      } else {
        onHide();
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleChooseFolder = async () => {
    // TD-026 dialog IPC isn't ready yet; fall back to a prompt so the
    // field stays editable end-to-end without blocking this ticket.
    const picker = (window.thunder as unknown as { dialog?: { openDirectory?: () => Promise<string | null> } })
      .dialog?.openDirectory;
    if (typeof picker === "function") {
      try {
        const picked = await picker();
        if (picked) setForm((f) => ({ ...f, downloadFolder: picked }));
      } catch {
        // ignore
      }
      return;
    }
    const entered = window.prompt("Download folder path", form.downloadFolder);
    if (entered && entered.length > 0) {
      setForm((f) => ({ ...f, downloadFolder: entered }));
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
              <Form.Control type="text" value={form.downloadFolder} readOnly />
              <Button variant="secondary" onClick={handleChooseFolder} type="button">
                Choose…
              </Button>
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

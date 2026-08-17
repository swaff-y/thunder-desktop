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
  mcpUrl: string;
  bedrockRegion: string;
  bedrockModelId: string;
  chatEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  apiUrl: "",
  downloadFolder: "",
  userAgent: "",
  mcpUrl: "",
  bedrockRegion: "",
  bedrockModelId: "",
  chatEnabled: false,
};

/**
 * TD-052: never seeded from storage — there is no IPC path that returns
 * stored AWS keys, and there shouldn't be. Blank fields mean "leave
 * whatever is stored alone"; typing into them replaces the record.
 */
interface AwsFormState {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

const EMPTY_AWS_FORM: AwsFormState = {
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
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
  const [aws, setAws] = useState<AwsFormState>(EMPTY_AWS_FORM);
  const [credsStored, setCredsStored] = useState(false);
  const [urlError, setUrlError] = useState<string>("");
  const [folderError, setFolderError] = useState<string>("");
  const [mcpUrlError, setMcpUrlError] = useState<string>("");
  const [awsError, setAwsError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    if (!show) return;
    setUrlError("");
    setFolderError("");
    setMcpUrlError("");
    setAwsError("");
    setNotice("");
    setAws(EMPTY_AWS_FORM);
    let cancelled = false;
    (async () => {
      // Independent handlers — issued together so opening the modal
      // costs one round trip rather than two.
      const [settings, stored] = await Promise.allSettled([
        window.thunder?.settings.getAll(),
        window.thunder?.aws.has(),
      ]);
      if (cancelled) return;
      // A rejection means IPC is unavailable (vitest, dev harness) —
      // leave the fields blank and report "not configured" rather than
      // guessing at either.
      if (settings.status === "fulfilled" && settings.value) {
        const all = settings.value as ThunderSettings;
        const next: FormState = {
          apiUrl: all.apiUrl ?? "",
          downloadFolder: all.downloadFolder ?? "",
          userAgent: all.userAgent ?? "",
          mcpUrl: all.mcpUrl ?? "",
          bedrockRegion: all.bedrockRegion ?? "",
          bedrockModelId: all.bedrockModelId ?? "",
          chatEnabled: all.chatEnabled ?? false,
        };
        setInitial(next);
        setForm(next);
      }
      setCredsStored(stored.status === "fulfilled" && (stored.value ?? false));
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
    const mcpUrl = form.mcpUrl.trim();
    const bedrockRegion = form.bedrockRegion.trim();
    const bedrockModelId = form.bedrockModelId.trim();
    if (mcpUrl.length > 0 && !isValidUrl(mcpUrl)) {
      setMcpUrlError("Enter a valid URL (e.g. https://halo-mcp.example/mcp).");
      return;
    }
    const accessKeyId = aws.accessKeyId.trim();
    const secretAccessKey = aws.secretAccessKey.trim();
    const sessionToken = aws.sessionToken.trim();
    const hasCredsInput = accessKeyId.length > 0 || secretAccessKey.length > 0;
    if (hasCredsInput && (accessKeyId.length === 0 || secretAccessKey.length === 0)) {
      setAwsError("Enter both an access key ID and a secret access key.");
      return;
    }
    setUrlError("");
    setMcpUrlError("");
    setAwsError("");
    setSaving(true);
    const apiUrlChanged = form.apiUrl !== initial.apiUrl;
    try {
      await saveIfChanged("apiUrl", form.apiUrl, initial.apiUrl);
      await saveIfChanged("downloadFolder", form.downloadFolder, initial.downloadFolder);
      await saveIfChanged("userAgent", form.userAgent, initial.userAgent);
      await saveIfChanged("mcpUrl", mcpUrl, initial.mcpUrl);
      await saveIfChanged("bedrockRegion", bedrockRegion, initial.bedrockRegion);
      await saveIfChanged("bedrockModelId", bedrockModelId, initial.bedrockModelId);
      await saveIfChanged("chatEnabled", form.chatEnabled, initial.chatEnabled);

      if (hasCredsInput) {
        // Caught separately from the settings writes so a keychain
        // failure surfaces under the credentials fields rather than as
        // an inscrutable error on the API URL input.
        try {
          await window.thunder.aws.set({
            accessKeyId,
            secretAccessKey,
            ...(sessionToken.length > 0 && { sessionToken }),
          });
        } catch (err) {
          setAwsError(err instanceof Error ? err.message : "Failed to store AWS credentials.");
          return;
        }
        setAws(EMPTY_AWS_FORM);
        setCredsStored(true);
      }

      const saved: FormState = { ...form, mcpUrl, bedrockRegion, bedrockModelId };
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

  const handleClearCredentials = async () => {
    setAwsError("");
    try {
      await window.thunder.aws.clear();
      setAws(EMPTY_AWS_FORM);
      setCredsStored(false);
    } catch (err) {
      setAwsError(err instanceof Error ? err.message : "Failed to clear stored credentials.");
    }
  };

  const handleChatEnabledChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;
    setForm((f) => ({ ...f, chatEnabled: checked }));
  };

  // One curried setter per state object rather than seven near-identical
  // handlers — the field's own validation error clears on edit, so it
  // can't be forgotten for a field added later.
  const changeSetting =
    (key: keyof Omit<FormState, "chatEnabled">) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setMcpUrlError("");
      setForm((f) => ({ ...f, [key]: value }));
    };

  const changeAws = (key: keyof AwsFormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setAwsError("");
    setAws((a) => ({ ...a, [key]: value }));
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

            <Form.Group className="mb-3" controlId="settings-mcp-url">
              <Form.Label>MCP URL</Form.Label>
              <Form.Control
                type="url"
                value={form.mcpUrl}
                onChange={changeSetting("mcpUrl")}
                isInvalid={Boolean(mcpUrlError)}
                placeholder="https://halo-mcp.example/mcp"
              />
              {mcpUrlError && (
                <Form.Control.Feedback type="invalid">{mcpUrlError}</Form.Control.Feedback>
              )}
            </Form.Group>

            <Form.Group className="mb-3" controlId="settings-bedrock-region">
              <Form.Label>Bedrock region</Form.Label>
              <Form.Control
                type="text"
                value={form.bedrockRegion}
                onChange={changeSetting("bedrockRegion")}
                placeholder="ap-south-1"
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="settings-bedrock-model">
              <Form.Label>Bedrock model ID</Form.Label>
              <Form.Control
                type="text"
                value={form.bedrockModelId}
                onChange={changeSetting("bedrockModelId")}
                placeholder="global.anthropic.claude-sonnet-5"
              />
            </Form.Group>

            <fieldset className="settings-section">
              <legend className="settings-legend">AWS credentials</legend>

              <p className="settings-creds-status">
                {credsStored ? "Credentials stored" : "Using default AWS credential chain"}
              </p>

              <Form.Group className="mb-3" controlId="settings-aws-access-key-id">
                <Form.Label>Access key ID</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="off"
                  value={aws.accessKeyId}
                  onChange={changeAws("accessKeyId")}
                  isInvalid={Boolean(awsError)}
                  placeholder={credsStored ? "Leave blank to keep stored key" : ""}
                />
              </Form.Group>

              <Form.Group className="mb-3" controlId="settings-aws-secret-access-key">
                <Form.Label>Secret access key</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="off"
                  value={aws.secretAccessKey}
                  onChange={changeAws("secretAccessKey")}
                  isInvalid={Boolean(awsError)}
                  placeholder={credsStored ? "Leave blank to keep stored key" : ""}
                />
                {awsError && (
                  <Form.Control.Feedback type="invalid">{awsError}</Form.Control.Feedback>
                )}
              </Form.Group>

              <Form.Group className="mb-3" controlId="settings-aws-session-token">
                <Form.Label>Session token (optional)</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="off"
                  value={aws.sessionToken}
                  onChange={changeAws("sessionToken")}
                />
              </Form.Group>

              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleClearCredentials()}
                disabled={!credsStored}
              >
                Clear stored credentials
              </Button>
            </fieldset>
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
        .settings-creds-status {
          font-size: var(--text-body-sm);
          color: var(--color-text-muted, inherit);
          margin-bottom: var(--space-sm);
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

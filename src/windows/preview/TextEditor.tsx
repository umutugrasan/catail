import { useCallback, useEffect, useRef, useState } from "react";
import { CatEar, CatFace } from "../../lib/cats";
import { t } from "../../lib/i18n";
import { queueEditText, type QueueItemView } from "../../lib/ipc";
import { CloseIcon, SaveIcon } from "../overlay/icons";
import { CloseGuard } from "./CloseGuard";

export function TextEditor(props: { item: QueueItemView; closing: boolean; onClose: () => void }) {
  const { item, closing, onClose } = props;
  const original = item.fullText ?? "";
  const [value, setValue] = useState(original);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const dirty = value !== original;
  const canSave = dirty && value.trim().length > 0 && !busy;

  // The caret starts at the end, ready to carry on writing.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      await queueEditText(item.id, value);
      onClose();
    } catch {
      setFailed(true);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }, [item.id, value, onClose]);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (asking) setAsking(false);
        else requestClose();
      } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSave) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, canSave, requestClose, save]);

  return (
    <div
      className={`preview${closing ? " preview--closing" : ""}`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div className="preview__text">
        <CatEar side="left" />
        <CatEar side="right" />
        <header className="preview__text-header">
          <CatFace size={20} />
          {t("preview.edit_text")}
        </header>
        <textarea
          ref={boxRef}
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>

      <div className="preview__actions">
        {failed && <span className="preview__error">{t("preview.save_failed")}</span>}
        <button
          type="button"
          className="preview__button preview__button--primary"
          disabled={!canSave}
          onClick={() => void save()}
        >
          <SaveIcon />
          {t("preview.save")}
        </button>
      </div>

      <button type="button" className="preview__close" title={t("preview.close")} onClick={requestClose}>
        <CloseIcon />
      </button>

      {asking && (
        <CloseGuard
          busy={!canSave}
          onSave={() => void save()}
          onDiscard={onClose}
          onKeepEditing={() => setAsking(false)}
        />
      )}
    </div>
  );
}

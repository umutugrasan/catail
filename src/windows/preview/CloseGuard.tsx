// Shared by both editors: unsaved changes aren't thrown away without asking.
import { t } from "../../lib/i18n";

export function CloseGuard(props: {
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <div className="preview__confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <p>{t("preview.confirm")}</p>
      <div className="preview__confirm-buttons">
        <button type="button" className="preview__button" onClick={props.onKeepEditing}>
          {t("preview.keep_editing")}
        </button>
        <button type="button" className="preview__button" onClick={props.onDiscard}>
          {t("preview.discard")}
        </button>
        <button
          type="button"
          className="preview__button preview__button--primary"
          disabled={props.busy}
          autoFocus
          onClick={props.onSave}
        >
          {t("preview.save")}
        </button>
      </div>
    </div>
  );
}

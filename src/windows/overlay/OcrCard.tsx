// Result of "Metni al": the recognized text (editable), with copy, add-to-queue and
// in-app translation.
import { useEffect, useState } from "react";
import { languageName, t } from "../../lib/i18n";
import { clipboardWriteText, queueAddText, settingsGet, translateText, type Translation } from "../../lib/ipc";
import { CloseIcon } from "./icons";
import { LanguagePicker } from "./LanguagePicker";

export type OcrState =
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

type TranslateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: Translation }
  | { status: "error"; message: string };

interface Props {
  state: OcrState;
  onClose: () => void;
  onQueued: () => void;
}

export function OcrCard({ state, onClose, onQueued }: Props) {
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState<TranslateState>({ status: "idle" });
  const [flash, setFlash] = useState<string | null>(null);
  // Translate into the language picked last time; the source language is detected.
  const [target, setTarget] = useState("tr");
  useEffect(() => {
    void settingsGet()
      .then((view) => setTarget(view.settings.translate_to))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (state.status === "done") setText(state.text);
    setTranslation({ status: "idle" });
  }, [state]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(timer);
  }, [flash]);

  const copy = async (value: string, key: string) => {
    await clipboardWriteText(value);
    setFlash(key);
  };

  const enqueue = async (value: string, key: string) => {
    await queueAddText(value);
    onQueued();
    setFlash(key);
  };

  const translate = async (to = target) => {
    setTranslation({ status: "loading" });
    try {
      setTranslation({ status: "done", result: await translateText(text, to) });
    } catch (message) {
      setTranslation({ status: "error", message: String(message) });
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="ocr" onPointerDown={(e) => e.stopPropagation()}>
      <header className="ocr__header">
        <h2>{t("ocr.title")}</h2>
        <button type="button" className="icon-button" title={t("ocr.close")} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      {state.status === "loading" && (
        <div className="ocr__status">
          <span className="spinner" />
          {t("ocr.reading")}
        </div>
      )}
      {state.status === "error" && <div className="ocr__status ocr__status--error">{state.message}</div>}

      {state.status === "done" && (
        <>
          {hasText || text !== state.text ? (
            <textarea
              className="ocr__text"
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <div className="ocr__status">{t("ocr.nothing")}</div>
          )}
          <div className="ocr__actions">
            <button type="button" className="primary" disabled={!hasText} onClick={() => void copy(text, "copy")}>
              {flash === "copy" ? t("ocr.copied") : t("ocr.copy")}
            </button>
            <button type="button" disabled={!hasText} onClick={() => void enqueue(text, "queue")}>
              {flash === "queue" ? t("ocr.queued") : t("ocr.add_to_queue")}
            </button>
          </div>
          <div className="ocr__translate">
            <button
              type="button"
              disabled={!hasText || translation.status === "loading"}
              onClick={() => void translate()}
            >
              {t("ocr.translate")}
            </button>
            <span className="ocr__arrow" aria-hidden="true">
              →
            </span>
            <LanguagePicker
              value={target}
              onChange={(code) => {
                setTarget(code);
                // Already translated: redo it in the new language straight away.
                if (translation.status === "done" && hasText) void translate(code);
              }}
            />
          </div>

          {translation.status === "loading" && (
            <div className="ocr__status">
              <span className="spinner" />
              {t("ocr.translating")}
            </div>
          )}
          {translation.status === "error" && (
            <div className="ocr__status ocr__status--error">{translation.message}</div>
          )}
          {translation.status === "done" && (
            <section className="ocr__translation">
              <div className="ocr__lang">
                {t("ocr.translated", {
                  source: translation.result.source ? languageName(translation.result.source) : "?",
                  target: languageName(translation.result.target),
                })}
              </div>
              <p>{translation.result.text}</p>
              <div className="ocr__actions">
                <button type="button" onClick={() => void copy(translation.result.text, "copy-tr")}>
                  {flash === "copy-tr" ? t("ocr.copied") : t("ocr.copy")}
                </button>
                <button type="button" onClick={() => void enqueue(translation.result.text, "queue-tr")}>
                  {flash === "queue-tr" ? t("ocr.queued") : t("ocr.add_to_queue")}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

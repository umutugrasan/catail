import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { t } from "../../lib/i18n";

const SHORTCUTS: [keys: string, labelKey: string][] = [
  ["PrintScreen", "settings.shortcut_region"],
  ["Shift + PrintScreen", "settings.shortcut_fullscreen"],
];

const OVERLAY_KEYS: [keys: string, labelKey: string][] = [
  ["Ctrl + C / Enter", "settings.overlay_copy"],
  ["Ctrl + S", "settings.overlay_save"],
  ["Esc", "settings.overlay_cancel"],
];

function KeyTable({ rows }: { rows: [string, string][] }) {
  return (
    <table>
      <tbody>
        {rows.map(([keys, labelKey]) => (
          <tr key={keys}>
            <td>
              <kbd>{keys}</kbd>
            </td>
            <td>{t(labelKey)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Settings() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion, () => setVersion(null));
  }, []);

  return (
    <main>
      <h1>{t("settings.title")}</h1>

      <section>
        <h2>{t("settings.shortcuts")}</h2>
        <KeyTable rows={SHORTCUTS} />
      </section>

      <section>
        <h2>{t("settings.overlay_keys")}</h2>
        <KeyTable rows={OVERLAY_KEYS} />
      </section>

      <p className="note">{t("settings.printscreen_note")}</p>
      <p className="muted">{t("settings.coming_soon")}</p>
      {version && <p className="muted">{t("settings.version", { version })}</p>}
    </main>
  );
}

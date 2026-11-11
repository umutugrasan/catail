import { useCallback, useEffect, useRef, useState } from "react";
import { useWornTheme, wearCustomCat, wearPlainAccent } from "../../lib/cat";
import { BoxCat, CatFace, LeapingCat, ShellTurtle } from "../../lib/cats";
import { LANGUAGES, t, uiLanguage } from "../../lib/i18n";
import { CUSTOM_PRESETS, type CustomCat } from "../../lib/customCat";
import {
  ANIMAL_THEMES,
  ANIMALS,
  animalOf,
  BADGE_CORNERS,
  BADGE_SIZES,
  PANEL_LAYOUTS,
  catSet,
  customCatSet,
  plainAccentSet,
  settingsGet,
  settingsSave,
  updateCheck,
  updateInstall,
  type Animal,
  type AppPasteRule,
  type BadgeCorner,
  type Cat,
  type HotkeyMap,
  type PanelLayout,
  type PasteMode,
  type Settings as SettingsModel,
  type UpdateInfo,
} from "../../lib/ipc";
import { PLAIN_PRESETS } from "../../lib/plainAccent";
import { ColorPicker } from "../overlay/ColorPicker";
import { ChevronIcon } from "../overlay/icons";
import { HotkeyField } from "./HotkeyField";

/** A small picture of the panel in each layout, over the badge's pill. */
function LayoutIcon({ layout }: { layout: PanelLayout }) {
  return (
    <svg className={`layout-card__icon layout-card__icon--${layout}`} viewBox="0 0 64 58" width={64} height={58} aria-hidden="true">
      {layout === "grid" ? (
        <>
          <rect className="layout-card__frame" x="18" y="2" width="44" height="42" rx="4" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} className="layout-card__tile" x={22 + (i % 2) * 19} y={6 + Math.floor(i / 2) * 17} width="16" height="14" rx="2" />
          ))}
        </>
      ) : (
        <>
          <rect className="layout-card__frame" x="38" y="2" width="24" height="42" rx="4" />
          {[0, 1, 2].map((i) => (
            <rect key={i} className="layout-card__tile" x="41" y={6 + i * 12} width="18" height="10" rx="2" />
          ))}
          {[0, 1, 2].map((i) => (
            <circle key={i} className="layout-card__bubble" cx="31" cy={6 + i * 6.5} r="2.6" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </>
      )}
      <rect className="layout-card__pill" x={layout === "grid" ? 30 : 36} y="48" width={layout === "grid" ? 32 : 26} height="8" rx="4" />
    </svg>
  );
}

/** The plain theme's card shows a plain window; there's no cat to show. */
function PlainThemeIcon() {
  return (
    <svg className="cat-card__plain" viewBox="0 0 58 58" width={58} height={58} aria-hidden="true">
      <rect x="6" y="11" width="46" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 21h46" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

const CUSTOM_PARTS: [keyof CustomCat, string][] = [
  ["fur", "settings.custom_fur"],
  ["belly", "settings.custom_belly"],
  ["eyes", "settings.custom_eyes"],
];

const HOTKEYS: [keyof HotkeyMap, string][] = [
  ["region", "settings.shortcut_region"],
  ["fullscreen", "settings.shortcut_fullscreen"],
  ["paste", "settings.shortcut_paste"],
  ["clear", "settings.shortcut_clear"],
  ["undo", "settings.shortcut_undo"],
];

const PASTE_MODES: PasteMode[] = ["auto", "batch", "sequential"];

const SEPARATORS: [string, string][] = [
  ["\n\n", "settings.separator_blank_line"],
  ["\n", "settings.separator_new_line"],
  [" ", "settings.separator_space"],
  ["", "settings.separator_none"],
];

type Status = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing" }
  | { kind: "error"; message: string };

const PAGES = [
  ["theme", "settings.cat"],
  ["shortcuts", "settings.shortcuts"],
  ["paste", "settings.paste"],
  ["rules", "settings.app_rules"],
  ["general", "settings.general"],
  ["updates", "settings.updates"],
] as const;
type Page = (typeof PAGES)[number][0];

export function Settings() {
  const worn = useWornTheme();
  const [page, setPage] = useState<Page>("theme");
  const [settings, setSettings] = useState<SettingsModel | null>(null);
  const [version, setVersion] = useState("");
  const [systemLanguage, setSystemLanguage] = useState("en");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    void settingsGet().then((view) => {
      setSettings(view.settings);
      setVersion(view.version);
      setSystemLanguage(view.system_language);
    });
  }, []);

  const change = useCallback((patch: Partial<SettingsModel>) => {
    setSettings((current) => current && { ...current, ...patch });
    setStatus({ kind: "idle" });
  }, []);

  const setHotkey = useCallback(
    (key: keyof HotkeyMap) => (accelerator: string) => {
      setSettings((current) => current && { ...current, hotkeys: { ...current.hotkeys, [key]: accelerator } });
      setStatus({ kind: "idle" });
    },
    [],
  );

  const pickCat = (cat: Cat) => {
    change({ cat });
    void catSet(cat);
  };

  // The animal whose themes are listed. Picking another one puts on its first theme.
  const [animal, setAnimal] = useState<Animal>("cat");
  useEffect(() => {
    const worn = settings && animalOf(settings.cat);
    if (worn) setAnimal(worn);
  }, [settings?.cat]);
  const pickAnimal = (next: Animal) => {
    setAnimal(next);
    if (settings && animalOf(settings.cat) !== next) pickCat(ANIMAL_THEMES[next][0]);
  };

  // "Kendi kedin": like the plain theme's color, shown here at once and saved a moment later.
  const [customOpen, setCustomOpen] = useState<keyof CustomCat | null>(null);
  const customTimer = useRef(0);
  const pickCustom = (part: keyof CustomCat) => (color: string) => {
    if (!settings) return;
    const custom = { ...settings.custom_cat, [part]: color };
    change({ custom_cat: custom });
    wearCustomCat(custom);
    window.clearTimeout(customTimer.current);
    customTimer.current = window.setTimeout(() => void customCatSet(custom), 150);
  };

  // The plain theme's color shows here at once; it's saved (and sent to the other windows)
  // once the picker stops moving for a moment.
  const [accentOpen, setAccentOpen] = useState(false);
  const accentTimer = useRef(0);
  const pickAccent = (color: string) => {
    change({ plain_accent: color });
    wearPlainAccent(color);
    window.clearTimeout(accentTimer.current);
    accentTimer.current = window.setTimeout(() => void plainAccentSet(color), 150);
  };

  const setRule = (index: number, patch: Partial<AppPasteRule>) => {
    if (!settings) return;
    change({ app_rules: settings.app_rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  };

  const save = async () => {
    if (!settings) return;
    try {
      await settingsSave(settings);
      // Show what was actually stored (numbers clamped, rules tidied).
      setSettings((await settingsGet()).settings);
      setStatus({ kind: "saved" });
    } catch (message) {
      setStatus({ kind: "error", message: String(message) });
    }
  };

  const check = async () => {
    setUpdate({ kind: "checking" });
    try {
      const info = await updateCheck();
      setUpdate(info ? { kind: "available", info } : { kind: "none" });
    } catch (message) {
      setUpdate({ kind: "error", message: String(message) });
    }
  };

  const install = async () => {
    setUpdate({ kind: "installing" });
    try {
      await updateInstall(); // restarts the app on success
    } catch (message) {
      setUpdate({ kind: "error", message: String(message) });
    }
  };

  if (!settings) return <main className="settings" />;

  return (
    <main className="settings">
      <header className="settings__header">
        <h1>
          <CatFace size={26} />
          {t("settings.title")}
        </h1>
        {worn === "turtle" ? <ShellTurtle /> : <BoxCat />}
      </header>

      <nav className="settings__nav">
        {PAGES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === page ? "active" : undefined}
            aria-current={id === page ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>

      <div key={page} className="settings__page">
        {page === "theme" && (
          <section>
            <h2>{t("settings.animal")}</h2>
            <div className="animal-picker">
              {ANIMALS.map((each) => (
                <button
                  key={each}
                  type="button"
                  data-cat={ANIMAL_THEMES[each][0]}
                  className={`animal-card${each === animal ? " animal-card--active" : ""}`}
                  aria-pressed={each === animal}
                  onClick={() => pickAnimal(each)}
                >
                  <LeapingCat size={34} />
                  {t(`settings.animal_${each}`)}
                </button>
              ))}
            </div>
            <h2>{t("settings.cat")}</h2>
            <div className="cat-picker">
              {[...ANIMAL_THEMES[animal], "plain" as const].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  data-cat={cat}
                  className={`cat-card${cat === settings.cat ? " cat-card--active" : ""}`}
                  aria-pressed={cat === settings.cat}
                  onClick={() => pickCat(cat)}
                >
                  {cat === "plain" ? <PlainThemeIcon /> : <LeapingCat size={58} />}
                  {t(`settings.cat_${cat}`)}
                </button>
              ))}
            </div>
            {settings.cat === "custom" && (
              <div className="plain-color">
                <div className="custom-parts">
                  {CUSTOM_PARTS.map(([part, label]) => (
                    <button
                      key={part}
                      type="button"
                      className={`plain-color__button${customOpen === part ? " open" : ""}`}
                      aria-expanded={customOpen === part}
                      onClick={() => setCustomOpen((open) => (open === part ? null : part))}
                    >
                      <span className="plain-color__swatch" style={{ background: settings.custom_cat[part] }} />
                      {t(label)}
                      <ChevronIcon />
                    </button>
                  ))}
                </div>
                {customOpen && (
                  <ColorPicker
                    key={customOpen}
                    color={settings.custom_cat[customOpen]}
                    presets={CUSTOM_PRESETS[customOpen]}
                    onChange={pickCustom(customOpen)}
                  />
                )}
              </div>
            )}
            {settings.cat === "plain" && (
              <div className="plain-color">
                <button
                  type="button"
                  className={`plain-color__button${accentOpen ? " open" : ""}`}
                  aria-expanded={accentOpen}
                  onClick={() => setAccentOpen((open) => !open)}
                >
                  <span className="plain-color__swatch" style={{ background: settings.plain_accent }} />
                  {t("settings.plain_color")}
                  <code>{settings.plain_accent.toUpperCase()}</code>
                  <ChevronIcon />
                </button>
                {accentOpen && (
                  <ColorPicker color={settings.plain_accent} presets={PLAIN_PRESETS} onChange={pickAccent} />
                )}
              </div>
            )}
          </section>
        )}

        {page === "shortcuts" && (
          <section>
            <h2>{t("settings.shortcuts")}</h2>
            <table>
              <tbody>
                {HOTKEYS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{t(label)}</td>
                    <td>
                      <HotkeyField value={settings.hotkeys[key]} onChange={setHotkey(key)} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>{t("settings.shortcut_ctrl_v")}</td>
                  <td>
                    <kbd>Ctrl + V</kbd> <span className="muted">{t("settings.fixed")}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="muted">{t("settings.hotkey_help")}</p>
          </section>
        )}

        {page === "paste" && (
          <section>
            <h2>{t("settings.paste")}</h2>
            <label className="field">
              <span>{t("settings.paste_mode")}</span>
              <select
                value={settings.paste_mode}
                onChange={(e) => change({ paste_mode: e.target.value as PasteMode })}
              >
                {PASTE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`settings.paste_mode_${mode}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">{t(`settings.paste_mode_${settings.paste_mode}_help`)}</p>

            <label className="field">
              <span>{t("settings.sequential_delay")}</span>
              <input
                type="number"
                min={50}
                max={5000}
                step={50}
                value={settings.sequential_delay_ms}
                onChange={(e) => change({ sequential_delay_ms: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>{t("settings.batch_restore_delay")}</span>
              <input
                type="number"
                min={50}
                max={5000}
                step={50}
                value={settings.batch_restore_delay_ms}
                onChange={(e) => change({ batch_restore_delay_ms: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>{t("settings.text_separator")}</span>
              <select value={settings.text_separator} onChange={(e) => change({ text_separator: e.target.value })}>
                {SEPARATORS.map(([value, label]) => (
                  <option key={label} value={value}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.send_enter_between_texts}
                onChange={(e) => change({ send_enter_between_texts: e.target.checked })}
              />
              {t("settings.send_enter")}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.clear_queue_after_paste}
                onChange={(e) => change({ clear_queue_after_paste: e.target.checked })}
              />
              {t("settings.clear_after_paste")}
            </label>
          </section>
        )}

        {page === "rules" && (
          <section>
            <h2>{t("settings.app_rules")}</h2>
            <p className="muted">{t("settings.app_rules_help")}</p>
            {settings.app_rules.length > 0 && (
              <table className="rules">
                <thead>
                  <tr>
                    <th>{t("settings.rule_process")}</th>
                    <th>{t("settings.rule_mode")}</th>
                    <th>{t("settings.rule_delay")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {settings.app_rules.map((rule, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          value={rule.process}
                          placeholder="whatsapp.exe"
                          onChange={(e) => setRule(index, { process: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={rule.mode}
                          onChange={(e) => setRule(index, { mode: e.target.value as PasteMode })}
                        >
                          <option value="sequential">{t("settings.paste_mode_sequential")}</option>
                          <option value="batch">{t("settings.paste_mode_batch")}</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={50}
                          max={5000}
                          step={50}
                          value={rule.delay_ms ?? ""}
                          placeholder={String(settings.sequential_delay_ms)}
                          onChange={(e) =>
                            setRule(index, { delay_ms: e.target.value === "" ? null : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          title={t("settings.rule_remove")}
                          onClick={() => change({ app_rules: settings.app_rules.filter((_, i) => i !== index) })}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                change({ app_rules: [...settings.app_rules, { process: "", mode: "sequential", delay_ms: null }] })
              }
            >
              {t("settings.rule_add")}
            </button>
          </section>
        )}

        {page === "general" && (
          <section>
            <h2>{t("settings.general")}</h2>
            <label className="field">
              <span>{t("settings.language")}</span>
              <select
                value={settings.language ?? ""}
                onChange={(e) => change({ language: e.target.value === "" ? null : e.target.value })}
              >
                <option value="">{t("settings.language_system", {
                    language: LANGUAGES.find(([code]) => code === systemLanguage)?.[1] ?? systemLanguage,
                  })}</option>
                {LANGUAGES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("settings.badge_corner")}</span>
              <select
                value={settings.badge_corner}
                onChange={(e) => change({ badge_corner: e.target.value as BadgeCorner })}
              >
                {BADGE_CORNERS.map((corner) => (
                  <option key={corner} value={corner}>
                    {t(`settings.corner_${corner}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("settings.badge_size")}</span>
              <span className="size-field">
                <input
                  type="range"
                  min={BADGE_SIZES.min}
                  max={BADGE_SIZES.max}
                  step={BADGE_SIZES.step}
                  value={settings.badge_size}
                  onChange={(e) => change({ badge_size: Number(e.target.value) })}
                  onDoubleClick={() => change({ badge_size: 100 })}
                />
                <output>
                  {new Intl.NumberFormat(uiLanguage(), { style: "percent" }).format(settings.badge_size / 100)}
                </output>
              </span>
            </label>
            <div className="field field--stack">
              <span>{t("settings.panel_layout")}</span>
              <div className="layout-picker">
                {PANEL_LAYOUTS.map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    className={`layout-card${layout === settings.panel_layout ? " layout-card--active" : ""}`}
                    aria-pressed={layout === settings.panel_layout}
                    onClick={() => change({ panel_layout: layout })}
                  >
                    <LayoutIcon layout={layout} />
                    <strong>{t(`settings.layout_${layout}`)}</strong>
                    <small>{t(`settings.layout_${layout}_hint`)}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.autostart}
                onChange={(e) => change({ autostart: e.target.checked })}
              />
              {t("settings.autostart")}
            </label>
            <p className="note">{t("settings.printscreen_note")}</p>
          </section>
        )}

        {page === "updates" && (
          <section>
            <h2>{t("settings.updates")}</h2>
            <p className="muted">{t("settings.version", { version })}</p>
            <div className="update">
              {update.kind === "available" ? (
                <button type="button" className="primary" onClick={() => void install()}>
                  {t("settings.update_install", { version: update.info.version })}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={update.kind === "checking" || update.kind === "installing"}
                  onClick={() => void check()}
                >
                  {t("settings.update_check")}
                </button>
              )}
              <span className="muted">
                {update.kind === "checking" && t("settings.update_checking")}
                {update.kind === "none" && t("settings.update_none")}
                {update.kind === "installing" && t("settings.update_installing")}
                {update.kind === "error" && t("settings.update_error")}
              </span>
            </div>
          </section>
        )}
      </div>

      <footer className="settings__footer">
        <span className={status.kind === "error" ? "error" : "muted"}>
          {status.kind === "saved" && t("settings.saved")}
          {status.kind === "error" && status.message}
        </span>
        <button type="button" className="primary" onClick={() => void save()}>
          {t("settings.save")}
        </button>
      </footer>
    </main>
  );
}

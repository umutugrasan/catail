; Hooks for the NSIS installer.

; The app writes its "Kuyruğa ekle" entry for files itself (src/shell_menu.rs); it goes with the app.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\Catail.AddToQueue"
!macroend

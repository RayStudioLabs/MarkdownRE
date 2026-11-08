!macro customHeader
  LangString markdownreDefaultOption 1033 "Set .md default in Windows Settings"
  LangString markdownreDefaultOption 2052 "在 Windows 设置中设为 .md 默认应用"
  LangString markdownreDefaultOption 1028 "在 Windows 設定中設為 .md 預設應用程式"
  LangString markdownreDefaultOption 1031 "Standard für .md in Windows festlegen"
  LangString markdownreDefaultOption 1036 "Définir l’application .md dans Windows"
  LangString markdownreDefaultOption 3082 "Elegir la aplicación .md en Windows"
  LangString markdownreDefaultOption 1041 "Windows の設定で .md の既定アプリを選択"
  LangString markdownreDefaultOption 1042 "Windows 설정에서 .md 기본 앱 선택"
  LangString markdownreDefaultOption 1046 "Escolher app padrão de .md no Windows"
  LangString markdownreDefaultOption 1040 "Scegli l’app predefinita .md in Windows"
!macroend

!macro customInstall
  ; Register an available handler without overwriting the user's default choice.
  File /oname=$INSTDIR\MarkdownDocument.ico "${PROJECT_DIR}\desktop\assets\MarkdownDocument.ico"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "MarkdownRE.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\Classes\MarkdownRE.Markdown" "" "Markdown document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\MarkdownRE.Markdown\DefaultIcon" "" "$INSTDIR\MarkdownDocument.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\MarkdownRE.Markdown\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "Software\RayStudioLabs\MarkdownRE\Capabilities" "ApplicationName" "MarkdownRE"
  WriteRegStr SHELL_CONTEXT "Software\RayStudioLabs\MarkdownRE\Capabilities" "ApplicationDescription" "Markdown reader and editor"
  WriteRegStr SHELL_CONTEXT "Software\RayStudioLabs\MarkdownRE\Capabilities\FileAssociations" ".md" "MarkdownRE.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "MarkdownRE" "Software\RayStudioLabs\MarkdownRE\Capabilities"
  System::Call 'shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "MarkdownRE"
  DeleteRegKey SHELL_CONTEXT "Software\RayStudioLabs\MarkdownRE"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "MarkdownRE.Markdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\MarkdownRE.Markdown"
  System::Call 'shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0, 0, 0)'
!macroend

!macro customFinishPage
  Function MarkdownREStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  Function MarkdownREOpenDefaultSettings
    ${if} $installMode == "all"
      ${StdUtils.ExecShellAsUser} $0 "ms-settings:defaultapps?registeredAppMachine=MarkdownRE" "open" ""
    ${else}
      ${StdUtils.ExecShellAsUser} $0 "ms-settings:defaultapps?registeredAppUser=MarkdownRE" "open" ""
    ${endif}
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "MarkdownREStartApp"
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "$(markdownreDefaultOption)"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "MarkdownREOpenDefaultSettings"
  !insertmacro MUI_PAGE_FINISH
!macroend

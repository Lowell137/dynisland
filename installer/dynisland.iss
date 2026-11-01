; Build the release exe first: cargo build --release (CARGO_TARGET_DIR=C:\dyn-target), then compile this with ISCC.
#define AppVersion "0.1.1"
#define BuildDir "C:\dyn-target\release"

[Setup]
AppId={{7E2B6F2A-4C1D-4E7B-9A53-3D1F5A0C8E21}
AppName=DynIsland
AppVersion={#AppVersion}
AppPublisher=Lowell137
AppPublisherURL=https://github.com/Lowell137/dynisland
DefaultDirName={localappdata}\Programs\DynIsland
DefaultGroupName=DynIsland
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=DynIsland-Setup-{#AppVersion}
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\dynisland.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[CustomMessages]
english.AutoStart=Start DynIsland with Windows
turkish.AutoStart=DynIsland'ı Windows ile başlat

[Tasks]
Name: "autostart"; Description: "{cm:AutoStart}"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "{#BuildDir}\dynisland.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\DynIsland"; Filename: "{app}\dynisland.exe"
Name: "{autodesktop}\DynIsland"; Filename: "{app}\dynisland.exe"; Tasks: desktopicon

[Registry]
; same value the app's own "Start with Windows" setting uses; removed on uninstall either way
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DynIsland"; ValueData: """{app}\dynisland.exe"""; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "DynIsland"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\dynisland.exe"; Description: "{cm:LaunchProgram,DynIsland}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM dynisland.exe /F"; Flags: runhidden; RunOnceId: "StopApp"

[Code]
// a running copy would lock the exe during an update
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM dynisland.exe /F', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(500);
  Result := '';
end;

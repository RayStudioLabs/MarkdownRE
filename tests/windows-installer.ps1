$ErrorActionPreference = 'Stop'
$installers = @(Get-ChildItem release -Filter '*-install.exe')
if ($installers.Count -ne 1) { throw "Expected exactly one Windows installer, found $($installers.Count)." }
$extension = 'HKCU:\Software\Classes\.md'
$before = if (Test-Path $extension) { (Get-Item $extension).GetValue('') } else { $null }
$install = Start-Process -FilePath $installers[0].FullName -ArgumentList '/S', '/currentuser' -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
try {
  $appDir = Join-Path $env:LOCALAPPDATA 'Programs\MarkdownRE'
  if (-not (Test-Path (Join-Path $appDir 'MarkdownRE.exe'))) { throw 'Application executable was not installed.' }
  if (-not (Test-Path (Join-Path $appDir 'MarkdownDocument.ico'))) { throw 'Markdown document icon was not installed.' }
  $registry = Get-ItemProperty 'HKCU:\Software\RegisteredApplications'
  if ($registry.MarkdownRE -ne 'Software\RayStudioLabs\MarkdownRE\Capabilities') { throw 'Default apps registration is missing.' }
  $capabilities = Get-Item 'HKCU:\Software\RayStudioLabs\MarkdownRE\Capabilities\FileAssociations'
  if ($capabilities.GetValue('.md') -ne 'MarkdownRE.Markdown') { throw '.md capability is missing.' }
  $openWith = Get-Item 'HKCU:\Software\Classes\.md\OpenWithProgids'
  if ('MarkdownRE.Markdown' -notin $openWith.GetValueNames()) { throw 'Open With registration is missing.' }
  $after = if (Test-Path $extension) { (Get-Item $extension).GetValue('') } else { $null }
  if ($before -ne $after) { throw 'Installation changed the existing .md default without user confirmation.' }
  $uninstaller = @(Get-ChildItem $appDir -Filter '*Uninstall*.exe')
  if ($uninstaller.Count -ne 1) { throw 'Uninstaller not found.' }
  $uninstall = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S', '/currentuser' -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
  $registered = Get-ItemProperty 'HKCU:\Software\RegisteredApplications' -ErrorAction SilentlyContinue
  if ($registered -and $registered.PSObject.Properties.Name -contains 'MarkdownRE') { throw 'Default apps registration remained after uninstall.' }
  Write-Host 'PASS: Windows installation, default-app registration, existing default and uninstall'
} finally {
  if ($uninstaller -and (Test-Path $uninstaller[0].FullName)) {
    Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S', '/currentuser' -Wait | Out-Null
  }
}

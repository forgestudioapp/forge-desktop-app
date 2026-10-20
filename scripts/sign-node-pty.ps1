param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { exit 0 }

$certificate = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Where-Object { $_.HasPrivateKey -and $_.Subject -eq 'CN=Forge Studio, O=Forge Studio' -and $_.NotAfter -gt (Get-Date) } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  Write-Warning 'Certificat Forge Studio absent : les modules node-pty locaux restent non signés.'
  exit 0
}

$release = Join-Path $ProjectRoot 'node_modules\node-pty\build\Release'
$files = @(
  (Join-Path $release 'conpty.node'),
  (Join-Path $release 'conpty_console_list.node'),
  (Join-Path $release 'pty.node'),
  (Join-Path $release 'winpty-agent.exe'),
  (Join-Path $release 'winpty.dll')
) | Where-Object { Test-Path -LiteralPath $_ }

foreach ($file in $files) {
  $existing = Get-AuthenticodeSignature -LiteralPath $file
  if ($existing.SignerCertificate.Thumbprint -eq $certificate.Thumbprint) { continue }
  $signed = Set-AuthenticodeSignature -LiteralPath $file -Certificate $certificate -HashAlgorithm SHA256
  if ($signed.SignerCertificate.Thumbprint -ne $certificate.Thumbprint) {
    throw "Signature impossible : $file"
  }
  Write-Host "[PTY] Signé : $file"
}

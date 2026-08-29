$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut("C:\Users\Maxence\Desktop\Forge.lnk")
Write-Host "Target: $($lnk.TargetPath)"
Write-Host "Dir: $($lnk.WorkingDirectory)"

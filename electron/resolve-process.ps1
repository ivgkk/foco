param([long]$WindowHandle = 0)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FocoWindowProcess {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$target = if ($WindowHandle -gt 0) { [IntPtr]::new($WindowHandle) } else { [FocoWindowProcess]::GetForegroundWindow() }
[uint32]$processId = 0
[void][FocoWindowProcess]::GetWindowThreadProcessId($target, [ref]$processId)
Write-Output $processId

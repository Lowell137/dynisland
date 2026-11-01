# Lists the apps of the Start menu (desktop and Store) with their real icons, as JSON on stdout.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.IO; using System.Runtime.InteropServices;
public static class AppIcon {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr bmp); }
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr ctx, [MarshalAs(UnmanagedType.LPStruct)] Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  public static string Get(string path) {
    IntPtr h = IntPtr.Zero;
    try {
      IShellItemImageFactory f;
      SHCreateItemFromParsingName(path, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out f);
      SIZE s; s.cx = 48; s.cy = 48;
      if (f.GetImage(s, 0x1 | 0x4, out h) != 0) return null; // RESIZETOFIT | ICONONLY
      using (var raw = Image.FromHbitmap(h)) {
        // FromHbitmap drops alpha from the format but keeps it in the bytes, so re-wrap them as ARGB
        var d = raw.LockBits(new Rectangle(0, 0, raw.Width, raw.Height), ImageLockMode.ReadOnly, raw.PixelFormat);
        try {
          using (var b = new Bitmap(raw.Width, raw.Height, d.Stride, PixelFormat.Format32bppArgb, d.Scan0))
          using (var m = new MemoryStream()) { b.Save(m, ImageFormat.Png); return Convert.ToBase64String(m.ToArray()); }
        } finally { raw.UnlockBits(d); }
      }
    } catch { return null; } finally { if (h != IntPtr.Zero) DeleteObject(h); }
  }
}
"@
$skip = '(?i)^ms-resource:|uninstall|kald.r|\bhelp\b|readme|read me|documentation|release notes|\bmanual\b|website|\bfaq\b|\bsamples?\b'
$seen = @{}
$out = New-Object System.Collections.ArrayList
$folder = (New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder')
foreach ($it in $folder.Items()) {
  $name = $it.Name
  if (-not $name -or $name -match $skip -or $seen.ContainsKey($name)) { continue }
  $target = $it.ExtendedProperty('System.Link.TargetParsingPath')
  $shell = 'shell:AppsFolder\' + $it.Path
  if ($target) {
    # shortcuts to web pages, documents and the like are not apps
    if ($target -notmatch '(?i)\.exe$') { continue }
    $path = [string]$target
  } elseif ($it.Path -match '!') { $path = $shell }
  else { continue }
  $seen[$name] = 1
  # `shell` starts it the way the Start menu does (some shortcuts need their arguments); `path` is for opening dropped files
  [void]$out.Add(@{ name = $name; path = $path; shell = $shell; icon = [AppIcon]::Get($shell) })
}
ConvertTo-Json -InputObject @($out | Sort-Object { $_.name }) -Compress -Depth 3

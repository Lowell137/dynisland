$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Quns {
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
}
"@

$asTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $t = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$t.Wait(-1)
  $t.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = Await ($mgrType::RequestAsync()) $mgrType

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

$lastKey = ''
$lastFs = $null

# Console.In.ReadLineAsync blocks in PS 5.1, so read stdin on a separate runspace
$queue = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$rs.SessionStateProxy.SetVariable('queue', $queue)
$reader = [powershell]::Create()
$reader.Runspace = $rs
[void]$reader.AddScript({
  while ($true) {
    $l = [Console]::In.ReadLine()
    if ($null -eq $l) { $queue.Enqueue('__eof'); break }
    $queue.Enqueue($l)
  }
})
[void]$reader.BeginInvoke()

while ($true) {
  $line = $null
  while ($queue.TryDequeue([ref]$line)) {
    if ($line -eq '__eof') { exit }
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $c = $line.Trim()
      if ($c -like 'seek:*') {
        $sec = [double]($c.Substring(5))
        [void](Await ($s.TryChangePlaybackPositionAsync([long]($sec * 10000000))) ([bool]))
      } else {
        switch ($c) {
          'toggle'  { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
          'next'    { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
          'prev'    { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
          'shuffle' {
            $cur = $s.GetPlaybackInfo().IsShuffleActive
            [void](Await ($s.TryChangeShuffleActiveAsync(-not [bool]$cur)) ([bool]))
          }
          'repeat'  {
            $mode = [string]$s.GetPlaybackInfo().AutoRepeatMode
            $next = if ($mode -eq 'None') { 'List' } elseif ($mode -eq 'List') { 'Track' } else { 'None' }
            [void](Await ($s.TryChangeAutoRepeatModeAsync([Windows.Media.MediaPlaybackAutoRepeatMode]::$next)) ([bool]))
          }
        }
      }
    }
    $handled = $true
  }
  # give the player a moment to report its new state before we read it back
  if ($handled) { $handled = $false; Start-Sleep -Milliseconds 120 }

  $s = $mgr.GetCurrentSession()
  if ($s) {
    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $tl = $s.GetTimelineProperties()
    $pb = $s.GetPlaybackInfo()
    $key = "$($props.Title)|$($props.Artist)"
    $art = $null
    if ($key -ne $lastKey) {
      $lastKey = $key
      if ($props.Thumbnail) {
        $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        if ($stream) {
          $ms = New-Object System.IO.MemoryStream
          # PowerShell cannot bind the raw WinRT stream to the extension method, so call it by reflection
          $asRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IInputStream' } | Select-Object -First 1
          $asRead.Invoke($null, @($stream)).CopyTo($ms)
          if ($ms.Length -gt 100) {
            $bytes = $ms.ToArray()
            $mime = if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { 'image/png' } elseif ($bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) { 'image/bmp' } else { 'image/jpeg' }
            $art = "data:$mime;base64," + [Convert]::ToBase64String($bytes)
          }
          $stream.Dispose()
        }
      }
      Emit @{ type = 'art'; value = $art }
    }
    Emit @{
      type = 'media'
      title = $props.Title
      artist = $props.Artist
      playing = ($pb.PlaybackStatus -eq 'Playing')
      app = $s.SourceAppUserModelId
      shuffle = [bool]$pb.IsShuffleActive
      repeat = [string]$pb.AutoRepeatMode
      pos = [math]::Round($tl.Position.TotalSeconds, 1)
      end = [math]::Round($tl.EndTime.TotalSeconds, 1)
    }
  } else {
    if ($lastKey -ne '') { $lastKey = ''; Emit @{ type = 'art'; value = $null } }
    Emit @{ type = 'media'; title = $null }
  }
  # wake up early when a command arrives so button presses feel instant
  for ($i = 0; $i -lt 8; $i++) { if ($queue.Count -gt 0) { break }; Start-Sleep -Milliseconds 50 }
}

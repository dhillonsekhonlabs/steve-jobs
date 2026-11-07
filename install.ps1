# Conscious for Windows: puts the great minds into Claude Code and Codex.
#
#   irm https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.ps1 | iex
#
# Run it again to update. It installs to %USERPROFILE%\.conscious, or to CONSCIOUS_HOME if that is set,
# and prints the one line that removes everything it added. It uses the Node already on this machine,
# and only when there is none (or it is older than 18) does it bring its own, from nodejs.org,
# checked against Node's published checksum. CONSCIOUS_SOURCE installs from a folder or another
# repository instead of GitHub; run from a checkout, it installs that checkout.

function Install-Conscious {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # Windows PowerShell downloads crawl with the progress bar on
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = 'https://github.com/dhillonsekhonlabs/steve-jobs'
  $nodeLine = 'https://nodejs.org/dist/latest-v24.x'
  $home_ = $env:CONSCIOUS_HOME
  if (-not $home_) { $home_ = Join-Path $env:USERPROFILE '.conscious' }
  $home_ = [IO.Path]::GetFullPath($home_)
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('conscious-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $home_, $tmp | Out-Null

  # Windows' own tar, which reads zip files. Another tar on PATH (Git's) takes C: for a host name.
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (-not (Test-Path -LiteralPath $tar)) { $tar = $null }

  function Test-Node($exe) {
    if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { return $false }
    & $exe -e "process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1)" 2>$null
    return ($LASTEXITCODE -eq 0)
  }

  try {
    # ---- Node: the one on this machine, the one an earlier install brought, or a new one
    $node = $null
    $found = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and (Test-Node $found.Source)) { $node = $found.Source }
    $own = Join-Path $home_ 'node\node.exe'
    if (-not $node -and (Test-Node $own)) { $node = $own }
    if (-not $node) {
      $plat = 'win-x64'
      if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $plat = 'win-arm64' }
      Write-Host "No Node 18 or newer here, so Conscious brings its own ($plat, from nodejs.org)."
      $sums = [string](Invoke-WebRequest "$nodeLine/SHASUMS256.txt" -UseBasicParsing).Content
      $line = $sums -split "`n" | Where-Object { $_ -match "^([0-9a-f]{64})\s+(node-v[0-9.]+-$plat\.zip)\s*$" } | Select-Object -First 1
      if (-not $line) { throw "nodejs.org lists no $plat build" }
      $null = $line -match "^([0-9a-f]{64})\s+(node-v[0-9.]+-$plat\.zip)"
      $sum = $Matches[1]; $file = $Matches[2]; $stem = $file -replace '\.zip$', ''
      $zip = Join-Path $tmp $file
      Invoke-WebRequest "$nodeLine/$file" -OutFile $zip -UseBasicParsing
      if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $sum.ToUpper()) { throw "the Node download didn't match its checksum" }
      if ($tar) { & $tar -xf $zip -C $tmp "$stem/node.exe"; if ($LASTEXITCODE -ne 0) { throw "couldn't unpack $file" } }
      else { Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force }
      New-Item -ItemType Directory -Force -Path (Split-Path $own) | Out-Null
      Move-Item -LiteralPath (Join-Path $tmp "$stem\node.exe") -Destination $own -Force
      if (-not (Test-Node $own)) { throw "the Node it brought doesn't run" }
      $node = $own
    }

    # ---- Conscious itself: the program and the minds, nothing else
    $src = $env:CONSCIOUS_SOURCE
    if (-not $src -and $PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'bin\conscious.mjs'))) { $src = $PSScriptRoot }
    if (-not $src) { $src = $repo }
    if (-not (Test-Path -LiteralPath $src -PathType Container)) {
      $from = Join-Path $tmp 'src'
      $tgz = Join-Path $tmp 'src.tgz'
      $got = $false
      try {
        Invoke-WebRequest ($src.TrimEnd('/') + '/archive/refs/heads/main.tar.gz') -OutFile $tgz -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $from | Out-Null
        if (-not $tar) { throw 'no tar' }
        & $tar -xzf $tgz -C $from --strip-components=1
        $got = ($LASTEXITCODE -eq 0)
      } catch { $got = $false }
      if (-not $got) {
        # A private repository answers only to git, with the person's own credentials.
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "couldn't download Conscious from $src" }
        if (Test-Path -LiteralPath $from) { Remove-Item -LiteralPath $from -Recurse -Force }
        git clone --quiet --depth 1 $src $from
        if ($LASTEXITCODE -ne 0) { throw "couldn't get Conscious from $src" }
      }
      $src = $from
    }
    foreach ($part in 'bin\conscious.mjs', 'minds') {
      if (-not (Test-Path -LiteralPath (Join-Path $src $part))) { throw "$src has no $part" }
    }
    $new = Join-Path $home_ 'app.new'
    $app = Join-Path $home_ 'app'
    $old = Join-Path $home_ 'app.old'
    foreach ($d in $new, $old) { if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force } }
    New-Item -ItemType Directory -Force -Path $new | Out-Null
    Copy-Item -LiteralPath (Join-Path $src 'bin'), (Join-Path $src 'minds') -Destination $new -Recurse
    if (Test-Path -LiteralPath $app) { Rename-Item -LiteralPath $app -NewName 'app.old' }
    Rename-Item -LiteralPath $new -NewName 'app'
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }

    # ---- into the agents
    $script = Join-Path $app 'bin\conscious.mjs'
    & $node $script check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "the minds it got didn't pass their check: & '$node' '$script' check" }
    & $node $script install --node $node
    if ($LASTEXITCODE -ne 0) { throw "install stopped; the lines above say why" }
    Write-Host ''
    Write-Host 'To update, run the same line again. To remove everything it added:'
    if ($node -eq $own) {
      # Windows can't delete the Node that is running, so PowerShell removes the folder once it exits.
      Write-Host "  & '$node' '$script' uninstall; Remove-Item -LiteralPath '$home_' -Recurse -Force"
    } else {
      Write-Host "  & '$node' '$script' uninstall --all"
    }
  } catch {
    Write-Host "conscious: $($_.Exception.Message)" -ForegroundColor Red
  } finally {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

Install-Conscious

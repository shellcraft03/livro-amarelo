@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $envFiles = @((Join-Path (Get-Location) 'InevitavelGPT2\.env'), (Join-Path (Split-Path (Get-Location) -Parent) '.env.local')); $loaded = $false; foreach ($envFile in $envFiles) { if (-not (Test-Path -LiteralPath $envFile)) { continue }; Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Count -ne 2) { return }; $name = $parts[0].Trim(); $value = $parts[1].Trim().Trim('\"').Trim(\"'\"); [Environment]::SetEnvironmentVariable($name, $value, 'Process') }; Write-Host \"Variaveis carregadas de $envFile\"; $loaded = $true }; if (-not $loaded) { throw 'Nenhum arquivo de env encontrado. Crie BotTwitter2\InevitavelGPT2\.env ou use o .env.local do projeto.' }; python .\main.py"

if errorlevel 1 (
    echo.
    echo Worker finalizou com erro.
    pause
)

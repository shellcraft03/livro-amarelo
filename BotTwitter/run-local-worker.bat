@echo off
setlocal

cd /d "%~dp0"

set "LOCAL_STATE_DIR=%~dp0.local-state"
if not exist "%LOCAL_STATE_DIR%" mkdir "%LOCAL_STATE_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $envFile = Join-Path (Join-Path (Get-Location) 'InevitavelGPT') '.env'; if (-not (Test-Path -LiteralPath $envFile)) { throw \"Arquivo .env nao encontrado: $envFile\" }; Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }; $parts = $_ -split '=', 2; if ($parts.Count -ne 2) { return }; $name = $parts[0].Trim(); $value = $parts[1].Trim().Trim('\"').Trim(\"'\"); [Environment]::SetEnvironmentVariable($name, $value, 'Process') }; $env:STATE_DIR = '%LOCAL_STATE_DIR%'; python .\main.py"

if errorlevel 1 (
    echo.
    echo Worker finalizou com erro.
    pause
)

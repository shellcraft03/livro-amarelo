@echo off
cd /d %~dp0

:MENU
cls
echo.
echo  ============================================
echo    Gestao de Videos -- Livro Amarelo
echo  ============================================
echo.
echo   [1] Listar videos pendentes de curadoria
echo   [2] Curadoria automatica + indexar (pipeline completo)
echo   [3] Listar todos os videos
echo   [4] Curadoria automatica (via IA)
echo   [5] Curadoria manual (aprovar / reprovar)
echo   [6] Indexar videos aprovados
echo   [7] Reprovar video ja aprovado
echo   [8] Resetar indice (apaga vetores Pinecone + desindexar videos)
echo   [0] Sair
echo.
choice /c 012345678 /n /m "Escolha: "

if errorlevel 9 goto OPT8
if errorlevel 8 goto OPT7
if errorlevel 7 goto OPT6
if errorlevel 6 goto OPT5
if errorlevel 5 goto OPT4
if errorlevel 4 goto OPT3
if errorlevel 3 goto OPT2
if errorlevel 2 goto OPT1
goto EXIT

:OPT1
echo.
node scripts/manage_videos.mjs --list-pending
echo.
pause
goto MENU

:OPT2
echo.
node scripts/curate_videos.mjs && node scripts/index_youtube.mjs
echo.
pause
goto MENU

:OPT3
echo.
node scripts/manage_videos.mjs --list-all
echo.
pause
goto MENU

:OPT4
echo.
node scripts/curate_videos.mjs
echo.
pause
goto MENU

:OPT5
echo.
node scripts/manage_videos.mjs --manual-curate
echo.
pause
goto MENU

:OPT6
echo.
node scripts/index_youtube.mjs
echo.
pause
goto MENU

:OPT7
echo.
node scripts/manage_videos.mjs --reject-curated
echo.
pause
goto MENU

:OPT8
echo.
echo   ATENCAO: esta operacao apaga todos os vetores do Pinecone
echo   e desmarca todos os videos como nao indexados.
echo.
choice /c SN /n /m "Confirmar? [S/N]: "
if errorlevel 2 goto MENU
echo.
node scripts/reset_entrevistas_index.mjs
echo.
pause
goto MENU

:EXIT

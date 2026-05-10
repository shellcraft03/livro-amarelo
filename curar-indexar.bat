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
echo   [4] Curadoria manual (aprovar / reprovar)
echo   [5] Indexar videos aprovados
echo   [6] Reprovar video ja aprovado
echo   [7] Resetar indice / curadoria
echo   [0] Sair
echo.
choice /c 01234567 /n /m "Escolha: "

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
node scripts/manage_videos.mjs --manual-curate
echo.
pause
goto MENU

:OPT5
echo.
node scripts/index_youtube.mjs
echo.
pause
goto MENU

:OPT6
echo.
node scripts/manage_videos.mjs --reject-curated
echo.
pause
goto MENU

:OPT7
cls
echo.
echo  ============================================
echo    Resetar Indice / Curadoria
echo  ============================================
echo.
echo   [1] Apagar todos os videos (vetores Pinecone + desindexar todos)
echo   [2] Apagar um video especifico (vetores Pinecone + resetar curadoria)
echo   [3] Resetar curadoria de todos os videos (mantem vetores Pinecone)
echo   [4] Resetar curadoria de um video especifico (mantem vetores Pinecone)
echo   [0] Voltar
echo.
choice /c 01234 /n /m "Escolha: "

if errorlevel 5 goto RESET_CURATION_ONE
if errorlevel 4 goto RESET_CURATION_ALL
if errorlevel 3 goto RESET_ONE
if errorlevel 2 goto RESET_ALL
goto MENU

:RESET_ALL
echo.
echo   ATENCAO: apaga todos os vetores do Pinecone e desmarca todos os videos.
echo.
choice /c SN /n /m "Confirmar? [S/N]: "
if errorlevel 2 goto OPT7
echo.
node scripts/reset_entrevistas_index.mjs
echo.
pause
goto MENU

:RESET_ONE
echo.
node scripts/manage_videos.mjs --reset-video
echo.
pause
goto MENU

:RESET_CURATION_ALL
echo.
node scripts/manage_videos.mjs --reset-curation-all
echo.
pause
goto MENU

:RESET_CURATION_ONE
echo.
node scripts/manage_videos.mjs --reset-curation-video
echo.
pause
goto MENU

:EXIT

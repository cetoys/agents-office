@echo off
title Akyazi Ofis
cd /d "%~dp0"
echo.
echo   AKYAZI OFIS baslatiliyor...
echo.
start "" http://localhost:4520
node serve.mjs
echo.
echo   Ofis kapandi. Kapatmak icin bir tusa bas.
pause >nul

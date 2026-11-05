@echo off
taskkill /IM MundoMedSeg.exe /F >nul 2>&1
echo MundoMedSeg encerrado.
timeout /t 2 >nul

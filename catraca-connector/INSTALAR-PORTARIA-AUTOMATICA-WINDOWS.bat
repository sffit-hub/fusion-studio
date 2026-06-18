@echo off
cd /d "%~dp0"
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Instalando portaria automatica Fusion Studio...
schtasks /Create /TN "Fusion Studio Portaria Catraca" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0FUSION-CATRACA-AUTONOMA.ps1\"" /SC ONLOGON /RL HIGHEST /F

echo.
echo Pronto. Ao entrar no Windows, este computador vai:
echo - abrir o Henry7x se estiver fechado
echo - preparar a tela de liberacao em 5 segundos
echo - iniciar o conector do site
echo.
pause

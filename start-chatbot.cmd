@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-chatbot.ps1" %*
if errorlevel 1 echo Chatbot startup failed. Read the error above.
pause

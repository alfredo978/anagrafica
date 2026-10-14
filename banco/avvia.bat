@echo off
cd /d "%~dp0"
py -3 avvia.py
if errorlevel 1 python avvia.py
pause

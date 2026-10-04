@echo off
rem Shorts thumbnail worker supervisor (runtime root). Copied here by release.mjs install-task.
rem Each loop reads current.txt and runs releases\<version>\worker.mjs - never the dev working tree.
rem   exit 3 = another worker already running -> stop this supervisor (no duplicates)
rem   exit 2 = no config, exit 4 = integrity/dependency failure -> re-check every 10 minutes
rem   other  = crashed / network error -> restart after 30 seconds
setlocal
set "ROOT=%~dp0"
set "LOGDIR=C:\Users\iimoo\android-test\dl\yt-frame-worker"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"

:loop
set "VER="
if exist "%ROOT%current.txt" set /p VER=<"%ROOT%current.txt"
if not defined VER (
  >> "%LOGDIR%\supervisor.log" echo [%date% %time%] no current.txt - waiting
  ping -n 601 127.0.0.1 >nul
  goto loop
)
set "WORKER=%ROOT%releases\%VER%\worker.mjs"
if not exist "%WORKER%" (
  >> "%LOGDIR%\supervisor.log" echo [%date% %time%] missing release %VER% - waiting
  ping -n 601 127.0.0.1 >nul
  goto loop
)
>> "%LOGDIR%\supervisor.log" echo [%date% %time%] worker start version=%VER%
"%NODE%" "%WORKER%" >> "%LOGDIR%\worker-console.log" 2>&1
set "CODE=%errorlevel%"
rem redirect first: "code=2>>" would otherwise be parsed as a stderr redirect
>> "%LOGDIR%\supervisor.log" echo [%date% %time%] worker exit code=%CODE% version=%VER%
if "%CODE%"=="3" exit /b 3
if "%CODE%"=="2" goto longwait
if "%CODE%"=="4" goto longwait
ping -n 31 127.0.0.1 >nul
goto loop
:longwait
ping -n 601 127.0.0.1 >nul
goto loop

@echo off
chcp 65001 > nul
echo =======================================
echo   LabFlow Updater
echo.
echo   Backing up data...
if exist "data" (
  xcopy /E /I /Y "data" "data_backup" > nul 2>&1
)

echo.
echo   Downloading new version...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/test/test/releases/download/v1.0.2/labflow-release.zip' -OutFile 'update.zip'"
if errorlevel 1 (
  echo   Download failed.
  if exist "data_backup" (
    xcopy /E /I /Y "data_backup" "data" > nul 2>&1
    rmdir /S /Q "data_backup" > nul 2>&1
  )
  pause
  exit /b 1
)

echo.
echo   Extracting...
if exist "update_temp" rmdir /S /Q "update_temp" > nul 2>&1
powershell -Command "Expand-Archive -Path 'update.zip' -DestinationPath 'update_temp' -Force"

REM Detect extracted structure: flat or nested in a single subfolder
set "UPDATE_SRC=update_temp"
if not exist "update_temp\start.bat" (
  if not exist "update_temp\server.cjs" (
    for /d %%D in (update_temp\*) do (
      if exist "%%D\start.bat" set "UPDATE_SRC=%%D"
      if exist "%%D\server.cjs" set "UPDATE_SRC=%%D"
    )
  )
)

echo.
echo   Stopping server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq LabFlow*" > nul 2>&1
timeout /t 2 /nobreak > nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING 2^>nul') do (
  taskkill /F /PID %%a > nul 2>&1
)
timeout /t 2 /nobreak > nul

echo.
echo   Updating files...
xcopy /E /Y "%UPDATE_SRC%\*" "." /EXCLUDE:update_exclude.txt > nul 2>&1
if errorlevel 1 (
  xcopy /E /Y "%UPDATE_SRC%\*" "." > nul 2>&1
)

echo.
echo   Restoring data...
if exist "data_backup" (
  xcopy /E /I /Y "data_backup" "data" > nul 2>&1
  rmdir /S /Q "data_backup" > nul 2>&1
)

echo.
echo   Cleaning up...
del update.zip > nul 2>&1
rmdir /S /Q "update_temp" > nul 2>&1

echo.
echo   Update complete! Restarting LabFlow...
timeout /t 3 > nul
del "%~f0"

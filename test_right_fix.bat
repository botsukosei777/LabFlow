@echo off
chcp 65001 > nul
echo =======================================
echo   LabFlow Updater
echo.
echo   \u30C7\u30FC\u30BF\u3092\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3057\u3066\u3044\u307E\u3059...
if exist "data" (
  xcopy /E /I /Y "data" "data_backup" > nul 2>&1
)

echo.
echo   \u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u3066\u3044\u307E\u3059...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://example.com/test.zip' -OutFile 'update.zip'"
if errorlevel 1 (
  echo   \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002
  if exist "data_backup" (
    xcopy /E /I /Y "data_backup" "data" > nul 2>&1
    rmdir /S /Q "data_backup" > nul 2>&1
  )
  pause
  exit /b 1
)

echo.
echo   \u5C55\u958B\u3057\u3066\u3044\u307E\u3059...
if exist "update_temp" rmdir /S /Q "update_temp" > nul 2>&1
powershell -Command "Expand-Archive -Path 'update.zip' -DestinationPath 'update_temp' -Force"

REM Detect extracted structure: flat or nested in a single subfolder
REM Check if the extracted folder contains start.bat directly or inside a subfolder
set "UPDATE_SRC=update_temp"
if not exist "update_temp\\start.bat" (
  if not exist "update_temp\\server.cjs" (
    REM Probably extracted into a subfolder, find it
    for /d %%D in (update_temp\\*) do (
      if exist "%%D\\start.bat" set "UPDATE_SRC=%%D"
      if exist "%%D\\server.cjs" set "UPDATE_SRC=%%D"
    )
  )
)

echo.
echo   \u30B5\u30FC\u30D0\u30FC\u3092\u505C\u6B62\u3057\u3066\u3044\u307E\u3059...
REM Kill any running node processes for this server
taskkill /F /IM node.exe /FI "WINDOWTITLE eq LabFlow*" > nul 2>&1
timeout /t 1 /nobreak > nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING 2^>nul') do (
  taskkill /F /PID %%a > nul 2>&1
)
timeout /t 1 /nobreak > nul

echo.
echo   \u30D5\u30A1\u30A4\u30EB\u3092\u66F4\u65B0\u3057\u3066\u3044\u307E\u3059...
REM Copy new files over existing ones (preserving data/)
xcopy /E /Y "%UPDATE_SRC%\\*" "." /EXCLUDE:update_exclude.txt > nul 2>&1
if errorlevel 1 (
  xcopy /E /Y "%UPDATE_SRC%\\*" "." > nul 2>&1
)

echo.
echo   \u30C7\u30FC\u30BF\u3092\u5FA9\u5143\u3057\u3066\u3044\u307E\u3059...
if exist "data_backup" (
  xcopy /E /I /Y "data_backup" "data" > nul 2>&1
  rmdir /S /Q "data_backup" > nul 2>&1
)

echo.
echo   \u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7\u3057\u3066\u3044\u307E\u3059...
del update.zip > nul 2>&1
rmdir /S /Q "update_temp" > nul 2>&1

echo.
echo   LabFlow\u3092\u518D\u8D77\u52D5\u3057\u3066\u3044\u307E\u3059...
REM We do not start a new window because the original start.bat's auto-restart loop 
REM will automatically start the new server.cjs after its 5-second timeout!

echo.
echo   \u30A2\u30C3\u30D7\u30C7\u30FC\u30C8\u5B8C\u4E86\uFF01
timeout /t 3 > nul
del "%~f0"

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
@echo off
rem Enciende el comparador: el servidor (puerto 4000) y la app (Expo), cada uno en su ventana.
rem Para probar en el celular: instala "Expo Go", conecta el celular al mismo Wi-Fi y escanea el QR de la ventana "Comparador APP".
rem Para probar en esta PC: en la ventana "Comparador APP" presiona la tecla W (abre la app en el navegador).
cd /d "%~dp0"
start "Comparador API" cmd /k "cd /d ""%~dp0api"" && npm run dev"
start "Comparador APP" cmd /k "cd /d ""%~dp0mobile"" && npx expo start"

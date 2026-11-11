<#
.SYNOPSIS
  Despliega el Comparador en Google Cloud: Cloud Run (API + web) conectado a la instancia Cloud SQL ya creada.

.DESCRIPTION
  Idempotente: se puede correr las veces que haga falta; crea solo lo que falta y no borra nada.
  Usa el SDK de Google Cloud que ya está en esta PC (no instala nada). Requiere haber iniciado sesión antes:

      .\desplegar-gcp.ps1 -Login            # abre el navegador para autorizar gcloud con tu cuenta de Google
      .\desplegar-gcp.ps1 -SoloVerificar    # solo lee: proyecto, instancia, bases, usuarios, servicio
      .\desplegar-gcp.ps1                   # despliegue completo
      .\desplegar-gcp.ps1 -NuevaClaveDb     # además genera una clave nueva para el usuario de Postgres

  Nunca imprime contraseñas ni tokens. La clave de Postgres vive solo en Secret Manager.
#>
[CmdletBinding()]
param(
  [switch]$Login,
  [switch]$SoloVerificar,
  [switch]$NuevaClaveDb,
  [switch]$NuevaClaveJob,
  [string]$Proyecto = 'price-comparator-514101',
  [string]$Region = 'us-central1',
  [string]$Instancia = 'prices-postgres',
  [string]$BaseDatos = 'price_comparator',
  [string]$UsuarioDb = 'price_app',
  [string]$Servicio = 'precioradar',
  [string]$Secreto = 'comparador-database-url',
  [string]$SecretoJob = 'comparador-job-key',
  [string]$SecretoMeliId = 'comparador-meli-client-id',
  [string]$SecretoMeliSecret = 'comparador-meli-client-secret',
  [string]$SecretoStats = 'comparador-stats-key',
  [string]$TrabajoRefresco = 'comparador-refresco-precios',
  [string]$CuentaServicio = 'comparador-api'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = $PSScriptRoot

# ---------- gcloud: el SDK que ya está en esta PC ----------------------------------------------------------
$sdk = Join-Path $env:LOCALAPPDATA 'OeeLiveTools\google-cloud-sdk'
$gcloud = Join-Path $sdk 'bin\gcloud.cmd'
if (-not (Test-Path $gcloud)) { throw "No encuentro gcloud en $gcloud. Instala Google Cloud CLI o ajusta la ruta." }
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { throw 'gcloud necesita Python 3.9+ en el PATH.' }
$env:CLOUDSDK_PYTHON = $py
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'

function Paso([string]$t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "   ok  $t" -ForegroundColor Green }
function Nota([string]$t) { Write-Host "   ·   $t" -ForegroundColor DarkGray }

# Ejecuta gcloud. Devuelve solo stdout (datos); los avisos de stderr se muestran en gris y no detienen nada.
# PowerShell 5.1 trata cada línea de stderr de un .exe como error: por eso se baja la preferencia mientras corre.
function Invoke-Gcloud([string[]]$a, [bool]$Strict) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $raw = & $gcloud @a 2>&1 } finally { $ErrorActionPreference = $prev }
  $code = $LASTEXITCODE
  $datos = @(); $avisos = @()
  foreach ($x in @($raw)) {
    if ($x -is [System.Management.Automation.ErrorRecord]) { $avisos += $x.Exception.Message } else { $datos += "$x" }
  }
  if ($code -ne 0) {
    # Nunca repetir una contraseña en un mensaje de error.
    $visible = ($a | ForEach-Object { if ($_ -match '^(--password|--headers|--update-headers)=') { "$($Matches[1])=***" } else { $_ } }) -join ' '
    # Tampoco en el texto que devolvió gcloud (repite los argumentos cuando no los reconoce).
    $texto = (($avisos + $datos) -join "`n") -replace '(--password|--headers|--update-headers)=\S+', '$1=***'
    if ($Strict) { throw "gcloud $visible (código $code)`n$texto" }
    return $null
  }
  foreach ($w in $avisos) { if ($w -and $w -notmatch 'quota project') { Write-Host "   aviso: $w" -ForegroundColor DarkGray } }
  return $datos
}
function G { param([Parameter(ValueFromRemainingArguments = $true)][string[]]$a) Invoke-Gcloud $a $true }
# Igual que G, pero sin fallar: devuelve $null si gcloud falla (para "¿existe X?").
function GQ { param([Parameter(ValueFromRemainingArguments = $true)][string[]]$a) Invoke-Gcloud $a $false }

if ($Login) {
  Paso 'Iniciar sesión en Google Cloud (se abre el navegador)'
  & $gcloud auth login --update-adc
  & $gcloud config set project $Proyecto | Out-Null
  & $gcloud auth list
  return
}

# ---------- 0) Cuenta y proyecto ----------------------------------------------------------------------------
Paso 'Cuenta y proyecto'
$cuenta = GQ auth list --filter=status:ACTIVE --format='value(account)'
if (-not $cuenta) { throw "No hay sesión en gcloud. Corre primero:  .\desplegar-gcp.ps1 -Login" }
G config set project $Proyecto | Out-Null
Ok "cuenta $cuenta · proyecto $Proyecto"
$numero = (G projects describe $Proyecto --format='value(projectNumber)')
Nota "número de proyecto $numero"

# ---------- 1) Verificar Cloud SQL ---------------------------------------------------------------------------
Paso "Cloud SQL · instancia $Instancia"
$instJson = GQ sql instances describe $Instancia --format='json'
$inst = if ($instJson) { ($instJson -join "`n") | ConvertFrom-Json } else { $null }
if (-not $inst) {
  $detalle = Invoke-Gcloud @('sql', 'instances', 'describe', $Instancia, '--format=value(name)') $false
  $listado = Invoke-Gcloud @('sql', 'instances', 'list', '--format=value(name,region,state)') $false
  Nota "instancias visibles: $(if ($listado) { $listado -join ' | ' } else { 'ninguna o API de Cloud SQL apagada' })"
  throw "No pude leer la instancia $Instancia en $Proyecto. No se crea otra. Revisa el nombre o habilita la API sqladmin."
}
$conexion = $inst.connectionName
Ok "estado $($inst.state) · $($inst.databaseVersion) · $($inst.settings.tier) · región $($inst.region)"
Nota "nombre de conexión $conexion"
$ips = @($inst.ipAddresses | ForEach-Object { "$($_.type)" })
$redes = @($inst.settings.ipConfiguration.authorizedNetworks | Where-Object { $_ })
Nota "IPs: $($ips -join ', ') · redes autorizadas: $($redes.Count)$(if ($redes.Count -gt 0) { ' (' + (($redes | ForEach-Object { $_.value }) -join ', ') + ')' })"
$bases = @(G sql databases list --instance=$Instancia --format='value(name)')
$usuarios = @(G sql users list --instance=$Instancia --format='value(name)')
Nota "bases: $($bases -join ', ')"
Nota "usuarios: $($usuarios -join ', ')"
if ($UsuarioDb -notin $usuarios) { throw "El usuario $UsuarioDb no existe en la instancia. Créalo en la consola o avísame." }

if ($SoloVerificar) {
  Paso 'Cloud Run (solo lectura)'
  $svc = GQ run services describe $Servicio --region=$Region --format='value(status.url)'
  if ($svc) { Ok "servicio $Servicio en $svc" } else { Nota "el servicio $Servicio todavía no existe" }
  $sec = GQ secrets describe $Secreto --format='value(name)'
  if ($sec) { Ok "secreto $Secreto existe" } else { Nota "el secreto $Secreto todavía no existe" }
  $ml = GQ secrets describe $SecretoMeliId --format='value(name)'
  if ($ml) { Ok 'llaves de Mercado Libre en Secret Manager' } else { Nota 'sin llaves de Mercado Libre en Secret Manager (Mercado Libre aparece como "requiere credenciales")' }
  return
}

# ---------- 2) APIs necesarias (habilitarlas no cuesta) ----------------------------------------------------
Paso 'APIs de Google Cloud'
G services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com cloudscheduler.googleapis.com | Out-Null
Ok 'run, cloudbuild, artifactregistry, sqladmin, secretmanager, iam, cloudscheduler'

# ---------- 3) Base de datos --------------------------------------------------------------------------------
Paso "Base de datos $BaseDatos"
if ($BaseDatos -in $bases) { Ok 'ya existe' } else { G sql databases create $BaseDatos --instance=$Instancia | Out-Null; Ok 'creada' }

# ---------- 4) Clave del usuario y Secret Manager ---------------------------------------------------------
Paso "Secreto $Secreto (DATABASE_URL)"
$secretoExiste = [bool](GQ secrets describe $Secreto --format='value(name)')
if (-not $secretoExiste -or $NuevaClaveDb) {
  # Clave nueva, fuerte, generada aquí; se pone en Postgres y en el secreto. Nunca se imprime.
  # 32 caracteres al azar con, garantizado, minúscula, mayúscula, número y símbolo (lo exige la instancia).
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  function Azar([string]$alfabeto, [int]$n) {
    $b = New-Object byte[] $n; $rng.GetBytes($b)
    -join (0..($n - 1) | ForEach-Object { $alfabeto[[int]$b[$_] % $alfabeto.Length] })
  }
  $simbolos = '-_.~!*'
  $todo = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + $simbolos
  $partes = @((Azar 'abcdefghijklmnopqrstuvwxyz' 1), (Azar 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 1), (Azar '0123456789' 1), (Azar $simbolos 1), (Azar $todo 28))
  $mezcla = New-Object byte[] 64; $rng.GetBytes($mezcla)
  $i = 0
  $clave = -join (($partes -join '').ToCharArray() | Sort-Object { $mezcla[($script:i++) % 64] })
  G sql users set-password $UsuarioDb --instance=$Instancia --password=$clave | Out-Null
  Ok "clave de $UsuarioDb actualizada en Cloud SQL"
  $url = "postgres://$UsuarioDb`:$([uri]::EscapeDataString($clave))@localhost/$BaseDatos`?host=/cloudsql/$conexion"
  $tmp = Join-Path $env:TEMP ("comparador-secret-" + [guid]::NewGuid().ToString('n'))
  try {
    [IO.File]::WriteAllText($tmp, $url)
    if ($secretoExiste) { G secrets versions add $Secreto --data-file=$tmp | Out-Null; Ok 'nueva versión del secreto' }
    else { G secrets create $Secreto --replication-policy=automatic --data-file=$tmp | Out-Null; Ok 'secreto creado' }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    $clave = $null; $url = $null
  }
} else {
  Ok 'ya existe; se conserva la clave actual (usa -NuevaClaveDb para rotarla)'
}

# ---------- 4b) Clave del refresco programado (la trae Cloud Scheduler en X-Job-Key) --------------------
Paso "Secreto $SecretoJob (JOB_KEY)"
$jobSecretoExiste = [bool](GQ secrets describe $SecretoJob --format='value(name)')
if ($jobSecretoExiste -and -not $NuevaClaveJob) { Ok 'ya existe (usa -NuevaClaveJob para rotarla)' }
else {
  $b = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $jobKey = ([Convert]::ToBase64String($b)) -replace '[^A-Za-z0-9]', 'k'
  $tmp = Join-Path $env:TEMP ("comparador-jobkey-" + [guid]::NewGuid().ToString('n'))
  try {
    [IO.File]::WriteAllText($tmp, $jobKey)
    if ($jobSecretoExiste) { G secrets versions add $SecretoJob --data-file=$tmp | Out-Null; Ok 'clave rotada (nueva versión del secreto)' }
    else { G secrets create $SecretoJob --replication-policy=automatic --data-file=$tmp | Out-Null; Ok 'secreto creado' }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    $jobKey = $null
  }
}

# ---------- 4c) Llaves de Mercado Libre: de api\.env a Secret Manager (el archivo nunca sale de esta PC) -----
Paso 'Secretos de Mercado Libre (MELI_CLIENT_ID / MELI_CLIENT_SECRET)'
function Leer-Env([string]$ruta, [string]$clave) {
  if (-not (Test-Path $ruta)) { return $null }
  foreach ($linea in Get-Content $ruta) {
    if ($linea -match "^\s*$clave\s*=\s*(.*?)\s*$") {
      $v = $Matches[1].Trim('"').Trim("'")
      if ($v) { return $v }
    }
  }
  return $null
}
# Sube el valor local al secreto solo si cambió, para no acumular versiones. Nunca lo imprime.
function Sincronizar-Secreto([string]$nombre, [string]$valor) {
  $existe = [bool](GQ secrets describe $nombre --format='value(name)')
  if ($existe) {
    $actual = (GQ secrets versions access latest --secret=$nombre) -join ''
    if ($actual -eq $valor) { Ok "$nombre sin cambios"; return }
  }
  $tmp = Join-Path $env:TEMP ("comparador-meli-" + [guid]::NewGuid().ToString('n'))
  try {
    [IO.File]::WriteAllText($tmp, $valor)
    if ($existe) { G secrets versions add $nombre --data-file=$tmp | Out-Null; Ok "$nombre actualizado (nueva versión)" }
    else { G secrets create $nombre --replication-policy=automatic --data-file=$tmp | Out-Null; Ok "$nombre creado" }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}
$envApi = Join-Path $raiz 'api\.env'
$meliId = Leer-Env $envApi 'MELI_CLIENT_ID'
$meliSecret = Leer-Env $envApi 'MELI_CLIENT_SECRET'
if ($meliId -and $meliSecret) {
  Sincronizar-Secreto $SecretoMeliId $meliId
  Sincronizar-Secreto $SecretoMeliSecret $meliSecret
} elseif ($meliId -or $meliSecret) {
  throw 'En api\.env falta una de las dos llaves de Mercado Libre (MELI_CLIENT_ID y MELI_CLIENT_SECRET van juntas).'
} else {
  Nota 'api\.env no tiene llaves de Mercado Libre; se conservan las que ya estén en Secret Manager, si las hay'
}
$meliId = $null; $meliSecret = $null
$meliListo = [bool](GQ secrets describe $SecretoMeliId --format='value(name)') -and [bool](GQ secrets describe $SecretoMeliSecret --format='value(name)')
if ($meliListo) { Ok 'Mercado Libre quedará conectado en Cloud Run' } else { Nota 'Mercado Libre seguirá como "requiere credenciales"' }

# ---------- 4d) Llave del reporte privado de uso (/estadisticas): de api\.env a Secret Manager ------------------
Paso "Secreto $SecretoStats (STATS_KEY)"
$statsKey = Leer-Env $envApi 'STATS_KEY'
if ($statsKey) { Sincronizar-Secreto $SecretoStats $statsKey } else { Nota 'api\.env no tiene STATS_KEY; se conserva la que ya esté en Secret Manager, si la hay' }
$statsKey = $null
$statsListo = [bool](GQ secrets describe $SecretoStats --format='value(name)')
if ($statsListo) { Ok 'el reporte de uso quedará encendido' } else { Nota 'sin STATS_KEY: el reporte de uso quedará apagado' }

# ---------- 5) Cuenta de servicio con permisos mínimos --------------------------------------------------
Paso "Cuenta de servicio $CuentaServicio"
$saEmail = "$CuentaServicio@$Proyecto.iam.gserviceaccount.com"
if (GQ iam service-accounts describe $saEmail --format='value(email)') { Ok 'ya existe' }
else { G iam service-accounts create $CuentaServicio --display-name='Comparador API (Cloud Run)' | Out-Null; Ok 'creada' }
# Solo puede conectarse a Cloud SQL y leer ESTE secreto. Nada más.
G projects add-iam-policy-binding $Proyecto --member="serviceAccount:$saEmail" --role='roles/cloudsql.client' --condition=None | Out-Null
G secrets add-iam-policy-binding $Secreto --member="serviceAccount:$saEmail" --role='roles/secretmanager.secretAccessor' | Out-Null
G secrets add-iam-policy-binding $SecretoJob --member="serviceAccount:$saEmail" --role='roles/secretmanager.secretAccessor' | Out-Null
if ($meliListo) {
  G secrets add-iam-policy-binding $SecretoMeliId --member="serviceAccount:$saEmail" --role='roles/secretmanager.secretAccessor' | Out-Null
  G secrets add-iam-policy-binding $SecretoMeliSecret --member="serviceAccount:$saEmail" --role='roles/secretmanager.secretAccessor' | Out-Null
}
if ($statsListo) {
  G secrets add-iam-policy-binding $SecretoStats --member="serviceAccount:$saEmail" --role='roles/secretmanager.secretAccessor' | Out-Null
}
Ok "roles/cloudsql.client (proyecto) + roles/secretmanager.secretAccessor (solo sus secretos$(if ($meliListo) { ', incluidos los de Mercado Libre' }))"

# Cloud Build usa la cuenta de cómputo por omisión: necesita escribir en Artifact Registry y registrar logs.
$computeSa = "$numero-compute@developer.gserviceaccount.com"
foreach ($rol in 'roles/artifactregistry.writer', 'roles/logging.logWriter', 'roles/storage.objectViewer') {
  G projects add-iam-policy-binding $Proyecto --member="serviceAccount:$computeSa" --role=$rol --condition=None | Out-Null
}
Ok "permisos de construcción para $computeSa"

# ---------- 6) Construir y desplegar en Cloud Run -----------------------------------------------------------
Paso "Cloud Run · $Servicio en $Region (construcción con Cloud Build desde el código fuente)"
Nota 'esto tarda unos minutos la primera vez'
$montajes = "DATABASE_URL=${Secreto}:latest,JOB_KEY=${SecretoJob}:latest"
if ($meliListo) { $montajes += ",MELI_CLIENT_ID=${SecretoMeliId}:latest,MELI_CLIENT_SECRET=${SecretoMeliSecret}:latest" }
if ($statsListo) { $montajes += ",STATS_KEY=${SecretoStats}:latest" }
G run deploy $Servicio `
  --source=$raiz `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --service-account=$saEmail `
  --add-cloudsql-instances=$conexion `
  --set-secrets=$montajes `
  --set-env-vars='TRUST_PROXY=1,LOG_LEVEL=info,STORE_TIMEOUT_MS=15000,BROWSER_CONCURRENCY=2,REFRESH_MAX_TERMS=100' `
  --port=8080 `
  --memory=2Gi `
  --cpu=2 `
  --min-instances=0 `
  --max-instances=4 `
  --concurrency=40 `
  --timeout=300 `
  --quiet | Out-Null
$urlServicio = (G run services describe $Servicio --region=$Region --format='value(status.url)')
Ok "desplegado en $urlServicio"

# ---------- 6b) Refresco diario de precios (Cloud Scheduler, 3 trabajos gratis al mes) --------------------
Paso "Cloud Scheduler · $TrabajoRefresco (todos los días a las 6:00, hora de México)"
$claveJob = (G secrets versions access latest --secret=$SecretoJob) -join ''
$argsJob = @(
  "--location=$Region",
  '--schedule=0 6 * * *',
  '--time-zone=America/Mexico_City',
  "--uri=$urlServicio/api/jobs/refresh-prices?country=MX",
  '--http-method=POST',
  '--attempt-deadline=300s',
  '--description=PrecioRadar: vuelve a consultar las busquedas mas repetidas para que el historial de precios crezca a diario'
)
# Al crear, la cabecera va con --headers; al actualizar, gcloud la pide como --update-headers.
if (GQ scheduler jobs describe $TrabajoRefresco --location=$Region --format='value(name)') {
  G scheduler jobs update http $TrabajoRefresco @argsJob "--update-headers=X-Job-Key=$claveJob" | Out-Null
  Ok 'trabajo actualizado'
} else {
  G scheduler jobs create http $TrabajoRefresco @argsJob "--headers=X-Job-Key=$claveJob" | Out-Null
  Ok 'trabajo creado'
}
$claveJob = $null

# ---------- 7) Verificar ------------------------------------------------------------------------------------
Paso 'Verificación'
$health = Invoke-RestMethod -Uri "$urlServicio/api/health" -TimeoutSec 60
Ok "api/health → version $($health.version) · tiendas activas $($health.activeStores)"
try {
  $paginaWeb = Invoke-WebRequest -UseBasicParsing -Uri $urlServicio -Headers @{ Accept = 'text/html' } -TimeoutSec 60
  Ok "web → HTTP $($paginaWeb.StatusCode), $($paginaWeb.Content.Length) bytes"
} catch { Nota "web: $($_.Exception.Message)" }
$busq = Invoke-RestMethod -Uri "$urlServicio/api/search?q=iphone%2015" -TimeoutSec 90
Ok "búsqueda 'iphone 15' → $($busq.totalOffers) precios en $($busq.groups.Count) productos, $($busq.tookMs) ms"
foreach ($t in $busq.stores) { Nota ("{0,-14} {1,-22} {2,3} precios" -f $t.storeName, $t.status, $t.count) }
$ml = $busq.stores | Where-Object { $_.storeId -eq 'mercadolibre' } | Select-Object -First 1
if ($ml) {
  if ($ml.status -eq 'ok') { Ok "Mercado Libre contestó con $($ml.count) precios" }
  else { Nota "Mercado Libre: $($ml.status)$(if ($ml.message) { ' · ' + $ml.message })" }
}
try {
  $cov = Invoke-RestMethod -Uri "$urlServicio/api/history/coverage?country=MX" -TimeoutSec 60
  Ok "historial → $($cov.snapshots) precios guardados de $($cov.items) productos, desde $($cov.since)"
} catch { Nota "historial: $($_.Exception.Message)" }
Start-Sleep -Seconds 5
$logs = G run services logs read $Servicio --region=$Region --limit=80
$pg = $logs | Select-String -Pattern 'memoria:' | Select-Object -Last 3
if ($pg) { $pg | ForEach-Object { Nota $_.Line.Trim() } } else { Nota 'sin mensaje de Postgres en los últimos logs todavía' }

Paso 'Resumen'
Write-Host "   Web y API:   $urlServicio"
Write-Host "   Postgres:    $conexion · base $BaseDatos · usuario $UsuarioDb · secreto $Secreto"
Write-Host "   Cloud Run:   servicio $Servicio · cuenta $saEmail · 0 a 2 copias · 512 MiB"

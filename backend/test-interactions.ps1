###############################################################################
# test-interactions.ps1 -- Full interaction logging test suite (Phase 3)
#
# Usage:  .\test-interactions.ps1
#
# The script calls get-test-token.js (Firebase Admin SDK) to obtain a valid
# Firebase ID token automatically -- no manual copy/paste needed.
#
# Tests covered:
#   STEP 0  Get Firebase ID token
#   STEP 1  POST /api/interactions  (view)
#   STEP 2  POST /api/interactions  (click)
#   STEP 3  POST /api/interactions  (save)  with optional metadata
#   STEP 4  POST /api/interactions  (dismiss)
#   STEP 5  GET  /api/interactions  (list — should contain 4 records)
#   STEP 6  POST /api/interactions  — invalid actionType  (expect 400)
#   STEP 7  POST /api/interactions  — missing placeId    (expect 400)
#   STEP 8  POST /api/interactions  — missing actionType (expect 400)
#   STEP 9  GET  /api/interactions  — no token           (expect 401)
###############################################################################

param([string]$BaseUrl = "http://localhost:5000/api")

function Print-Step([string]$msg) {
    Write-Host ""
    Write-Host "--------------------------------------------" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "--------------------------------------------" -ForegroundColor Cyan
}
function Print-Pass([string]$msg) { Write-Host "  [PASS]  $msg" -ForegroundColor Green }
function Print-Fail([string]$msg) { Write-Host "  [FAIL]  $msg" -ForegroundColor Red }
function Print-Info([string]$msg) { Write-Host "  [INFO]  $msg" -ForegroundColor Yellow }

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers,
        [object]$Body
    )
    $uri = "$BaseUrl$Path"
    try {
        $params = @{
            Uri         = $uri
            Method      = $Method
            Headers     = $Headers
            ContentType = "application/json"
        }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5) }
        $response = Invoke-RestMethod @params
        return @{ ok = $true; data = $response }
    } catch {
        $raw = $_.ErrorDetails.Message
        if ($raw) {
            try   { return @{ ok = $false; data = ($raw | ConvertFrom-Json) } }
            catch { return @{ ok = $false; data = $raw } }
        }
        return @{ ok = $false; data = $_.Exception.Message }
    }
}

# ---- STEP 0 : Get ID token via Firebase Admin SDK ---------------------------

Print-Step "STEP 0 -- Getting Firebase ID token (Admin SDK)"

$scriptDir   = $PSScriptRoot
$tokenOutput = node "$scriptDir\get-test-token.js" 2>&1

$lines   = $tokenOutput -split "`n"
$inToken = $false
$token   = ""
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "--- COPY THIS TOKEN ---") { $inToken = $true; continue }
    if ($trimmed -eq "--- END TOKEN ---")        { $inToken = $false; continue }
    if ($inToken -and $trimmed -ne "")           { $token = $trimmed }
}

$userLine = $lines | Where-Object { $_ -match "^Using user:" } | Select-Object -First 1
if ($userLine) { Print-Info $userLine.Trim() }

if (-not $token) {
    Print-Fail "Could not get ID token. Output was:"
    Write-Host $tokenOutput -ForegroundColor Red
    exit 1
}
Print-Pass "Got ID token (length: $($token.Length) chars)"

$authHeaders = @{ Authorization = "Bearer $token" }

# ---- STEP 1 : Log a "view" interaction ---------------------------------------

Print-Step "STEP 1 -- POST /api/interactions (actionType: view)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId    = "place_abc_001"
    actionType = "view"
}

if ($res.ok -and $res.data.success) {
    Print-Pass "view interaction logged"
    Print-Info "id         : $($res.data.data.id)"
    Print-Info "actionType : $($res.data.data.actionType)"
    Print-Info "score      : $($res.data.data.score)  (expected 1)"
    Print-Info "createdAt  : $($res.data.data.createdAt)"
} else {
    Print-Fail "Failed to log view interaction:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

# ---- STEP 2 : Log a "click" interaction -------------------------------------

Print-Step "STEP 2 -- POST /api/interactions (actionType: click)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId    = "place_abc_001"
    actionType = "click"
}

if ($res.ok -and $res.data.success) {
    Print-Pass "click interaction logged"
    Print-Info "score : $($res.data.data.score)  (expected 2)"
} else {
    Print-Fail "Failed to log click interaction:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 3 : Log a "save" interaction with optional metadata ----------------

Print-Step "STEP 3 -- POST /api/interactions (actionType: save, with metadata)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId    = "place_xyz_999"
    actionType = "save"
    metadata   = @{ source = "search_results"; position = 3 }
}

if ($res.ok -and $res.data.success) {
    Print-Pass "save interaction logged (with metadata)"
    Print-Info "score    : $($res.data.data.score)  (expected 3)"
    Print-Info "metadata : $($res.data.data.metadata | ConvertTo-Json -Compress)"
} else {
    Print-Fail "Failed to log save interaction:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 4 : Log a "dismiss" interaction ------------------------------------

Print-Step "STEP 4 -- POST /api/interactions (actionType: dismiss)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId    = "place_abc_001"
    actionType = "dismiss"
}

if ($res.ok -and $res.data.success) {
    Print-Pass "dismiss interaction logged"
    Print-Info "score : $($res.data.data.score)  (expected -1)"
} else {
    Print-Fail "Failed to log dismiss interaction:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 5 : GET /api/interactions -- list ---------------------------------

Print-Step "STEP 5 -- GET /api/interactions (list, expect >= 4 records)"

$res = Invoke-Api -Method GET -Path "/interactions" -Headers $authHeaders

if ($res.ok -and $res.data.success) {
    $count = $res.data.data.Count
    Print-Pass "Got $count interaction(s)"
    Print-Info "message : $($res.data.message)"
    if ($count -ge 4) {
        Print-Pass "Count is >= 4 as expected"
    } else {
        Print-Fail "Expected at least 4 records, got $count"
    }
} else {
    Print-Fail "List failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 6 : Validation -- invalid actionType (expect 400) -----------------

Print-Step "STEP 6 -- Validation: invalid actionType (expect 400)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId    = "place_abc_001"
    actionType = "like"   # not a valid value
}

if (-not $res.ok -and ($res.data.success -eq $false)) {
    Print-Pass "Invalid actionType correctly rejected (400)"
    Print-Info "message : $($res.data.message)"
} else {
    Print-Fail "ERROR -- invalid actionType was NOT rejected!"
}

# ---- STEP 7 : Validation -- missing placeId (expect 400) --------------------

Print-Step "STEP 7 -- Validation: missing placeId (expect 400)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    actionType = "view"
}

if (-not $res.ok -and ($res.data.success -eq $false)) {
    Print-Pass "Missing placeId correctly rejected (400)"
    Print-Info "message : $($res.data.message)"
} else {
    Print-Fail "ERROR -- missing placeId was NOT rejected!"
}

# ---- STEP 8 : Validation -- missing actionType (expect 400) -----------------

Print-Step "STEP 8 -- Validation: missing actionType (expect 400)"

$res = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body @{
    placeId = "place_abc_001"
}

if (-not $res.ok -and ($res.data.success -eq $false)) {
    Print-Pass "Missing actionType correctly rejected (400)"
    Print-Info "message : $($res.data.message)"
} else {
    Print-Fail "ERROR -- missing actionType was NOT rejected!"
}

# ---- STEP 9 : Auth check -- no token (expect 401) ---------------------------

Print-Step "STEP 9 -- Auth check: no token on GET (expect 401)"

$res = Invoke-Api -Method GET -Path "/interactions" -Headers @{}

if (-not $res.ok) {
    Print-Pass "Unauthenticated request correctly rejected (401)"
    Print-Info "$($res.data.message)"
} else {
    Print-Fail "ERROR -- unauthenticated request was NOT rejected!"
}

# ---- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  All 9 interaction tests completed." -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

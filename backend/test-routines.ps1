###############################################################################
# test-routines.ps1 -- Full routine CRUD test suite
#
# Usage:  .\test-routines.ps1
#
# The script calls get-test-token.js (Firebase Admin SDK) to get a valid
# ID token automatically -- no manual email/password needed.
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

$scriptDir = $PSScriptRoot
$tokenOutput = node "$scriptDir\get-test-token.js" 2>&1

# Extract the token from between the marker lines
$lines    = $tokenOutput -split "`n"
$inToken  = $false
$token    = ""
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "--- COPY THIS TOKEN ---") { $inToken = $true; continue }
    if ($trimmed -eq "--- END TOKEN ---")        { $inToken = $false; continue }
    if ($inToken -and $trimmed -ne "")           { $token = $trimmed }
}

# Also print which user was picked
$userLine = $lines | Where-Object { $_ -match "^Using user:" } | Select-Object -First 1
if ($userLine) { Print-Info $userLine.Trim() }

if (-not $token) {
    Print-Fail "Could not get ID token. Output was:"
    Write-Host $tokenOutput -ForegroundColor Red
    exit 1
}
Print-Pass "Got ID token (length: $($token.Length) chars)"

$authHeaders = @{ Authorization = "Bearer $token" }

# ---- STEP 1 : POST /api/routines -- create ----------------------------------

Print-Step "STEP 1 -- POST /api/routines (create)"

$createBody = @{
    weekday            = "Monday"
    timeOfDay          = "morning"
    activityType       = "gym"
    locationPreference = "indoor"
    budgetRange        = "low"
}

$res = Invoke-Api -Method POST -Path "/routines" -Headers $authHeaders -Body $createBody

if ($res.ok -and $res.data.success) {
    Print-Pass "Routine created"
    $routineId = $res.data.data.id
    Print-Info "id             : $routineId"
    Print-Info "userId         : $($res.data.data.userId)"
    Print-Info "weekday        : $($res.data.data.weekday)"
    Print-Info "activityType   : $($res.data.data.activityType)"
    Print-Info "budgetRange    : $($res.data.data.budgetRange)"
    Print-Info "createdAt      : $($res.data.data.createdAt)"
} else {
    Print-Fail "Create failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

# ---- STEP 2 : GET /api/routines -- list all ---------------------------------

Print-Step "STEP 2 -- GET /api/routines (list all)"

$res = Invoke-Api -Method GET -Path "/routines" -Headers $authHeaders

if ($res.ok -and $res.data.success) {
    $count = $res.data.data.Count
    Print-Pass "Got $count routine(s)"
    Print-Info "message: $($res.data.message)"
} else {
    Print-Fail "List failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 3 : GET /api/routines/:id -- get one ------------------------------

Print-Step "STEP 3 -- GET /api/routines/$routineId (get one)"

$res = Invoke-Api -Method GET -Path "/routines/$routineId" -Headers $authHeaders

if ($res.ok -and $res.data.success) {
    Print-Pass "Got single routine"
    Print-Info "activityType : $($res.data.data.activityType)"
    Print-Info "timeOfDay    : $($res.data.data.timeOfDay)"
} else {
    Print-Fail "Get-one failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 4 : PUT /api/routines/:id -- update -------------------------------

Print-Step "STEP 4 -- PUT /api/routines/$routineId (update)"

$updateBody = @{
    weekday      = "Wednesday"
    activityType = "yoga"
}

$res = Invoke-Api -Method PUT -Path "/routines/$routineId" -Headers $authHeaders -Body $updateBody

if ($res.ok -and $res.data.success) {
    Print-Pass "Routine updated"
    Print-Info "weekday      : $($res.data.data.weekday)  (was Monday)"
    Print-Info "activityType : $($res.data.data.activityType)  (was gym)"
    Print-Info "updatedAt    : $($res.data.data.updatedAt)"
} else {
    Print-Fail "Update failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 5 : DELETE /api/routines/:id --------------------------------------

Print-Step "STEP 5 -- DELETE /api/routines/$routineId (delete)"

$res = Invoke-Api -Method DELETE -Path "/routines/$routineId" -Headers $authHeaders

if ($res.ok -and $res.data.success) {
    Print-Pass "Routine deleted"
    Print-Info "message: $($res.data.message)"
} else {
    Print-Fail "Delete failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
}

# ---- STEP 6 : Confirm 404 on deleted routine --------------------------------

Print-Step "STEP 6 -- Confirm 404 on deleted routine"

$res = Invoke-Api -Method GET -Path "/routines/$routineId" -Headers $authHeaders

if (-not $res.ok) {
    Print-Pass "Correctly returned error for deleted routine"
    Print-Info "message: $($res.data.message)"
} else {
    Print-Fail "ERROR -- deleted routine still returned data!"
}

# ---- STEP 7 : Validation -- missing required fields -------------------------

Print-Step "STEP 7 -- Validation (missing required fields, expect 400)"

$badBody = @{ weekday = "Friday" }   # missing timeOfDay, activityType, locationPreference, budgetRange

$res = Invoke-Api -Method POST -Path "/routines" -Headers $authHeaders -Body $badBody

if (-not $res.ok -and ($res.data.success -eq $false)) {
    Print-Pass "Validation correctly rejected incomplete body"
    Print-Info "message: $($res.data.message)"
} else {
    Print-Fail "Validation did NOT catch missing fields"
}

# ---- STEP 8 : Auth check -- no token (expect 401) ---------------------------

Print-Step "STEP 8 -- Auth check (no token, expect 401)"

$res = Invoke-Api -Method GET -Path "/routines" -Headers @{}

if (-not $res.ok) {
    Print-Pass "Unauthenticated request correctly rejected"
    Print-Info "$($res.data.message)"
} else {
    Print-Fail "ERROR -- unauthenticated request was NOT rejected!"
}

# ---- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  All 8 routine tests completed." -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

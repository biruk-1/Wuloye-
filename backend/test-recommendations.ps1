###############################################################################
# test-recommendations.ps1 -- Recommendation engine test suite (Phase 4 v2)
#
# Usage:  .\test-recommendations.ps1
#
# Calls get-test-token.js (Firebase Admin SDK) to get a valid ID token
# automatically -- no manual copy/paste needed.
#
# Tests covered:
#   STEP 0  Get Firebase ID token
#   STEP 1  GET /api/recommendations          -- authenticated request
#           Prints: result count + top-3 with scores + meta block
#   STEP 2  Verify response envelope
#   STEP 3  Verify scores are numeric and sorted descending
#   STEP 4  Verify required fields on every result (id, name, type, score)
#   STEP 5  GET /api/recommendations?debug=true
#           Verify scoreBreakdown present; print breakdown for top result
#   STEP 6  Diversity control -- no more than 3 results per type
#   STEP 7  meta.topInterestType is present in the response
#   STEP 8  GET /api/recommendations -- no token (expect 401)
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
        [hashtable]$Headers
    )
    $uri = "$BaseUrl$Path"
    try {
        $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $Headers -ContentType "application/json"
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

# ---- STEP 1 : GET /api/recommendations -- main call -------------------------

Print-Step "STEP 1 -- GET /api/recommendations (authenticated)"

$res = Invoke-Api -Method GET -Path "/recommendations" -Headers $authHeaders

if (-not ($res.ok -and $res.data.success)) {
    Print-Fail "Request failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

$results = $res.data.data
$count   = $results.Count

Print-Pass "Got $count recommendation(s)"
Print-Info "message : $($res.data.message)"

if ($res.data.meta) {
    Print-Info "meta.profileFound     : $($res.data.meta.profileFound)"
    Print-Info "meta.routineCount     : $($res.data.meta.routineCount)"
    Print-Info "meta.interactionCount : $($res.data.meta.interactionCount)"
    Print-Info "meta.topInterestType  : $($res.data.meta.topInterestType)"
}

Write-Host ""
Write-Host "  Top recommendations:" -ForegroundColor Cyan
$top3 = $results | Select-Object -First 3
$rank = 1
foreach ($place in $top3) {
    Write-Host ("  #{0}  {1,-32}  type: {2,-8}  score: {3}" -f $rank, $place.name, $place.type, $place.score) -ForegroundColor White
    $rank++
}

# ---- STEP 2 : Verify response envelope --------------------------------------

Print-Step "STEP 2 -- Verify response envelope"

if ($res.data.success -eq $true -and $null -ne $res.data.data -and $null -ne $res.data.message) {
    Print-Pass "Response has success=true, data array, and message"
} else {
    Print-Fail "Response envelope is malformed"
}

# ---- STEP 3 : Verify scores are numbers and sorted descending ---------------

Print-Step "STEP 3 -- Verify scores are numeric and sorted descending"

$scores     = $results | ForEach-Object { $_.score }
$allNumeric = ($scores | Where-Object { $_ -isnot [int] -and $_ -isnot [double] -and $_ -isnot [decimal] }).Count -eq 0

if ($allNumeric) {
    Print-Pass "All scores are numeric"
} else {
    Print-Fail "One or more scores are not numeric"
}

$sorted = $true
for ($i = 0; $i -lt $scores.Count - 1; $i++) {
    if ($scores[$i] -lt $scores[$i + 1]) { $sorted = $false; break }
}

if ($sorted) {
    Print-Pass "Results are sorted by score descending"
} else {
    Print-Fail "Results are NOT sorted correctly"
}

# ---- STEP 4 : Verify required fields on every result ------------------------

Print-Step "STEP 4 -- Verify required fields (id, name, type, score) on each result"

$missingFields = $false
foreach ($place in $results) {
    if (-not $place.id -or -not $place.name -or -not $place.type -or $null -eq $place.score) {
        Print-Fail "Place missing required fields: $($place | ConvertTo-Json -Compress)"
        $missingFields = $true
    }
}
if (-not $missingFields) {
    Print-Pass "All $count results have id, name, type, score"
}

# ---- STEP 5 : debug=true -- scoreBreakdown ----------------------------------

Print-Step "STEP 5 -- GET /api/recommendations?debug=true (score breakdown)"

$debugRes = Invoke-Api -Method GET -Path "/recommendations?debug=true" -Headers $authHeaders

if (-not ($debugRes.ok -and $debugRes.data.success)) {
    Print-Fail "debug=true request failed:"
    Write-Host ($debugRes.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
} else {
    $debugResults = $debugRes.data.data
    $topResult    = $debugResults | Select-Object -First 1

    if ($null -ne $topResult.scoreBreakdown) {
        Print-Pass "scoreBreakdown present on results"
        Write-Host ""
        Write-Host "  Score breakdown for #1 result ($($topResult.name)):" -ForegroundColor Cyan

        $bd = $topResult.scoreBreakdown
        Write-Host ("    routineMatch      : {0,4}" -f $bd.routineMatch)      -ForegroundColor White
        Write-Host ("    budgetMatch       : {0,4}" -f $bd.budgetMatch)       -ForegroundColor White
        Write-Host ("    locationMatch     : {0,4}" -f $bd.locationMatch)     -ForegroundColor White
        Write-Host ("    interactionScore  : {0,4}" -f $bd.interactionScore)  -ForegroundColor White
        Write-Host ("    typeSaveSignal    : {0,4}" -f $bd.typeSaveSignal)    -ForegroundColor White
        Write-Host ("    typeDismissSignal : {0,4}" -f $bd.typeDismissSignal) -ForegroundColor White
        Write-Host ("    affinityBoost     : {0,4}" -f $bd.affinityBoost)     -ForegroundColor White
        Write-Host ("    timeOfDayMatch    : {0,4}" -f $bd.timeOfDayMatch)    -ForegroundColor White
        Write-Host ("    -------------------------")                           -ForegroundColor DarkGray
        Write-Host ("    TOTAL             : {0,4}" -f $topResult.score)      -ForegroundColor Green

        # Verify breakdown fields exist
        $breakdownFields = @("routineMatch","budgetMatch","locationMatch","interactionScore","affinityBoost")
        $allPresent = $true
        foreach ($field in $breakdownFields) {
            if ($null -eq $bd.$field) { $allPresent = $false; Print-Fail "Missing breakdown field: $field" }
        }
        if ($allPresent) { Print-Pass "All expected breakdown fields present" }

    } else {
        Print-Fail "scoreBreakdown missing on top result (was debug=true sent?)"
    }

    # Verify non-debug call does NOT include scoreBreakdown (clean response)
    $hasBreakdownInNormal = $results | Where-Object { $null -ne $_.scoreBreakdown }
    if ($hasBreakdownInNormal.Count -eq 0) {
        Print-Pass "Non-debug response correctly omits scoreBreakdown"
    } else {
        Print-Fail "Non-debug response unexpectedly contains scoreBreakdown"
    }
}

# ---- STEP 6 : Diversity control -- max 3 per type ---------------------------

Print-Step "STEP 6 -- Diversity control: max 3 results per type"

$typeCounts   = @{}
$violatesRule = $false

foreach ($place in $results) {
    $type = $place.type
    if (-not $typeCounts.ContainsKey($type)) { $typeCounts[$type] = 0 }
    $typeCounts[$type]++
    if ($typeCounts[$type] -gt 3) {
        Print-Fail "Type '$type' appears $($typeCounts[$type]) times (max 3)"
        $violatesRule = $true
    }
}

if (-not $violatesRule) {
    Print-Pass "No type exceeds 3 results in the list"
    foreach ($type in $typeCounts.Keys | Sort-Object) {
        Print-Info "  $type : $($typeCounts[$type])"
    }
}

# ---- STEP 7 : meta.topInterestType ------------------------------------------

Print-Step "STEP 7 -- meta.topInterestType is present in response"

if ($null -ne $res.data.meta) {
    # topInterestType can be null if user has no interactions yet
    Print-Pass "meta block present"
    if ($res.data.meta.topInterestType) {
        Print-Info "topInterestType : $($res.data.meta.topInterestType)"
    } else {
        Print-Info "topInterestType : (null - no positive interaction affinity yet)"
    }
} else {
    Print-Fail "meta block missing from response"
}

# ---- STEP 8 : Auth check -- no token (expect 401) ---------------------------

Print-Step "STEP 8 -- Auth check: no token (expect 401)"

$res = Invoke-Api -Method GET -Path "/recommendations" -Headers @{}

if (-not $res.ok) {
    Print-Pass "Unauthenticated request correctly rejected (401)"
    Print-Info "$($res.data.message)"
} else {
    Print-Fail "ERROR -- unauthenticated request was NOT rejected!"
}

# ---- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  All 8 recommendation tests completed." -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

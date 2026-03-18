###############################################################################
# test-places.ps1 -- Automated validation for the Places System
#
# Usage (from backend root):  .\scripts\test-places.ps1
#
# Ensures places are correctly stored, validated, and consumed by the
# recommendation engine. Does not modify existing logic; isolated from
# test-system.ps1 and other integration tests.
#
# Steps:
#   STEP 1  Fetch all places (GET /api/dev/places), expect >= 20, required fields
#   STEP 2  Validate all types are in allowed enum
#   STEP 3  Validate all ratings 1-5
#   STEP 4  Validate diversity (gyms, coffee, social, outdoor)
#   STEP 5  Recommendation dependency: returned place IDs exist in places
###############################################################################

param([string]$BaseUrl = "http://localhost:5000/api")

# Backend root (parent of scripts/) for get-test-token.js
$scriptsDir   = $PSScriptRoot
$backendRoot  = Split-Path -Parent $scriptsDir

function Print-Step([string]$msg) {
    Write-Host ""
    Write-Host "--------------------------------------------" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "--------------------------------------------" -ForegroundColor Cyan
}
function Print-Pass([string]$msg) { Write-Host "  [PASS]  $msg" -ForegroundColor Green }
function Print-Fail([string]$msg) { Write-Host "  [FAIL]  $msg" -ForegroundColor Red }
function Print-Info([string]$msg) { Write-Host "  [INFO]  $msg" -ForegroundColor Yellow }

$script:failCount = 0
function Record-Fail([string]$msg) {
    Print-Fail $msg
    $script:failCount++
}

# ─── STEP 1: Fetch all places ────────────────────────────────────────────────

Print-Step "STEP 1 -- Fetch all places (GET /api/dev/places)"

$placesUri = "$BaseUrl/dev/places"
try {
    $placesResponse = Invoke-RestMethod -Uri $placesUri -Method GET -ContentType "application/json"
} catch {
    Record-Fail "Request failed: $($_.Exception.Message). Is the server running (npm run dev)?"
    Write-Host ""
    Write-Host "Places system test FAILED (could not reach API)." -ForegroundColor Red
    exit 1
}

if (-not $placesResponse.success) {
    Record-Fail "API returned success=false"
    $allPlaces = @()
} else {
    $allPlaces = @($placesResponse.data)
    $count     = $allPlaces.Count

    if ($count -ge 20) {
        Print-Pass "At least 20 places returned ($count)"
    } else {
        Record-Fail "Expected at least 20 places, got $count"
    }

    $missing = @()
    foreach ($p in $allPlaces) {
        if (-not $p.id)            { $missing += "id" }
        if (-not $p.name)          { $missing += "name" }
        if ($null -eq $p.type)     { $missing += "type" }
        if ($null -eq $p.priceRange) { $missing += "priceRange" }
        if ($null -eq $p.rating)   { $missing += "rating" }
    }
    if ($missing.Count -eq 0) {
        Print-Pass "Each place has id, name, type, priceRange, rating"
    } else {
        Record-Fail "Some places missing required fields (sample: $($missing -join ', '))"
    }

    Print-Info "Total places: $count"
}

# Build set of place IDs for STEP 5
$placeIds = @{}
foreach ($p in $allPlaces) {
    if ($p.id) { $placeIds[$p.id] = $true }
}

# ─── STEP 2: Validate types ──────────────────────────────────────────────────

Print-Step "STEP 2 -- Validate types (allowed enum)"

$allowedTypes = @("gym", "coffee", "restaurant", "park", "yoga", "social", "outdoor", "walk", "study")
$invalidTypes = @($allPlaces | Where-Object { $_.type -notin $allowedTypes })

if ($invalidTypes.Count -eq 0) {
    Print-Pass "All place types are in allowed enum"
    Print-Info "Allowed: $($allowedTypes -join ', ')"
} else {
    $bad = $invalidTypes | ForEach-Object { "$($_.name):$($_.type)" } | Select-Object -First 5
    Record-Fail "Invalid type(s): $($bad -join '; ')"
}

# ─── STEP 3: Validate ratings ─────────────────────────────────────────────────

Print-Step "STEP 3 -- Validate ratings (1-5)"

$badRating = @($allPlaces | Where-Object {
    $r = $_.rating
    $null -eq $r -or ($r -isnot [int] -and $r -isnot [double] -and $r -isnot [decimal]) -or $r -lt 1 -or $r -gt 5
})

if ($badRating.Count -eq 0) {
    Print-Pass "All ratings are between 1 and 5"
} else {
    $sample = $badRating | Select-Object -First 3 | ForEach-Object { "$($_.name):$($_.rating)" }
    Record-Fail "Invalid rating(s): $($sample -join '; ')"
}

# ─── STEP 4: Validate diversity ──────────────────────────────────────────────

Print-Step "STEP 4 -- Validate diversity"

$gyms    = @($allPlaces | Where-Object { $_.type -eq "gym" })
$coffee  = @($allPlaces | Where-Object { $_.type -eq "coffee" })
$social  = @($allPlaces | Where-Object { $_.type -eq "social" })
$outdoor = @($allPlaces | Where-Object { $_.isIndoor -eq $false })

if ($gyms.Count -ge 2)    { Print-Pass "At least 2 gyms ($($gyms.Count))" } else { Record-Fail "Expected >= 2 gyms, got $($gyms.Count)" }
if ($coffee.Count -ge 2)  { Print-Pass "At least 2 coffee ($($coffee.Count))" } else { Record-Fail "Expected >= 2 coffee, got $($coffee.Count)" }
if ($social.Count -ge 2)  { Print-Pass "At least 2 social ($($social.Count))" } else { Record-Fail "Expected >= 2 social, got $($social.Count)" }
if ($outdoor.Count -ge 2) { Print-Pass "At least 2 outdoor (isIndoor=false) ($($outdoor.Count))" } else { Record-Fail "Expected >= 2 outdoor, got $($outdoor.Count)" }

# ─── STEP 5: Recommendation dependency ───────────────────────────────────────

Print-Step "STEP 5 -- Recommendation dependency (place IDs exist in places)"

# Get Firebase token (same pattern as test-system.ps1)
$tokenOutput = node "$backendRoot\get-test-token.js" 2>&1
$lines       = $tokenOutput -split "`n"
$inToken     = $false
$token       = ""
foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t -eq "--- COPY THIS TOKEN ---") { $inToken = $true; continue }
    if ($t -eq "--- END TOKEN ---")       { $inToken = $false; continue }
    if ($inToken -and $t -ne "")           { $token = $t }
}

if (-not $token) {
    Record-Fail "Could not get Firebase token for GET /api/recommendations"
    Print-Info "Skipping recommendation ID check (token missing)"
} else {
    $recUri = "$BaseUrl/recommendations"
    $authHeaders = @{ Authorization = "Bearer $token" }
    try {
        $recResponse = Invoke-RestMethod -Uri $recUri -Method GET -Headers $authHeaders -ContentType "application/json"
    } catch {
        Record-Fail "GET /api/recommendations failed: $($_.Exception.Message)"
    }

    if ($recResponse -and $recResponse.success -and $recResponse.data) {
        $recPlaces = @($recResponse.data)
        $missingIds = @($recPlaces | Where-Object { -not $placeIds[$_.id] } | ForEach-Object { $_.id })

        if ($missingIds.Count -eq 0) {
            Print-Pass "All $($recPlaces.Count) recommended place IDs exist in places collection"
        } else {
            Record-Fail "Recommended place IDs not in places collection: $($missingIds -join ', ')"
        }
        Print-Info "Recommendations returned: $($recPlaces.Count)"
    }
}

# ─── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
if ($script:failCount -eq 0) {
    Write-Host "  Places system validation PASSED" -ForegroundColor Green
} else {
    Write-Host "  Places system validation FAILED ($($script:failCount) check(s))" -ForegroundColor Red
}
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

if ($script:failCount -gt 0) { exit 1 }

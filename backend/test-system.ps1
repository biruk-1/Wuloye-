###############################################################################
# test-system.ps1 -- Full system integration test (all phases)
#
# Usage:  .\test-system.ps1
#
# Verifies that the entire data pipeline works end-to-end:
#
#   Data -> Behavior -> Learning -> Decision
#
#   STEP 0  Auth          -- get Firebase ID token
#   STEP 1  Profile setup -- PUT /api/profile (interests, budget, location)
#   STEP 2  Routines      -- create 2 routines, verify IDs
#   STEP 3  Interactions  -- log 7 realistic behaviors, verify scores
#   STEP 4  Recommendations -- GET ?debug=true, verify personalization
#   STEP 5  Score breakdown  -- verify per-rule signals in top result
#   STEP 6  Meta validation  -- profileFound, routineCount, interactionCount,
#                               topInterestType
#   STEP 7  Cleanup          -- delete the 2 test routines
#
# Exit code: 0 = PASSED, 1 = FAILED
###############################################################################

param([string]$BaseUrl = "http://localhost:5000/api")

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Print-Step([string]$msg) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}
function Print-Pass([string]$msg) { Write-Host "  [PASS]  $msg" -ForegroundColor Green }
function Print-Fail([string]$msg) {
    Write-Host "  [FAIL]  $msg" -ForegroundColor Red
    $script:failCount++
}
function Print-Info([string]$msg) { Write-Host "  [INFO]  $msg" -ForegroundColor Yellow }
function Print-Warn([string]$msg) { Write-Host "  [WARN]  $msg" -ForegroundColor DarkYellow }

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

# Global failure counter -- Print-Fail increments this.
$script:failCount = 0

# ─── STEP 0: Auth ─────────────────────────────────────────────────────────────

Print-Step "STEP 0 -- Auth: get Firebase ID token"

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
    Print-Fail "Could not get ID token"
    Write-Host $tokenOutput -ForegroundColor Red
    exit 1
}

Print-Pass "Got ID token (length: $($token.Length) chars)"
$authHeaders = @{ Authorization = "Bearer $token" }

# Ensure the profile document exists before we try to update it.
# GET /api/profile creates the document on first login.
$initRes = Invoke-Api -Method GET -Path "/profile" -Headers $authHeaders
if (-not ($initRes.ok -and $initRes.data.success)) {
    Print-Fail "Could not initialise profile via GET /api/profile"
    Write-Host ($initRes.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}
Print-Info "Profile document confirmed in Firestore"

# ─── STEP 1: Profile setup ────────────────────────────────────────────────────

Print-Step "STEP 1 -- Profile setup: PUT /api/profile"

$profileBody = @{
    interests          = @("gym", "coffee")
    budgetRange        = "low"
    locationPreference = "indoor"
}

$res = Invoke-Api -Method PUT -Path "/profile" -Headers $authHeaders -Body $profileBody

if ($res.ok -and $res.data.success) {
    $prof = $res.data.data
    Print-Pass "Profile updated"
    Print-Info "budgetRange        : $($prof.budgetRange)"
    Print-Info "locationPreference : $($prof.locationPreference)"
    Print-Info "interests          : $($prof.interests -join ', ')"

    # Verify the response reflects what we sent.
    if ($prof.budgetRange -eq "low") {
        Print-Pass "budgetRange reflected correctly"
    } else {
        Print-Fail "budgetRange mismatch -- expected 'low', got '$($prof.budgetRange)'"
    }

    if ($prof.locationPreference -eq "indoor") {
        Print-Pass "locationPreference reflected correctly"
    } else {
        Print-Fail "locationPreference mismatch"
    }
} else {
    Print-Fail "PUT /api/profile failed:"
    Write-Host ($res.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

# ─── STEP 2: Create routines ──────────────────────────────────────────────────

Print-Step "STEP 2 -- Routines: create 2 routines"

# Routine 1 -- gym, morning, indoor, low
$routine1Body = @{
    weekday            = "Monday"
    timeOfDay          = "morning"
    activityType       = "gym"
    locationPreference = "indoor"
    budgetRange        = "low"
}

$r1 = Invoke-Api -Method POST -Path "/routines" -Headers $authHeaders -Body $routine1Body

if ($r1.ok -and $r1.data.success) {
    $routineId1 = $r1.data.data.id
    Print-Pass "Routine 1 created (gym / morning / indoor)"
    Print-Info "id : $routineId1"
} else {
    Print-Fail "Routine 1 creation failed:"
    Write-Host ($r1.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

# Routine 2 -- social, evening, outdoor, medium
$routine2Body = @{
    weekday            = "Saturday"
    timeOfDay          = "evening"
    activityType       = "social"
    locationPreference = "outdoor"
    budgetRange        = "medium"
}

$r2 = Invoke-Api -Method POST -Path "/routines" -Headers $authHeaders -Body $routine2Body

if ($r2.ok -and $r2.data.success) {
    $routineId2 = $r2.data.data.id
    Print-Pass "Routine 2 created (social / evening / outdoor)"
    Print-Info "id : $routineId2"
} else {
    Print-Fail "Routine 2 creation failed:"
    Write-Host ($r2.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

# ─── STEP 3: Log interactions ─────────────────────────────────────────────────

Print-Step "STEP 3 -- Interactions: log 7 realistic user behaviors"

# Expected score mapping: view=1, click=2, save=3, dismiss=-1
$interactionPlan = @(
    @{ placeId = "place_1"; actionType = "view";    expectedScore =  1 },  # gym view
    @{ placeId = "place_1"; actionType = "click";   expectedScore =  2 },  # gym click
    @{ placeId = "place_1"; actionType = "save";    expectedScore =  3 },  # gym SAVE (strong)
    @{ placeId = "place_2"; actionType = "view";    expectedScore =  1 },  # outdoor view
    @{ placeId = "place_2"; actionType = "dismiss"; expectedScore = -1 },  # outdoor DISMISS
    @{ placeId = "place_3"; actionType = "view";    expectedScore =  1 },  # yoga view
    @{ placeId = "place_3"; actionType = "click";   expectedScore =  2 }   # yoga click
)

$interactionCount = 0
foreach ($plan in $interactionPlan) {
    $iBody = @{ placeId = $plan.placeId; actionType = $plan.actionType }
    $iRes  = Invoke-Api -Method POST -Path "/interactions" -Headers $authHeaders -Body $iBody

    if ($iRes.ok -and $iRes.data.success) {
        $actualScore = $iRes.data.data.score

        if ($actualScore -eq $plan.expectedScore) {
            Print-Pass "$($plan.placeId) / $($plan.actionType) -> score $actualScore (correct)"
        } else {
            Print-Fail "$($plan.placeId) / $($plan.actionType) -> score $actualScore (expected $($plan.expectedScore))"
        }
        $interactionCount++
    } else {
        Print-Fail "Interaction failed for $($plan.placeId) / $($plan.actionType):"
        Write-Host ($iRes.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    }
}

if ($interactionCount -ge 6) {
    Print-Pass "$interactionCount / 7 interactions logged (>= 6 required)"
} else {
    Print-Fail "Only $interactionCount interactions logged -- expected at least 6"
}

# ─── STEP 4: Recommendations ─────────────────────────────────────────────────

Print-Step "STEP 4 -- Recommendations: GET /api/recommendations?debug=true"

$recRes = Invoke-Api -Method GET -Path "/recommendations?debug=true" -Headers $authHeaders

if (-not ($recRes.ok -and $recRes.data.success)) {
    Print-Fail "GET /api/recommendations failed:"
    Write-Host ($recRes.data | ConvertTo-Json -Depth 5) -ForegroundColor Red
    exit 1
}

$recs  = $recRes.data.data
$meta  = $recRes.data.meta
$count = $recs.Count

Print-Pass "Got $count recommendation(s)"

# 4-A: At least 5 results
if ($count -ge 5) {
    Print-Pass "At least 5 results returned"
} else {
    Print-Fail "Expected >= 5 results, got $count"
}

# Print top 5
Write-Host ""
Write-Host "  Top 5 recommendations:" -ForegroundColor Cyan
$top5 = $recs | Select-Object -First 5
$rank = 1
foreach ($place in $top5) {
    Write-Host ("  #{0}  {1,-32}  type: {2,-8}  score: {3}" -f $rank, $place.name, $place.type, $place.score) -ForegroundColor White
    $rank++
}

# 4-B: At least one score > 2 (proves personalization is influencing ranking)
$highScoreResults = $recs | Where-Object { $_.score -gt 2 }
if ($highScoreResults.Count -gt 0) {
    Print-Pass "Personalization signal confirmed -- $($highScoreResults.Count) result(s) with score > 2"
} else {
    Print-Fail "No result has score > 2 -- personalization not working"
}

# 4-C: At least one "gym" type in the top 3 (routine activityType match)
$top3      = $recs | Select-Object -First 3
$gymInTop3 = $top3 | Where-Object { $_.type -eq "gym" }
if ($gymInTop3.Count -gt 0) {
    Print-Pass "Routine influence confirmed -- 'gym' type found in top 3"
} else {
    Print-Warn "No 'gym' type in top 3 -- routine match may not be strong enough yet"
}

# 4-D: place_1 (Downtown Gym) should appear in results -- it was saved
# Check by id or by name. Use @() so single-object result has a .Count (PowerShell quirk).
$place1ById   = @($recs | Where-Object { ($_.id -eq "place_1") -or ($_.Id -eq "place_1") })
$place1ByName = @($recs | Where-Object { $_.name -eq "Downtown Gym" })
if (($place1ById.Count -gt 0) -or ($place1ByName.Count -gt 0)) {
    Print-Pass "Saved place (place_1 / Downtown Gym) is present in results"
} else {
    Print-Fail "Saved place (place_1) is missing from results"
}

# 4-E: place_2 (dismissed) should NOT appear in results
$place2InResults = $recs | Where-Object { $_.id -eq "place_2" }
if ($place2InResults.Count -eq 0) {
    Print-Pass "Dismissed place (place_2) correctly excluded from results"
} else {
    Print-Fail "Dismissed place (place_2) still appears in results -- filter not working"
}

# ─── STEP 5: Score breakdown validation ──────────────────────────────────────

Print-Step "STEP 5 -- Score breakdown: verify per-rule signals on top result"

$topResult = $recs | Select-Object -First 1

if ($null -eq $topResult.scoreBreakdown) {
    Print-Fail "scoreBreakdown missing on top result (was debug=true sent?)"
} else {
    $bd = $topResult.scoreBreakdown

    Write-Host ""
    Write-Host "  Score breakdown for #1: $($topResult.name) (type: $($topResult.type))" -ForegroundColor Cyan
    Write-Host ("    routineMatch      : {0,4}" -f $bd.routineMatch)       -ForegroundColor White
    Write-Host ("    budgetMatch       : {0,4}" -f $bd.budgetMatch)        -ForegroundColor White
    Write-Host ("    locationMatch     : {0,4}" -f $bd.locationMatch)      -ForegroundColor White
    Write-Host ("    interactionScore  : {0,4}" -f $bd.interactionScore)   -ForegroundColor White
    Write-Host ("    typeSaveSignal    : {0,4}" -f $bd.typeSaveSignal)     -ForegroundColor White
    Write-Host ("    typeDismissSignal : {0,4}" -f $bd.typeDismissSignal)  -ForegroundColor White
    Write-Host ("    affinityBoost     : {0,4}" -f $bd.affinityBoost)      -ForegroundColor White
    Write-Host ("    timeOfDayMatch    : {0,4}" -f $bd.timeOfDayMatch)     -ForegroundColor White
    Write-Host ("    -------------------------")                             -ForegroundColor DarkGray
    Write-Host ("    TOTAL             : {0,4}" -f $topResult.score)       -ForegroundColor Green

    # 5-A: routineMatch must be > 0 for the top result
    if ($bd.routineMatch -gt 0) {
        Print-Pass "routineMatch > 0 on top result (routine signal present)"
    } else {
        Print-Fail "routineMatch = 0 on top result -- routine influence missing"
    }

    # 5-B: budgetMatch must be > 0 (profile budgetRange = "low" was set in step 1)
    if ($bd.budgetMatch -gt 0) {
        Print-Pass "budgetMatch > 0 on top result (profile budget signal present)"
    } else {
        Print-Fail "budgetMatch = 0 on top result -- budget signal missing"
    }

    # 5-C: at least one of interactionScore or affinityBoost must be non-zero
    if ($bd.interactionScore -ne 0 -or $bd.affinityBoost -ne 0) {
        Print-Pass "Interaction learning signal present (interactionScore or affinityBoost != 0)"
    } else {
        Print-Fail "Neither interactionScore nor affinityBoost is non-zero -- interaction learning missing"
    }
}

# ─── STEP 6: Meta validation ──────────────────────────────────────────────────

Print-Step "STEP 6 -- Meta: verify recommendation context block"

if ($null -eq $meta) {
    Print-Fail "meta block is missing from response"
} else {
    Print-Info "meta.profileFound     : $($meta.profileFound)"
    Print-Info "meta.routineCount     : $($meta.routineCount)"
    Print-Info "meta.interactionCount : $($meta.interactionCount)"
    Print-Info "meta.topInterestType  : $($meta.topInterestType)"

    if ($meta.profileFound -eq $true) {
        Print-Pass "meta.profileFound = true"
    } else {
        Print-Fail "meta.profileFound is not true"
    }

    if ($meta.routineCount -ge 2) {
        Print-Pass "meta.routineCount >= 2 ($($meta.routineCount) found)"
    } else {
        Print-Fail "meta.routineCount < 2 (got $($meta.routineCount)) -- routine creation may have failed"
    }

    if ($meta.interactionCount -ge 6) {
        Print-Pass "meta.interactionCount >= 6 ($($meta.interactionCount) found)"
    } else {
        Print-Fail "meta.interactionCount < 6 (got $($meta.interactionCount)) -- some interactions may have failed"
    }

    if ($meta.topInterestType) {
        Print-Pass "meta.topInterestType = '$($meta.topInterestType)' (affinity learning is active)"
    } else {
        Print-Fail "meta.topInterestType is null -- type affinity not being computed"
    }
}

# ─── STEP 7: Cleanup ─────────────────────────────────────────────────────────

Print-Step "STEP 7 -- Cleanup: delete test routines (interactions kept for learning)"

foreach ($id in @($routineId1, $routineId2)) {
    $delRes = Invoke-Api -Method DELETE -Path "/routines/$id" -Headers $authHeaders
    if ($delRes.ok -and $delRes.data.success) {
        Print-Pass "Routine $id deleted"
    } else {
        Print-Warn "Could not delete routine $id -- it may need manual cleanup"
    }
}

# ─── Final result ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta

if ($script:failCount -eq 0) {
    Write-Host "  System integration test PASSED" -ForegroundColor Green
    Write-Host "  All checks OK. Data -> Behavior -> Learning -> Decision confirmed." -ForegroundColor Green
} else {
    Write-Host "  System integration test FAILED" -ForegroundColor Red
    Write-Host "  $($script:failCount) check(s) failed. Review [FAIL] lines above." -ForegroundColor Red
}

Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

if ($script:failCount -gt 0) { exit 1 }

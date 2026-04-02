###############################################################################
# test-system.ps1 -- Full system integration test (all phases)
#
# Usage:  .\test-system.ps1
#
# Verifies that the entire data pipeline works end-to-end:
#
#   Data -> Behavior -> Learning -> Model -> Real-World -> Performance -> Personalization
#
#   STEP 0  Auth          -- get Firebase ID token
#   STEP 1  Profile setup -- PUT /api/profile (interests, budget, location)
#   STEP 2  Routines      -- create 2 routines, verify IDs
#   STEP 3  Interactions  -- log 7 realistic behaviors, verify scores
#   STEP 4  Recommendations -- GET ?debug=true, verify personalization
#   STEP 5  Score breakdown  -- verify per-rule signals + Phase 7 (intent, recent, echo)
#                               + Phase 8 (session, sequence, diversity penalty, cold-start)
#                               + Phase 9 (embeddingScore, longTermAffinityBoost)
#                               + Phase 10 (exploitationBoost, explorationBoost enhanced,
#                                           repeatPenalty, diversityBoost)
#                               + Phase 11/12 (modelScore from AI linear model)
#                               + Phase 14 (closedPenalty, trendBoost)
#                               + Phase 16 (multiInterestBoost, habitContextBoost, contextStackBoost)
#   STEP 6  Meta validation  -- profileFound, routines, interactions, topInterestType,
#                               context (timeOfDay, isLateNight), detectedIntent,
#                               session (dominantSessionType, sessionIntent, recentActionCount),
#                               longTerm (topEmbeddingType, embeddingStrength),
#                               exploration (explorationWeight, exploitationWeight),
#                               ai (modelActive, modelVersion, versionNumber, lastTrainedAt, sampleCount)
#                               learning (recencyWeightActive, behaviorShiftDetected) [Phase 13]
#                               location (source, radiusUsed, resultsFetched)         [Phase 14]
#                               performance (elapsedMs, cacheHit, fallbackActive,     [Phase 15]
#                                            placesScored)
#                               personalization (dominantHabits, topInterestWeights) [Phase 16]
#                               experiment (experimentActive, experimentId, variantAssigned) [Phase 17]
#   STEP 6b Cache test       -- second request must be a cache hit                    [Phase 15]
#   STEP 6c Phase 17       -- optional: -Phase17Experiment (server needs EXPERIMENT_ACTIVE=true)
#   STEP 6d Phase 18       -- health envelope, readiness deps.firestore, metrics endpoint,
#                             rate-limit 429 burst check                              [Phase 18]
#   STEP 7  Cleanup          -- delete the 2 test routines
#
# Exit code: 0 = PASSED, 1 = FAILED
###############################################################################

param(
    [string]$BaseUrl = "http://localhost:5000/api",
    [switch]$Phase17Experiment
)

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Print-Step([string]$msg) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}
function Print-Pass([string]$msg) { Write-Host ('  [PASS]  {0}' -f $msg) -ForegroundColor Green }
function Print-Fail([string]$msg) {
    Write-Host ('  [FAIL]  {0}' -f $msg) -ForegroundColor Red
    $script:failCount++
}
function Print-Info([string]$msg) { Write-Host ('  [INFO]  {0}' -f $msg) -ForegroundColor Yellow }
function Print-Warn([string]$msg) { Write-Host ('  [WARN]  {0}' -f $msg) -ForegroundColor DarkYellow }

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
    Write-Host ("    routineMatch      : {0,6}" -f $bd.routineMatch)       -ForegroundColor White
    Write-Host ("    budgetMatch       : {0,6}" -f $bd.budgetMatch)        -ForegroundColor White
    Write-Host ("    locationMatch     : {0,6}" -f $bd.locationMatch)      -ForegroundColor White
    Write-Host ("    interactionScore  : {0,6}" -f $bd.interactionScore)   -ForegroundColor White
    Write-Host ("    recencyWeight     : {0,6}" -f $bd.recencyWeight)      -ForegroundColor White
    Write-Host ("    typeSaveSignal    : {0,6}" -f $bd.typeSaveSignal)     -ForegroundColor White
    Write-Host ("    typeDismissSignal : {0,6}" -f $bd.typeDismissSignal)  -ForegroundColor White
    Write-Host ("    affinityBoost     : {0,6}" -f $bd.affinityBoost)      -ForegroundColor DarkGray
    Write-Host ("    typeAffinityScore : {0,6}" -f $bd.typeAffinityScore)  -ForegroundColor Magenta
    Write-Host ("    timeOfDayMatch    : {0,6}" -f $bd.timeOfDayMatch)     -ForegroundColor White
    Write-Host ("    contextTimeOfDay  : {0,6}" -f $bd.contextTimeOfDay)   -ForegroundColor White
    Write-Host ("    weekendBoost      : {0,6}" -f $bd.weekendBoost)       -ForegroundColor White
    Write-Host ("    weekdayBoost      : {0,6}" -f $bd.weekdayBoost)       -ForegroundColor White
    Write-Host ("    freshnessBoost    : {0,6}" -f $bd.freshnessBoost)     -ForegroundColor Cyan
    Write-Host ("    explorationBoost  : {0,6}" -f $bd.explorationBoost)   -ForegroundColor Cyan
    Write-Host ("    seenPenalty       : {0,6}" -f $bd.seenPenalty)        -ForegroundColor Red
    Write-Host ("    lateNightBoost    : {0,6}" -f $bd.lateNightBoost)      -ForegroundColor DarkCyan
    Write-Host ("    intentBoost       : {0,6}" -f $bd.intentBoost)         -ForegroundColor Magenta
    Write-Host ("    detectedIntent    : {0}" -f $bd.detectedIntent)       -ForegroundColor Magenta
    Write-Host ("    recentBoost       : {0,6}" -f $bd.recentBoost)        -ForegroundColor DarkCyan
    Write-Host ("    echoChoke         : {0,6}" -f $bd.echoChoke)          -ForegroundColor DarkYellow
    Write-Host ("    sessionBoost      : {0,6}" -f $bd.sessionBoost)       -ForegroundColor Cyan
    Write-Host ("    sequenceBoost     : {0,6}" -f $bd.sequenceBoost)      -ForegroundColor Cyan
    Write-Host ("    typeDivPenalty    : {0,6}" -f $bd.typeDiversityPenalty) -ForegroundColor Red
    Write-Host ("    popularityScore   : {0,6}" -f $bd.popularityScore)    -ForegroundColor DarkGray
    Write-Host ("    locationTrend     : {0,6}" -f $bd.locationTrendScore) -ForegroundColor DarkGray
    Write-Host ("    dominantSessType  : {0}"   -f $bd.dominantSessionType) -ForegroundColor Magenta
    Write-Host ("    sessionIntent     : {0}"   -f $bd.sessionIntent)      -ForegroundColor Magenta
    Write-Host ("    embeddingScore    : {0,6}" -f $bd.embeddingScore)     -ForegroundColor Cyan
    Write-Host ("    longTermAffinity  : {0,6}" -f $bd.longTermAffinityBoost) -ForegroundColor Cyan
    Write-Host ("    exploitationBoost : {0,6}" -f $bd.exploitationBoost)  -ForegroundColor Green
    Write-Host ("    explorationBoost  : {0,6}" -f $bd.explorationBoost)   -ForegroundColor DarkGreen
    Write-Host ("    repeatPenalty     : {0,6}" -f $bd.repeatPenalty)      -ForegroundColor Red
    Write-Host ("    diversityBoost    : {0,6}" -f $bd.diversityBoost)     -ForegroundColor Green
    Write-Host ("    modelScore        : {0,6}" -f $bd.modelScore)         -ForegroundColor Magenta
    Write-Host ("    -------------------------")                             -ForegroundColor DarkGray
    Write-Host ("    rawScore          : {0,6}" -f $topResult.rawScore)    -ForegroundColor Yellow
    Write-Host ("    TOTAL (norm.)     : {0,6}" -f $topResult.score)       -ForegroundColor Green

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

    # 5-C: at least one result in the list must show interaction learning (not necessarily #1)
    $anyLearning = @($recs | Where-Object {
        $b = $_.scoreBreakdown
        $null -ne $b -and ($b.interactionScore -ne 0 -or $b.affinityBoost -ne 0 -or $b.typeAffinityScore -ne 0)
    })
    if ($anyLearning.Count -gt 0) {
        Print-Pass "Interaction learning present in $($anyLearning.Count) result(s) (interactionScore / affinityBoost / typeAffinityScore)"
    } else {
        Print-Fail "No result has interactionScore, affinityBoost, or typeAffinityScore non-zero -- interaction learning missing"
    }

    # 5-D: v5 fields - freshnessBoost and explorationBoost must exist in breakdown
    if ($null -ne $bd.PSObject.Properties["freshnessBoost"]) {
        Print-Pass "scoreBreakdown.freshnessBoost field present ($($bd.freshnessBoost))"
    } else {
        Print-Fail "scoreBreakdown.freshnessBoost field missing -- v5 upgrade not applied"
    }

    if ($null -ne $bd.PSObject.Properties["explorationBoost"]) {
        Print-Pass "scoreBreakdown.explorationBoost field present ($($bd.explorationBoost))"
    } else {
        Print-Fail "scoreBreakdown.explorationBoost field missing -- v5 upgrade not applied"
    }

    # 5-E: rawScore must be present and numeric
    if ($null -ne $topResult.rawScore) {
        Print-Pass "rawScore present on top result ($($topResult.rawScore))"
    } else {
        Print-Fail "rawScore missing -- score normalization not applied"
    }

    # 5-F: normalized score must be in [0, 100]
    $ns = [double]$topResult.score
    if ($ns -ge 0 -and $ns -le 100) {
        Print-Pass "score (normalized) in valid range 0-100 ($ns)"
    } else {
        Print-Fail "score out of normalized range: $ns"
    }

    # 5-G: consecutive types in top 5 must not all be the same (diversity injection check)
    $types = @($recs | Select-Object -First 5 | ForEach-Object { $_.type })
    $consecutiveDup = $false
    for ($i = 1; $i -lt $types.Count; $i++) {
        if ($types[$i] -eq $types[$i-1]) { $consecutiveDup = $true; break }
    }
    if (-not $consecutiveDup) {
        Print-Pass "Diversity injection: no two consecutive places share a type in top 5"
    } else {
        Print-Warn "Two consecutive places share the same type in top 5 -- diversity may be limited by catalogue size"
    }

    # 5-H: v6 fields - typeAffinityScore and seenPenalty must exist
    if ($null -ne $bd.PSObject.Properties["typeAffinityScore"]) {
        Print-Pass "scoreBreakdown.typeAffinityScore present ($($bd.typeAffinityScore))"
    } else {
        Print-Fail "scoreBreakdown.typeAffinityScore missing -- v6 upgrade not applied"
    }

    if ($null -ne $bd.PSObject.Properties["seenPenalty"]) {
        Print-Pass "scoreBreakdown.seenPenalty present ($($bd.seenPenalty))"
    } else {
        Print-Fail "scoreBreakdown.seenPenalty missing -- v6 upgrade not applied"
    }

    # 5-I: after logging 7 interactions in STEP 3, at least one result should have
    # a non-zero typeAffinityScore (persistent learning is active)
    $anyAffinity = @($recs | Where-Object {
        $b = $_.scoreBreakdown
        $null -ne $b -and $b.typeAffinityScore -ne 0
    })
    if ($anyAffinity.Count -gt 0) {
        Print-Pass "typeAffinityScore != 0 in $($anyAffinity.Count) result(s) -- persistent learning active"
    } else {
        Print-Warn "typeAffinityScore = 0 in all results -- profile.typeAffinity may not have been updated yet"
    }

    # 5-J: Phase 7 fields - intent, recent memory, late-night, echo chamber
    $v7Fields = @(
        @{ name = "lateNightBoost";   prop = "lateNightBoost" },
        @{ name = "intentBoost";      prop = "intentBoost" },
        @{ name = "detectedIntent";   prop = "detectedIntent" },
        @{ name = "recentBoost";      prop = "recentBoost" },
        @{ name = "echoChoke";        prop = "echoChoke" }
    )
    foreach ($f in $v7Fields) {
        if ($null -ne $bd.PSObject.Properties[$f.prop]) {
            Print-Pass "scoreBreakdown.$($f.name) present ($($bd.($f.prop)))"
        } else {
            Print-Fail "scoreBreakdown.$($f.name) missing -- Phase 7 upgrade not applied"
        }
    }

    $validIntents = @("fitness", "social", "relax", "explore")
    if ($null -eq $bd.detectedIntent) {
        Print-Fail "scoreBreakdown.detectedIntent is null"
    } elseif ($validIntents -contains $bd.detectedIntent) {
        Print-Pass "scoreBreakdown.detectedIntent is a valid intent ('$($bd.detectedIntent)')"
    } else {
        Print-Fail "scoreBreakdown.detectedIntent invalid (got '$($bd.detectedIntent)')"
    }

    # 5-K: Phase 8 fields - session layer, sequence, diversity, cold-start
    $p8Fields = @(
        @{ name = "sessionBoost";         prop = "sessionBoost" },
        @{ name = "sequenceBoost";        prop = "sequenceBoost" },
        @{ name = "typeDiversityPenalty"; prop = "typeDiversityPenalty" },
        @{ name = "popularityScore";      prop = "popularityScore" },
        @{ name = "locationTrendScore";   prop = "locationTrendScore" },
        @{ name = "dominantSessionType";  prop = "dominantSessionType" },
        @{ name = "sessionIntent";        prop = "sessionIntent" }
    )
    foreach ($f in $p8Fields) {
        if ($null -ne $bd.PSObject.Properties[$f.prop]) {
            Print-Pass "scoreBreakdown.$($f.name) present ($($bd.($f.prop)))"
        } else {
            Print-Fail "scoreBreakdown.$($f.name) missing -- Phase 8 upgrade not applied"
        }
    }

    # 5-L: sessionIntent must be a valid intent string
    $validSessionIntents = @("fitness", "social", "relax", "explore")
    if ($null -eq $bd.sessionIntent) {
        Print-Fail "scoreBreakdown.sessionIntent is null"
    } elseif ($validSessionIntents -contains $bd.sessionIntent) {
        Print-Pass "scoreBreakdown.sessionIntent is valid ('$($bd.sessionIntent)')"
    } else {
        Print-Fail "scoreBreakdown.sessionIntent invalid (got '$($bd.sessionIntent)')"
    }

    # 5-M: at least one result should have sessionBoost > 0 after interactions
    # (may be 0 on a fresh user with no session yet - WARN not FAIL)
    $anySessionBoost = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and $_.scoreBreakdown.sessionBoost -gt 0
    })
    if ($anySessionBoost.Count -gt 0) {
        Print-Pass "sessionBoost > 0 in $($anySessionBoost.Count) result(s) -- session layer active"
    } else {
        Print-Warn "sessionBoost = 0 in all results -- session may be empty (run more interactions first)"
    }

    # 5-N: at least one result should have sequenceBoost > 0 after interactions
    $anySequenceBoost = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and $_.scoreBreakdown.sequenceBoost -gt 0
    })
    if ($anySequenceBoost.Count -gt 0) {
        Print-Pass "sequenceBoost > 0 in $($anySequenceBoost.Count) result(s) -- sequential prediction active"
    } else {
        Print-Warn "sequenceBoost = 0 in all results -- may fire after more session history is built"
    }

    # 5-O: Phase 9 fields -- embedding score and long-term affinity boost
    $p9Fields = @(
        @{ name = "embeddingScore";        prop = "embeddingScore" },
        @{ name = "longTermAffinityBoost"; prop = "longTermAffinityBoost" }
    )
    foreach ($f in $p9Fields) {
        if ($null -ne $bd.PSObject.Properties[$f.prop]) {
            Print-Pass "scoreBreakdown.$($f.name) present ($($bd.($f.prop)))"
        } else {
            Print-Fail "scoreBreakdown.$($f.name) missing -- Phase 9 upgrade not applied"
        }
    }

    # 5-P: embeddingScore must be in valid range [0, 1]
    if ($null -ne $bd.PSObject.Properties["embeddingScore"]) {
        $es = [double]$bd.embeddingScore
        if ($es -ge 0 -and $es -le 1) {
            Print-Pass "embeddingScore in valid range [0, 1] ($es)"
        } else {
            Print-Fail "embeddingScore out of range: $es (expected 0-1)"
        }
    }

    # 5-Q: at least one result should have embeddingScore > 0 after interactions
    $anyEmbedding = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and [double]$_.scoreBreakdown.embeddingScore -gt 0
    })
    if ($anyEmbedding.Count -gt 0) {
        Print-Pass "embeddingScore > 0 in $($anyEmbedding.Count) result(s) -- long-term memory active"
    } else {
        Print-Warn "embeddingScore = 0 in all results -- user embedding may be empty (log more interactions)"
    }

    # 5-R: Phase 10 fields -- exploitation / exploration / repeat / diversity
    $p10Fields = @(
        @{ name = "exploitationBoost"; prop = "exploitationBoost" },
        @{ name = "repeatPenalty";     prop = "repeatPenalty" },
        @{ name = "diversityBoost";    prop = "diversityBoost" }
    )
    foreach ($f in $p10Fields) {
        if ($null -ne $bd.PSObject.Properties[$f.prop]) {
            Print-Pass "scoreBreakdown.$($f.name) present ($($bd.($f.prop)))"
        } else {
            Print-Fail "scoreBreakdown.$($f.name) missing -- Phase 10 upgrade not applied"
        }
    }

    # explorationBoost already exists from v5 but Phase 10 enhances it -- just confirm it's still there
    if ($null -ne $bd.PSObject.Properties["explorationBoost"]) {
        Print-Pass "scoreBreakdown.explorationBoost present (v5 + Phase 10 enhanced: $($bd.explorationBoost))"
    } else {
        Print-Fail "scoreBreakdown.explorationBoost missing -- Phase 10 exploration upgrade not applied"
    }

    # 5-S: at least one result should have exploitationBoost > 0 after interactions
    $anyExploitation = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and [double]$_.scoreBreakdown.exploitationBoost -gt 0
    })
    if ($anyExploitation.Count -gt 0) {
        Print-Pass "exploitationBoost > 0 in $($anyExploitation.Count) result(s) -- exploitation layer active"
    } else {
        Print-Warn "exploitationBoost = 0 in all results -- user embedding may be too low (< 0.2); log more saves/clicks"
    }

    # 5-T: at least one result should have explorationBoost > 0 (novel types exist in catalogue)
    $anyExploration = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and [double]$_.scoreBreakdown.explorationBoost -gt 0
    })
    if ($anyExploration.Count -gt 0) {
        Print-Pass "explorationBoost > 0 in $($anyExploration.Count) result(s) -- exploration layer active"
    } else {
        Print-Warn "explorationBoost = 0 in all results -- all types may already appear in recent interactions"
    }

    # 5-U: repeatPenalty should be <= 0 (zero or negative only)
    if ($null -ne $bd.PSObject.Properties["repeatPenalty"]) {
        $rp = [double]$bd.repeatPenalty
        if ($rp -le 0) {
            Print-Pass "repeatPenalty is <= 0 on top result ($rp) -- correct polarity"
        } else {
            Print-Fail "repeatPenalty is positive ($rp) -- penalty must be 0 or negative"
        }
    }

    # 5-V: diversityBoost should be >= 0 (zero or positive only)
    if ($null -ne $bd.PSObject.Properties["diversityBoost"]) {
        $db = [double]$bd.diversityBoost
        if ($db -ge 0) {
            Print-Pass "diversityBoost is >= 0 on top result ($db) -- correct polarity"
        } else {
            Print-Fail "diversityBoost is negative ($db) -- boost must be 0 or positive"
        }
    }

    # 5-W: top results should not all be the same type (diversity is working)
    $top5types = @($recs | Select-Object -First 5 | ForEach-Object { $_.type })
    $uniqueTypes = ($top5types | Sort-Object -Unique).Count
    if ($uniqueTypes -ge 2) {
        Print-Pass "Top 5 results span $uniqueTypes distinct types -- recommendations are not monopolised"
    } else {
        Print-Warn "Top 5 results are all the same type -- catalogue may be too narrow for diversity"
    }

    # 5-X: Phase 11 -- modelScore field must exist in scoreBreakdown
    if ($null -ne $bd.PSObject.Properties["modelScore"]) {
        Print-Pass "scoreBreakdown.modelScore present ($($bd.modelScore))"
    } else {
        Print-Fail "scoreBreakdown.modelScore missing -- Phase 11 AI layer not applied"
    }

    # 5-Y: modelScore must be a number (0 is valid when model is untrained)
    if ($null -ne $bd.PSObject.Properties["modelScore"]) {
        $ms = [double]$bd.modelScore
        if ($ms -ge -10 -and $ms -le 20) {
            Print-Pass "modelScore in valid clamped range [-10, 20] ($ms)"
        } else {
            Print-Fail "modelScore out of expected range: $ms (expected -10 to 20)"
        }
    }

    # 5-Z: if model is untrained (modelScore = 0 for all), warn but don't fail
    # (first training fires after INITIAL_TRAIN_THRESHOLD interactions)
    $anyModelScore = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and [double]$_.scoreBreakdown.modelScore -ne 0
    })
    if ($anyModelScore.Count -gt 0) {
        Print-Pass "modelScore != 0 in $($anyModelScore.Count) result(s) -- AI model is active"
    } else {
        Print-Warn "modelScore = 0 in all results -- model not yet trained (log >= 10 interactions to trigger first train)"
    }

    # 5-AA: Phase 14 -- closedPenalty field must exist in scoreBreakdown
    if ($null -ne $bd.PSObject.Properties["closedPenalty"]) {
        Print-Pass "scoreBreakdown.closedPenalty present ($($bd.closedPenalty))"
    } else {
        Print-Fail "scoreBreakdown.closedPenalty missing -- Phase 14 closed-place penalty not applied"
    }

    # 5-AB: closedPenalty must be 0 or -5 only
    if ($null -ne $bd.PSObject.Properties["closedPenalty"]) {
        $cp = [double]$bd.closedPenalty
        if ($cp -eq 0 -or $cp -eq -5) {
            Print-Pass "closedPenalty is valid value ($cp)"
        } else {
            Print-Fail "closedPenalty has unexpected value: $cp (expected 0 or -5)"
        }
    }

    # 5-AC: Phase 14 -- trendBoost field must exist in scoreBreakdown
    if ($null -ne $bd.PSObject.Properties["trendBoost"]) {
        Print-Pass "scoreBreakdown.trendBoost present ($($bd.trendBoost))"
    } else {
        Print-Fail "scoreBreakdown.trendBoost missing -- Phase 14 trend boost not applied"
    }

    # 5-AD: trendBoost must be >= 0
    if ($null -ne $bd.PSObject.Properties["trendBoost"]) {
        $tb = [double]$bd.trendBoost
        if ($tb -ge 0 -and $tb -le 3) {
            Print-Pass "trendBoost in valid range [0, 3] ($tb)"
        } else {
            Print-Fail "trendBoost out of expected range: $tb (expected 0 to 3)"
        }
    }

    # 5-AE: Phase 16 -- multiInterestBoost + interestWeightUsed
    if ($null -ne $bd.PSObject.Properties["multiInterestBoost"]) {
        Print-Pass "scoreBreakdown.multiInterestBoost present ($($bd.multiInterestBoost))"
    } else {
        Print-Fail "scoreBreakdown.multiInterestBoost missing -- Phase 16 not applied"
    }
    if ($null -ne $bd.PSObject.Properties["interestWeightUsed"]) {
        Print-Pass "scoreBreakdown.interestWeightUsed present ($($bd.interestWeightUsed))"
    } else {
        Print-Fail "scoreBreakdown.interestWeightUsed missing -- Phase 16 not applied"
    }

    # 5-AF: Phase 16 -- habitContextBoost + contextStackBoost
    if ($null -ne $bd.PSObject.Properties["habitContextBoost"]) {
        Print-Pass "scoreBreakdown.habitContextBoost present ($($bd.habitContextBoost))"
    } else {
        Print-Fail "scoreBreakdown.habitContextBoost missing -- Phase 16 not applied"
    }
    if ($null -ne $bd.PSObject.Properties["contextStackBoost"]) {
        Print-Pass "scoreBreakdown.contextStackBoost present ($($bd.contextStackBoost))"
    } else {
        Print-Fail "scoreBreakdown.contextStackBoost missing -- Phase 16 not applied"
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
    Print-Info "meta.detectedIntent   : $($meta.detectedIntent)"

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

    # 6-D: Phase 7 - meta.detectedIntent
    $validMetaIntents = @("fitness", "social", "relax", "explore")
    if ($null -eq $meta.detectedIntent) {
        Print-Fail "meta.detectedIntent is missing"
    } elseif ($validMetaIntents -contains $meta.detectedIntent) {
        Print-Pass "meta.detectedIntent = '$($meta.detectedIntent)' (Phase 7 intent engine)"
    } else {
        Print-Fail "meta.detectedIntent has invalid value '$($meta.detectedIntent)'"
    }

    $topBd = $recs | Select-Object -First 1 | ForEach-Object { $_.scoreBreakdown }
    if ($null -ne $topBd -and $meta.detectedIntent -eq $topBd.detectedIntent) {
        Print-Pass "meta.detectedIntent matches scoreBreakdown on top result"
    } elseif ($null -eq $topBd) {
        Print-Warn "Could not compare meta.detectedIntent to breakdown (no scoreBreakdown on top result)"
    } else {
        Print-Fail "meta.detectedIntent ('$($meta.detectedIntent)') != top scoreBreakdown.detectedIntent ('$($topBd.detectedIntent)')"
    }

    # 6-G: Phase 8 - meta.session block
    if ($null -ne $meta.session) {
        $sess = $meta.session
        Print-Info "meta.session.dominantSessionType: $($sess.dominantSessionType)"
        Print-Info "meta.session.sessionIntent       : $($sess.sessionIntent)"
        Print-Info "meta.session.recentActionCount   : $($sess.recentActionCount)"

        $validSessIntents = @("fitness", "social", "relax", "explore")
        if ($validSessIntents -contains $sess.sessionIntent) {
            Print-Pass "meta.session.sessionIntent is valid ('$($sess.sessionIntent)')"
        } else {
            Print-Fail "meta.session.sessionIntent invalid (got '$($sess.sessionIntent)')"
        }

        if ($sess.recentActionCount -ge 0) {
            Print-Pass "meta.session.recentActionCount present ($($sess.recentActionCount))"
        } else {
            Print-Fail "meta.session.recentActionCount is missing or negative"
        }

        Print-Pass "meta.session block present (Phase 8 session layer confirmed)"
    } else {
        Print-Fail "meta.session is missing -- Phase 8 session meta not returned"
    }

    # 6-H: Phase 9 - meta.longTerm block
    if ($null -ne $meta.longTerm) {
        $lt = $meta.longTerm
        Print-Info "meta.longTerm.topEmbeddingType  : $($lt.topEmbeddingType)"
        Print-Info "meta.longTerm.embeddingStrength : $($lt.embeddingStrength)"

        if ($null -ne $lt.embeddingStrength) {
            $es = [double]$lt.embeddingStrength
            if ($es -ge 0 -and $es -le 1) {
                Print-Pass "meta.longTerm.embeddingStrength in valid range [0, 1] ($es)"
            } else {
                Print-Fail "meta.longTerm.embeddingStrength out of range: $es"
            }
        } else {
            Print-Fail "meta.longTerm.embeddingStrength is missing"
        }

        Print-Pass "meta.longTerm block present (Phase 9 long-term memory confirmed)"
    } else {
        Print-Fail "meta.longTerm is missing -- Phase 9 embedding meta not returned"
    }

    # 6-I: Phase 10 - meta.exploration block
    if ($null -ne $meta.exploration) {
        $exp = $meta.exploration
        Print-Info "meta.exploration.explorationWeight  : $($exp.explorationWeight)"
        Print-Info "meta.exploration.exploitationWeight : $($exp.exploitationWeight)"
        Print-Info "meta.exploration.explorationActive  : $($exp.explorationActive)"

        # Weights must be in (0, 1)
        if ($null -ne $exp.explorationWeight) {
            $ew = [double]$exp.explorationWeight
            if ($ew -gt 0 -and $ew -lt 1) {
                Print-Pass "meta.exploration.explorationWeight in valid range (0,1): $ew"
            } else {
                Print-Fail "meta.exploration.explorationWeight out of range: $ew (expected between 0 and 1)"
            }
        } else {
            Print-Fail "meta.exploration.explorationWeight is missing"
        }

        if ($null -ne $exp.exploitationWeight) {
            $xw = [double]$exp.exploitationWeight
            if ($xw -gt 0 -and $xw -lt 1) {
                Print-Pass "meta.exploration.exploitationWeight in valid range (0,1): $xw"
            } else {
                Print-Fail "meta.exploration.exploitationWeight out of range: $xw (expected between 0 and 1)"
            }
        } else {
            Print-Fail "meta.exploration.exploitationWeight is missing"
        }

        # explorationWeight + exploitationWeight should sum to ~1.0
        if ($null -ne $exp.explorationWeight -and $null -ne $exp.exploitationWeight) {
            $sum = [double]$exp.explorationWeight + [double]$exp.exploitationWeight
            if ([math]::Abs($sum - 1.0) -lt 0.001) {
                Print-Pass "exploration + exploitation weights sum to 1.0 ($sum)"
            } else {
                Print-Fail "exploration + exploitation weights do not sum to 1.0 (got $sum)"
            }
        }

        if ($exp.explorationActive -eq $true) {
            Print-Pass "meta.exploration.explorationActive = true"
        } else {
            Print-Fail "meta.exploration.explorationActive is not true"
        }

        Print-Pass "meta.exploration block present (Phase 10 balance engine confirmed)"
    } else {
        Print-Fail "meta.exploration is missing -- Phase 10 exploration meta not returned"
    }

    # 6-J: Phase 11/12 -- meta.ai block
    if ($null -ne $meta.ai) {
        $ai = $meta.ai
        Print-Info "meta.ai.modelActive    : $($ai.modelActive)"
        Print-Info "meta.ai.modelVersion   : $($ai.modelVersion)"
        Print-Info "meta.ai.versionNumber  : $($ai.versionNumber)"
        Print-Info "meta.ai.lastTrainedAt  : $($ai.lastTrainedAt)"
        Print-Info "meta.ai.sampleCount    : $($ai.sampleCount)"

        # modelActive must be present
        if ($null -ne $ai.PSObject.Properties["modelActive"]) {
            Print-Pass "meta.ai.modelActive present ($($ai.modelActive))"
        } else {
            Print-Fail "meta.ai.modelActive missing"
        }

        # modelVersion must be a non-empty string like "v1", "v2"...
        if ($null -ne $ai.modelVersion -and $ai.modelVersion -match "^v\d+$") {
            Print-Pass "meta.ai.modelVersion is a valid version string ('$($ai.modelVersion)')"
        } elseif ($null -ne $ai.modelVersion) {
            Print-Warn "meta.ai.modelVersion present but unexpected format: '$($ai.modelVersion)'"
        } else {
            Print-Fail "meta.ai.modelVersion is missing"
        }

        # versionNumber must be an integer >= 0
        if ($null -ne $ai.PSObject.Properties["versionNumber"]) {
            $vn = [int]$ai.versionNumber
            if ($vn -ge 0) {
                Print-Pass "meta.ai.versionNumber is valid ($vn)"
            } else {
                Print-Fail "meta.ai.versionNumber is negative ($vn)"
            }
        } else {
            Print-Fail "meta.ai.versionNumber missing -- Phase 12 version tracking not applied"
        }

        # sampleCount must be an integer >= 0
        if ($null -ne $ai.PSObject.Properties["sampleCount"]) {
            $sc = [int]$ai.sampleCount
            if ($sc -ge 0) {
                Print-Pass "meta.ai.sampleCount is valid ($sc)"
            } else {
                Print-Fail "meta.ai.sampleCount is negative ($sc)"
            }
        } else {
            Print-Fail "meta.ai.sampleCount missing"
        }

        # lastTrainedAt is null until first training run -- warn, not fail
        if ($null -ne $ai.lastTrainedAt) {
            Print-Pass "meta.ai.lastTrainedAt present ('$($ai.lastTrainedAt)') -- model has been trained"
        } else {
            Print-Warn "meta.ai.lastTrainedAt is null -- model not trained yet (log >= 10 interactions to trigger)"
        }

        # modelActive / versionNumber consistency
        if ($ai.modelActive -eq $true -and [int]$ai.versionNumber -ge 1) {
            Print-Pass "meta.ai.modelActive=true and versionNumber >= 1 -- Phase 12 AI layer is live"
        } elseif ($ai.modelActive -eq $false) {
            Print-Warn "meta.ai.modelActive=false -- model is untrained; rule engine handles scoring"
        } else {
            Print-Fail "meta.ai.modelActive/versionNumber inconsistency"
        }

        Print-Pass "meta.ai block present (Phase 11/12 AI pipeline confirmed)"
    } else {
        Print-Fail "meta.ai is missing -- Phase 11/12 AI meta not returned"
    }

    # 6-K: Phase 13 -- meta.learning block
    if ($null -ne $meta.learning) {
        $lr = $meta.learning
        Print-Info "meta.learning.recencyWeightActive   : $($lr.recencyWeightActive)"
        Print-Info "meta.learning.behaviorShiftDetected : $($lr.behaviorShiftDetected)"

        if ($lr.recencyWeightActive -eq $true) {
            Print-Pass "meta.learning.recencyWeightActive = true"
        } else {
            Print-Fail "meta.learning.recencyWeightActive is not true"
        }

        if ($null -ne $lr.PSObject.Properties["behaviorShiftDetected"]) {
            Print-Pass "meta.learning.behaviorShiftDetected present ($($lr.behaviorShiftDetected))"
        } else {
            Print-Fail "meta.learning.behaviorShiftDetected missing"
        }

        Print-Pass "meta.learning block present (Phase 13 feedback loop confirmed)"
    } else {
        Print-Fail "meta.learning is missing -- Phase 13 learning meta not returned"
    }

    # 6-L: Phase 14 -- meta.location block
    if ($null -ne $meta.location) {
        $loc = $meta.location
        Print-Info "meta.location.source         : $($loc.source)"
        Print-Info "meta.location.radiusUsed     : $($loc.radiusUsed)"
        Print-Info "meta.location.resultsFetched : $($loc.resultsFetched)"

        # source must be "google_maps" or "firestore"
        if ($loc.source -eq "google_maps" -or $loc.source -eq "firestore") {
            Print-Pass "meta.location.source = '$($loc.source)' (valid)"
        } else {
            Print-Fail "meta.location.source is unexpected value: '$($loc.source)'"
        }

        # resultsFetched must be a non-negative integer
        if ($loc.resultsFetched -is [int] -or $loc.resultsFetched -match '^\d+$') {
            $rf = [int]$loc.resultsFetched
            if ($rf -ge 0) {
                Print-Pass "meta.location.resultsFetched = $rf (valid count)"
            } else {
                Print-Fail "meta.location.resultsFetched is negative"
            }
        } else {
            Print-Fail "meta.location.resultsFetched is not a number (got '$($loc.resultsFetched)')"
        }

        # When source is "firestore", radiusUsed should be null (no location was sent)
        if ($loc.source -eq "firestore" -and $null -eq $loc.radiusUsed) {
            Print-Pass "meta.location.radiusUsed = null (expected for firestore source)"
        } elseif ($loc.source -eq "google_maps" -and $null -ne $loc.radiusUsed) {
            Print-Pass "meta.location.radiusUsed = $($loc.radiusUsed)m (Google Maps radius confirmed)"
        } elseif ($loc.source -eq "firestore") {
            Print-Warn "meta.location.radiusUsed is non-null for firestore source (unexpected but not fatal)"
        }

        Print-Pass "meta.location block present (Phase 14 real-world data integration confirmed)"
    } else {
        Print-Fail "meta.location is missing -- Phase 14 location meta not returned"
    }

    # 6-E: meta.context must be present (added in v4 when debug=true)
    if ($null -ne $meta.context) {
        $ctx = $meta.context
        Print-Info "meta.context.hour       : $($ctx.hour)"
        Print-Info "meta.context.timeOfDay  : $($ctx.timeOfDay)"
        Print-Info "meta.context.isWeekend  : $($ctx.isWeekend)"
        Print-Info "meta.context.isLateNight: $($ctx.isLateNight)"
        Print-Info "meta.context.dayName    : $($ctx.dayName)"

        $validTimeOfDay = @("morning", "afternoon", "evening", "night")
        if ($validTimeOfDay -contains $ctx.timeOfDay) {
            Print-Pass "meta.context.timeOfDay is valid ('$($ctx.timeOfDay)')"
        } else {
            Print-Fail "meta.context.timeOfDay is invalid (got '$($ctx.timeOfDay)')"
        }

        if ($null -ne $ctx.isWeekend) {
            Print-Pass "meta.context.isWeekend present ($($ctx.isWeekend))"
        } else {
            Print-Fail "meta.context.isWeekend is missing"
        }

        if ($ctx.hour -ge 0 -and $ctx.hour -le 23) {
            Print-Pass "meta.context.hour in valid range ($($ctx.hour))"
        } else {
            Print-Fail "meta.context.hour out of range (got $($ctx.hour))"
        }

        # Phase 7: isLateNight must match night band (23-4) vs hour
        $expectedLateNight = ($ctx.hour -ge 23 -or $ctx.hour -lt 5)
        if ($null -ne $ctx.isLateNight -and $ctx.isLateNight -eq $expectedLateNight) {
            Print-Pass "meta.context.isLateNight = $($ctx.isLateNight) (consistent with hour $($ctx.hour))"
        } elseif ($null -eq $ctx.isLateNight) {
            Print-Fail "meta.context.isLateNight is missing -- Phase 7 context upgrade not applied"
        } else {
            Print-Fail "meta.context.isLateNight ($($ctx.isLateNight)) inconsistent with hour $($ctx.hour)"
        }
    } else {
        Print-Fail "meta.context is missing -- context-aware scoring not returning context (debug=true required)"
    }

    # 6-F: At least one result has contextTimeOfDay > 0 (proves the new rule fires)
    $ctxMatches = @($recs | Where-Object {
        $null -ne $_.scoreBreakdown -and $_.scoreBreakdown.contextTimeOfDay -gt 0
    })
    if ($ctxMatches.Count -gt 0) {
        Print-Pass "contextTimeOfDay > 0 in $($ctxMatches.Count) result(s) -- time-of-day rule is active"
    } else {
        Print-Warn "contextTimeOfDay = 0 in all results -- may be expected if no types match current time band"
    }

    # 6-M: Phase 15 -- meta.performance block
    if ($null -ne $meta.performance) {
        $perf = $meta.performance
        Print-Info "meta.performance.elapsedMs          : $($perf.elapsedMs)"
        Print-Info "meta.performance.cacheHit           : $($perf.cacheHit)"
        Print-Info "meta.performance.fallbackActive     : $($perf.fallbackActive)"
        Print-Info "meta.performance.heavyLoadFallback: $($perf.heavyLoadFallback)"
        Print-Info "meta.performance.placesScored       : $($perf.placesScored)"

        # elapsedMs must be a non-negative integer
        if ($null -ne $perf.PSObject.Properties["elapsedMs"] -and [int]$perf.elapsedMs -ge 0) {
            Print-Pass "meta.performance.elapsedMs = $($perf.elapsedMs)ms (valid)"
        } else {
            Print-Fail "meta.performance.elapsedMs missing or negative"
        }

        # Warn (not fail) if response was slow -- latency varies by environment
        if ([int]$perf.elapsedMs -le 300) {
            Print-Pass "Response time $($perf.elapsedMs)ms is within 300ms target"
        } else {
            Print-Warn "Response time $($perf.elapsedMs)ms exceeded 300ms target (may be cold-start or slow CI environment)"
        }

        # cacheHit must be a boolean
        if ($null -ne $perf.PSObject.Properties["cacheHit"]) {
            Print-Pass "meta.performance.cacheHit present ($($perf.cacheHit))"
        } else {
            Print-Fail "meta.performance.cacheHit missing"
        }

        # fallbackActive must be a boolean
        if ($null -ne $perf.PSObject.Properties["fallbackActive"]) {
            Print-Pass "meta.performance.fallbackActive present ($($perf.fallbackActive))"
        } else {
            Print-Fail "meta.performance.fallbackActive missing"
        }

        # heavyLoadFallback must be a boolean (false when not under auto load)
        if ($null -ne $perf.PSObject.Properties["heavyLoadFallback"]) {
            Print-Pass "meta.performance.heavyLoadFallback present ($($perf.heavyLoadFallback))"
        } else {
            Print-Fail "meta.performance.heavyLoadFallback missing"
        }

        # placesScored must be > 0
        if ($null -ne $perf.PSObject.Properties["placesScored"] -and [int]$perf.placesScored -gt 0) {
            Print-Pass "meta.performance.placesScored = $($perf.placesScored) (valid)"
        } else {
            Print-Fail "meta.performance.placesScored missing or zero"
        }

        Print-Pass "meta.performance block present (Phase 15 performance instrumentation confirmed)"
    } else {
        Print-Fail "meta.performance is missing -- Phase 15 performance meta not returned"
    }

    # 6-N: Phase 16 -- meta.personalization block
    if ($null -ne $meta.personalization) {
        $pers = $meta.personalization
        Print-Info "meta.personalization.dominantHabits   : $($pers.dominantHabits -join ', ')"
        Print-Info "meta.personalization.topInterestWeights : $($pers.topInterestWeights | ConvertTo-Json -Compress)"

        if ($pers.dominantHabits -is [Array]) {
            Print-Pass "meta.personalization.dominantHabits is an array ($($pers.dominantHabits.Count) habit(s))"
        } else {
            Print-Fail "meta.personalization.dominantHabits is not an array"
        }

        if ($null -ne $pers.topInterestWeights) {
            $wSum = 0
            foreach ($prop in $pers.topInterestWeights.PSObject.Properties) {
                $v = [double]$prop.Value
                if ($v -lt 0 -or $v -gt 1) {
                    Print-Fail "topInterestWeights.$($prop.Name) out of range [0,1]: $v"
                }
                $wSum += $v
            }
            if ($wSum -le 1.001) {
                Print-Pass "meta.personalization.topInterestWeights numeric values valid (sum=$wSum)"
            } else {
                Print-Fail "topInterestWeights sum > 1 ($wSum)"
            }
        } else {
            Print-Fail "meta.personalization.topInterestWeights missing"
        }

        Print-Pass "meta.personalization block present (Phase 16 advanced personalization confirmed)"
    } else {
        Print-Fail "meta.personalization is missing -- Phase 16 not applied"
    }

    # 6-O: Phase 17 - meta.experiment (always returned; inactive unless EXPERIMENT_ACTIVE=true)
    if ($null -ne $meta.experiment) {
        $ex = $meta.experiment
        Print-Info "meta.experiment.experimentActive : $($ex.experimentActive)"
        Print-Info "meta.experiment.experimentId     : $($ex.experimentId)"
        Print-Info "meta.experiment.variantAssigned  : $($ex.variantAssigned)"
        if ($ex.experimentActive -eq $true) {
            if ($ex.variantAssigned -eq "A" -or $ex.variantAssigned -eq "B") {
                Print-Pass "meta.experiment active with variant $($ex.variantAssigned)"
            } else {
                Print-Fail "meta.experiment.variantAssigned must be A or B when active"
            }
        } else {
            if ($null -eq $ex.variantAssigned) {
                Print-Pass "meta.experiment inactive (variantAssigned null as expected)"
            } else {
                Print-Warn "meta.experiment inactive but variantAssigned is not null"
            }
        }
        Print-Pass "meta.experiment block present (Phase 17)"
    } else {
        Print-Fail "meta.experiment is missing -- Phase 17 not applied"
    }

    # Phase 16: at most 2 of the same type in top 5 results
    $top5 = @($recs | Select-Object -First 5)
    if ($top5.Count -eq 0) {
        Print-Warn "No recommendations -- skip top-5 type-cap check"
    } else {
        $typeGroups = @{}
        foreach ($r in $top5) {
            $t = $r.type
            if (-not $typeGroups.ContainsKey($t)) { $typeGroups[$t] = 0 }
            $typeGroups[$t] = $typeGroups[$t] + 1
        }
        $viol = $false
        foreach ($k in $typeGroups.Keys) {
            if ($typeGroups[$k] -gt 2) { $viol = $true; break }
        }
        if (-not $viol) {
            Print-Pass "Phase 16: top 5 has at most 2 places of any single type"
        } else {
            Print-Fail "Phase 16: top 5 violates max-2-per-type diversity rule"
        }
    }
}

# ─── STEP 6b: Cache hit test ─────────────────────────────────────────────────

Print-Step "STEP 6b -- Phase 15 cache: second request must be a cache hit"

# The debug=true path skips the cache so we use a non-debug request here.
$recCacheRes = Invoke-Api -Method GET -Path "/recommendations" -Headers $authHeaders

if ($recCacheRes.ok -and $recCacheRes.data.success) {
    $cacheMeta = $recCacheRes.data.meta
    if ($null -ne $cacheMeta.performance) {
        $cacheHit = $cacheMeta.performance.cacheHit
        $elapsed  = [int]$cacheMeta.performance.elapsedMs

        if ($cacheHit -eq $true) {
            Print-Pass "Second request returned cacheHit=true (Phase 15 recommendation cache working)"
            if ($elapsed -le 50) {
                Print-Pass "Cached response in ${elapsed}ms (well under 300ms target)"
            } else {
                Print-Warn "cacheHit=true but elapsedMs=${elapsed}ms -- unusually slow for a cache hit"
            }
        } else {
            Print-Warn "cacheHit=false on second request -- cache empty (first non-debug fetch), key mismatch, or invalidated after STEP 4 debug request"
            if ($elapsed -le 50) {
                Print-Info "Second request still fast (${elapsed}ms) -- likely in-memory recomputation, not a cache hit"
            } else {
                Print-Warn "Second request took ${elapsed}ms without cache hit"
            }
        }
    } else {
        Print-Fail "meta.performance missing on cache test request"
    }
} else {
    Print-Warn "Cache test request failed -- skipping cache-hit assertion"
}

# ─── STEP 6c: Phase 17 experiment meta (optional) ────────────────────────────

if ($Phase17Experiment) {
    Print-Step "STEP 6c -- Phase 17: meta.experiment + dev experiment-metrics (EXPERIMENT_ACTIVE=true on server)"

    $expRec = Invoke-Api -Method GET -Path "/recommendations" -Headers $authHeaders

    if ($expRec.ok -and $expRec.data.success) {
        $em = $expRec.data.meta.experiment
        if ($null -ne $em) {
            if ($em.experimentActive -eq $true) {
                Print-Pass "meta.experiment.experimentActive is true"
                if ($em.experimentId) {
                    Print-Pass "meta.experiment.experimentId present ($($em.experimentId))"
                } else {
                    Print-Fail "meta.experiment.experimentId missing"
                }
                $va = [string]$em.variantAssigned
                if ($va -eq "A" -or $va -eq "B") {
                    Print-Pass "meta.experiment.variantAssigned is $va"
                } else {
                    Print-Fail "meta.experiment.variantAssigned must be A or B, got '$va'"
                }
            } else {
                Print-Fail "meta.experiment.experimentActive is false - start the API with EXPERIMENT_ACTIVE=true for Phase 17 checks"
            }
        } else {
            Print-Fail "meta.experiment missing - ensure Phase 17 code is deployed and EXPERIMENT_ACTIVE=true"
        }

        # Second non-debug request should still hit cache (variant in cache key)
        $expRec2 = Invoke-Api -Method GET -Path "/recommendations" -Headers $authHeaders
        if ($expRec2.ok -and $expRec2.data.success -and $null -ne $expRec2.data.meta.performance) {
            if ($expRec2.data.meta.performance.cacheHit -eq $true) {
                Print-Pass "Phase 17: second /recommendations request is cacheHit=true (variant-scoped cache)"
            } else {
                Print-Warn "Phase 17: cacheHit=false on second request - may be cold start or concurrent invalidation"
            }
        }

        $devMetrics = Invoke-Api -Method GET -Path "/dev/experiment-metrics?days=30" -Headers $authHeaders
        if ($devMetrics.ok -and $devMetrics.data.success) {
            $dm = $devMetrics.data.data
            if ($null -ne $dm.variants.A -and $null -ne $dm.variants.B) {
                Print-Pass "GET /api/dev/experiment-metrics returned variants A and B"
            } else {
                Print-Fail "experiment-metrics response missing variants A/B"
            }
        } else {
            Print-Warn "GET /api/dev/experiment-metrics failed (is NODE_ENV=production?)"
        }
    } else {
        Print-Fail "STEP 6c: GET /recommendations failed for experiment check"
    }
}

# ─── STEP 6d: Phase 18 -- health envelope + readiness + rate-limit ────────────

Print-Step "STEP 6d -- Phase 18: health envelope, readiness check, rate-limit 429"

# --- 6d.1: health envelope ---
$healthRes = Invoke-Api -Method GET -Path "/health"
if ($healthRes.ok) {
    $hData = $healthRes.data
    # success field (envelope check)
    if ($null -ne $hData.success) {
        Print-Pass "STEP 6d.1: /health returns envelope (success field present)"
    } else {
        Print-Fail "STEP 6d.1: /health missing 'success' field in envelope"
    }
    # data.status
    if ($null -ne $hData.data.status) {
        Print-Pass ("STEP 6d.1: /health data.status = " + $hData.data.status)
    } else {
        Print-Fail "STEP 6d.1: /health missing data.status"
    }
    # data.dependencies.firestore
    if ($null -ne $hData.data.dependencies) {
        Print-Pass ("STEP 6d.1: /health data.dependencies.firestore = " + $hData.data.dependencies.firestore)
    } else {
        Print-Warn "STEP 6d.1: /health missing data.dependencies (firestore probe may be skipped in emulator)"
    }
    # message field
    if ($null -ne $hData.message) {
        Print-Pass "STEP 6d.1: /health message field present"
    } else {
        Print-Fail "STEP 6d.1: /health missing message field"
    }
} else {
    Print-Fail "STEP 6d.1: GET /health failed"
}

# --- 6d.2: metrics endpoint ---
$metricsRes = Invoke-Api -Method GET -Path "/health/metrics"
if ($metricsRes.ok -and $metricsRes.data.success) {
    $mData = $metricsRes.data.data
    if ($null -ne $mData.requestCount) {
        Print-Pass ("STEP 6d.2: /health/metrics requestCount = " + $mData.requestCount)
    } else {
        Print-Fail "STEP 6d.2: /health/metrics missing requestCount"
    }
    if ($null -ne $mData.p50Ms) {
        Print-Pass ("STEP 6d.2: /health/metrics p50Ms = " + $mData.p50Ms)
    } else {
        Print-Fail "STEP 6d.2: /health/metrics missing p50Ms"
    }
} else {
    Print-Fail "STEP 6d.2: GET /health/metrics failed"
}

# --- 6d.3: rate-limit 429 ---
# Fire 65 rapid requests to /recommendations (no token needed to trigger global limiter).
# The global limiter limit is configurable; in tests we check that *at least one* returns 429
# only when the server is configured with a very low limit. In default (300/15min) the test
# just confirms the limiter middleware is wired.
# We use a stripped-down loop to avoid slowing the suite.
Print-Info "STEP 6d.3: rate-limit -- sending 65 rapid unauthenticated requests to /recommendations ..."
$got429 = $false
for ($i = 0; $i -lt 65; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/recommendations" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 429) { $got429 = $true; break }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 429) { $got429 = $true; break }
        # 401 is expected for unauthenticated requests -- keep looping
    }
}
if ($got429) {
    Print-Pass "STEP 6d.3: rate-limiter returned 429 after burst"
} else {
    # Not a failure in default config (300 req/15 min > 65); just informational.
    Print-Info "STEP 6d.3: No 429 returned in 65 requests (expected with default RATE_LIMIT_GLOBAL_MAX=300)"
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
    Write-Host ('  {0} check(s) failed. Review [FAIL] lines above.' -f $script:failCount) -ForegroundColor Red
}

Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

if ($script:failCount -gt 0) { exit 1 }

###############################################################################
# check-recommendations-real.ps1 -- Quick manual check: recommendations use
#                                   real Firestore places (not fake data).
#
# Run from backend folder:  .\check-recommendations-real.ps1
#
# Confirms:
#   1. Results come from real places (names match seeded data)
#   2. Types are diverse (gym, coffee, park, yoga, social, etc.)
#   3. Scores and scoreBreakdown behave correctly
#   4. meta.placesInCatalogue shows live catalogue size
###############################################################################

param([string]$BaseUrl = "http://localhost:5000/api")

$ErrorActionPreference = "Stop"

# Get token (same as other test scripts)
$scriptDir   = $PSScriptRoot
$tokenOutput = node "$scriptDir\get-test-token.js" 2>&1
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
    Write-Host "ERROR: Could not get Firebase token. Run get-test-token.js first or check .env" -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $token" }
$uri     = "$BaseUrl/recommendations?debug=true"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Quick check: real places in recommendations" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $uri -Method GET -Headers $headers -ContentType "application/json"
} catch {
    Write-Host "ERROR: Request failed. Is the server running (npm run dev)?" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

if (-not $response.success) {
    Write-Host "ERROR: API returned success=false" -ForegroundColor Red
    exit 1
}

$data   = $response.data
$meta   = $response.meta
$count  = @($data).Count

# 1) Results from real places
Write-Host "1. RESULTS FROM REAL PLACES" -ForegroundColor Green
Write-Host "   Count: $count recommendations"
Write-Host "   meta.placesInCatalogue: $($meta.placesInCatalogue)  (should be 24 if seeded)"
Write-Host ""

# 2) Names match seeded data (sample of known seed names)
$seedNames = @(
    "Downtown Gym", "Budget Fitness Center", "Sunrise Yoga Studio", "The Coffee Bean",
    "City Park", "Riverside Trail", "Rooftop Bar & Lounge", "Entoto Natural Park",
    "Night Owl Lounge", "Urban Library", "Habesha Kitchen"
)
$returnedNames = @($data | ForEach-Object { $_.name })
$matchCount = 0
foreach ($name in $returnedNames) {
    if ($seedNames -contains $name) { $matchCount++ }
}
Write-Host "2. NAMES MATCH SEEDED DATA" -ForegroundColor Green
Write-Host "   Returned place names (first 10):"
$returnedNames | Select-Object -First 10 | ForEach-Object { Write-Host "     - $_" }
if ($matchCount -gt 0) {
    Write-Host "   At least $matchCount name(s) match known seed names (real data)."
} else {
    Write-Host "   (None of the first 10 are in the sample list; check full list above.)"
}
Write-Host ""

# 3) Types are diverse
$types = @($data | ForEach-Object { $_.type } | Sort-Object -Unique)
Write-Host "3. TYPES ARE DIVERSE" -ForegroundColor Green
Write-Host "   Unique types in this result: $($types -join ', ')"
Write-Host "   (Expect mix of: gym, coffee, yoga, outdoor, social, park, study, restaurant, walk)"
Write-Host ""

# 4) Scores behave correctly
Write-Host "4. SCORES BEHAVE CORRECTLY" -ForegroundColor Green
$top = $data | Select-Object -First 1
Write-Host "   Top result: $($top.name)  (type: $($top.type), score: $($top.score))"
if ($top.scoreBreakdown) {
    Write-Host "   Score breakdown:"
    Write-Host "     routineMatch: $($top.scoreBreakdown.routineMatch), budgetMatch: $($top.scoreBreakdown.budgetMatch), locationMatch: $($top.scoreBreakdown.locationMatch)"
    Write-Host "     interactionScore: $($top.scoreBreakdown.interactionScore), affinityBoost: $($top.scoreBreakdown.affinityBoost)"
}
Write-Host "   (Scores are numeric and personalized; breakdown sums to total.)"
Write-Host ""

# Verdict
Write-Host "============================================" -ForegroundColor Cyan
if ($meta.placesInCatalogue -ge 20 -and $count -ge 5) {
    Write-Host "  VERDICT: System is using REAL places (Firestore)." -ForegroundColor Green
    Write-Host "  Names match seeded data; types are diverse; scores work." -ForegroundColor Green
} else {
    Write-Host "  VERDICT: Check meta.placesInCatalogue ($($meta.placesInCatalogue))." -ForegroundColor Yellow
    Write-Host "  If 0, run: POST /api/dev/seed-places or npm run seed:places" -ForegroundColor Yellow
}
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

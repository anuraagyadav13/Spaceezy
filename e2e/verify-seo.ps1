# verify-seo.ps1 - SEO / brand-sitelink E2E suite for the SpaceEzy public site.
# Run:  powershell -ExecutionPolicy Bypass -File e2e\verify-seo.ps1
# Env:  E2E_WEB_BASE (default http://localhost:3000), E2E_API_BASE (default http://localhost:8000/api/v1)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WEB = if ($env:E2E_WEB_BASE) { $env:E2E_WEB_BASE.TrimEnd('/') } else { "http://localhost:3000" }
$API = if ($env:E2E_API_BASE) { $env:E2E_API_BASE.TrimEnd('/') } else { "http://localhost:8000/api/v1" }

$script:pass = 0
$script:fail = 0
$script:failures = @()

function Assert($cond, $name, $detail = "") {
    if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
    else {
        $script:fail++
        $script:failures += $name
        Write-Host "  FAIL  $name  $detail" -ForegroundColor Red
    }
}

function Get-Page($url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45
        return @{ status = $r.StatusCode; html = $r.Content }
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        return @{ status = $code; html = "" }
    }
}

function Get-Api($path) {
    try {
        $r = Invoke-WebRequest -Uri "$API$path" -UseBasicParsing -TimeoutSec 30
        $j = $r.Content | ConvertFrom-Json
        if ($j.success) { return $j.data }
    } catch { }
    return $null
}

function Get-Title($html) {
    $m = [regex]::Match($html, '<title>(.*?)</title>', 'Singleline')
    if ($m.Success) { return [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value).Trim() }
    return ""
}

function Get-Meta($html, $key) {
    $m = [regex]::Match($html, "<meta\s+(?:name|property)=`"$key`"\s+content=`"([^`"]*)`"")
    if ($m.Success) { return $m.Groups[1].Value }
    $m2 = [regex]::Match($html, "<meta\s+content=`"([^`"]*)`"\s+(?:name|property)=`"$key`"")
    if ($m2.Success) { return $m2.Groups[1].Value }
    return $null
}

function Get-Canonical($html) {
    $m = [regex]::Match($html, '<link rel="canonical" href="([^"]+)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

function Get-H1s($html) {
    $list = @()
    foreach ($m in [regex]::Matches($html, '<h1[^>]*>(.*?)</h1>', 'Singleline')) {
        $list += ([System.Net.WebUtility]::HtmlDecode(($m.Groups[1].Value -replace '<[^>]+>', ' ')) -replace '\s+', ' ').Trim()
    }
    return , $list
}

function Norm-Url($u) { return ($u -replace '/$', '') }

function Get-JsonLdBlocks($html) {
    $blocks = @()
    foreach ($m in [regex]::Matches($html, '<script type="application/ld\+json">(.*?)</script>', 'Singleline')) {
        $blocks += $m.Groups[1].Value
    }
    return , $blocks
}

function Test-JsonLd($html, $label) {
    $blocks = Get-JsonLdBlocks $html
    Assert ($blocks.Count -gt 0) "$label has JSON-LD block"
    foreach ($b in $blocks) {
        $ok = $true
        try { $null = $b | ConvertFrom-Json } catch { $ok = $false }
        Assert $ok "$label JSON-LD parses as JSON"
    }
    return $blocks
}

$corePages = @(
    "/",
    "/projects",
    "/properties",
    "/about",
    "/contact",
    "/properties-in-ghaziabad",
    "/properties-in-wave-city",
    "/flats-for-sale",
    "/plots-for-sale",
    "/commercial-properties",
    "/residential-properties"
)
$landingSlugs = @(
    "properties-in-ghaziabad", "properties-in-wave-city", "flats-for-sale", "plots-for-sale",
    "commercial-properties", "residential-properties", "flats-in-wave-city",
    "flats-for-sale-in-wave-city", "2-bhk-flats-in-wave-city", "3-bhk-flats-in-wave-city",
    "4-bhk-flats-in-wave-city", "plots-in-wave-city", "plots-for-sale-in-wave-city",
    "villas-in-wave-city", "commercial-property-in-wave-city", "property-for-sale-in-wave-city"
)

Write-Host "`n=== SpaceEzy SEO E2E ===" -ForegroundColor Cyan
Write-Host "WEB=$WEB  API=$API`n"

# Warm up ISR caches (hit twice, pages may revalidate in background).
foreach ($u in @("/", "/sitemap.xml", "/flats-for-sale")) { Get-Page "$WEB$u" | Out-Null }
Start-Sleep -Seconds 3

# ---------- 1. Homepage: title / H1 / content / links ----------
Write-Host "[1] Homepage brand + structure" -ForegroundColor Cyan
$homePg = Get-Page "$WEB/"
Assert ($homePg.status -eq 200) "home returns 200" "got $($homePg.status)"
$hTitle = Get-Title $homePg.html
Assert ($hTitle -eq ("SpaceEzy " + [char]0x2013 + " Real Estate Properties in Ghaziabad | Buy & Sell Property")) "home title exact per spec" "got: $hTitle"
$h1s = Get-H1s $homePg.html
Assert ($h1s.Count -eq 1) "home has exactly one H1" "got $($h1s.Count)"
Assert ($h1s.Count -ge 1 -and $h1s[0] -eq "Real Estate Properties in Ghaziabad") "home H1 = 'Real Estate Properties in Ghaziabad'" "got: $($h1s -join '|')"
$hCanon = Get-Canonical $homePg.html
Assert ($hCanon -and ((Norm-Url $hCanon) -eq "https://spaceezy.com")) "home canonical self-references spaceezy.com" "got: $hCanon"
$hDesc = Get-Meta $homePg.html "description"
Assert ($hDesc -and $hDesc.Length -gt 40) "home meta description present"
Assert ($homePg.html -notmatch 'name="keywords"') "home has no meta keywords tag"
Assert ((Get-Meta $homePg.html "og:title")) "home og:title present"
Assert ((Get-Meta $homePg.html "og:image")) "home og:image present"
Assert ((Get-Meta $homePg.html "twitter:card")) "home twitter card present"

$clusterLinks = @{
    "/properties-in-ghaziabad" = "Properties in Ghaziabad"
    "/properties-in-wave-city"  = "Properties in Wave City"
    "/flats-for-sale"           = "Flats for Sale"
    "/plots-for-sale"           = "Plots for Sale"
    "/commercial-properties"    = "Commercial Properties"
    "/residential-properties"   = "Residential Properties"
    "/projects"                 = "Projects"
}
foreach ($k in $clusterLinks.Keys) {
    Assert ($homePg.html -match ('href="' + [regex]::Escape($k) + '"')) "home links to $k"
}
$hLd = Test-JsonLd $homePg.html "home"
$joined = ($hLd -join "")
Assert ($joined -match '"Organization"') "home JSON-LD includes Organization"
Assert ($joined -match '"WebSite"') "home JSON-LD includes WebSite"
Assert ($joined -match '"RealEstateAgent"') "home JSON-LD includes RealEstateAgent"
Assert ($homePg.html -match '"addressLocality":"Ghaziabad"') "RealEstateAgent/Org address in Ghaziabad"

# ---------- 2. robots.txt ----------
Write-Host "[2] robots.txt" -ForegroundColor Cyan
$rb = Get-Page "$WEB/robots.txt"
Assert ($rb.status -eq 200) "robots.txt returns 200" "got $($rb.status)"
Assert ($rb.html -match 'Allow: /') "robots allows /"
Assert ($rb.html -match 'Disallow: /dashboard') "robots disallows /dashboard"
Assert ($rb.html -match 'Disallow: /login') "robots disallows /login"
Assert ($rb.html -match 'Disallow: /api') "robots disallows /api"
Assert ($rb.html -match 'Sitemap: https://spaceezy.com/sitemap.xml') "robots references absolute sitemap URL"

# ---------- 3. sitemap.xml ----------
Write-Host "[3] sitemap.xml" -ForegroundColor Cyan
$sm = Get-Page "$WEB/sitemap.xml"
Assert ($sm.status -eq 200) "sitemap returns 200" "got $($sm.status)"
$locs = @()
foreach ($m in [regex]::Matches($sm.html, '<loc>(.*?)</loc>')) { $locs += $m.Groups[1].Value }
Assert ($locs.Count -gt 5) "sitemap has entries" "got $($locs.Count)"
$locSet = @{}
foreach ($l in $locs) { $locSet[(Norm-Url $l)] = $true }
foreach ($p in @("/", "/projects", "/properties", "/about", "/contact")) {
    Assert ($locSet.ContainsKey((Norm-Url "https://spaceezy.com$p"))) "sitemap includes $p"
}
Assert (-not ($locs | Where-Object { $_ -match '/dashboard|/login' })) "sitemap excludes private routes"

# Published inventory consistency: sitemap URLs must come from the public API.
$apiProjects = Get-Api "/public/projects?limit=50"
$apiProps = Get-Api "/public/properties?limit=50"
$apiSlugs = @()
if ($apiProjects) { foreach ($i in $apiProjects.items) { $apiSlugs += $i.slug } }
$apiTokens = @()
if ($apiProps) { foreach ($i in $apiProps.items) { $apiTokens += $i.token } }
$sitemapProjectSlugs = @($locs | Where-Object { $_ -match '/projects/([^/]+)$' } | ForEach-Object { [regex]::Match($_, '/projects/([^/]+)$').Groups[1].Value })
$sitemapTokens = @($locs | Where-Object { $_ -match '/properties/([0-9a-f]+)$' } | ForEach-Object { [regex]::Match($_, '/properties/([0-9a-f]+)$').Groups[1].Value })
$leaked = @($sitemapProjectSlugs | Where-Object { $apiSlugs -notcontains $_ })
Assert ($leaked.Count -eq 0) "sitemap contains no unpublished project slugs" "leaked: $($leaked -join ',')"
$leaked2 = @($sitemapTokens | Where-Object { $apiTokens -notcontains $_ })
Assert ($leaked2.Count -eq 0) "sitemap contains no unpublished property tokens" "leaked: $($leaked2 -join ',')"
foreach ($s in $apiSlugs) { Assert ($sitemapProjectSlugs -contains $s) "sitemap includes published project $s" }

# ---------- 4. Core landing pages:200 / titles / canonicals / uniqueness ----------
Write-Host "[4] Landing pages" -ForegroundColor Cyan
$titles = @{}
$canonicals = @{}
$landingIndex = @{}
foreach ($p in $corePages) {
    $pg = Get-Page "$WEB$p"
    Assert ($pg.status -eq 200) "$p returns 200" "got $($pg.status)"
    $t = Get-Title $pg.html
    Assert ($t.Length -gt 10) "$p has a title" "got '$t'"
    if ($titles.ContainsKey($t)) { Assert $false "$p title unique" "duplicate of $($titles[$t])" }
    else { $titles[$t] = $p; Assert $true "$p title unique" }
    $c = Get-Canonical $pg.html
    Assert ($c -and ((Norm-Url $c) -eq (Norm-Url "https://spaceezy.com$p"))) "$p canonical self-references" "got: $c"
    if ($c) {
        $cn = Norm-Url $c
        if ($canonicals.ContainsKey($cn)) { Assert $false "$p no duplicate canonical" "dup with $($canonicals[$cn])" }
        else { $canonicals[$cn] = $p; Assert $true "$p no duplicate canonical" }
    }
    $robotsMeta = Get-Meta $pg.html "robots"
    $isNoindex = ($robotsMeta -and $robotsMeta -match 'noindex')
    $landingIndex[$p] = -not $isNoindex
    Assert ((Get-Meta $pg.html "description")) "$p meta description present"
    Assert ($pg.html -match 'og:title') "$p og:title present"
    $h1x = Get-H1s $pg.html
    Assert ($h1x.Count -eq 1) "$p exactly one H1" "got $($h1x.Count)"
    Assert ($pg.html -notmatch 'name="keywords"') "$p has no meta keywords"
}

# Sitemap <-> indexability consistency for every landing page.
foreach ($slug in $landingSlugs) {
    $path = "/$slug"
    $inSitemap = $locSet.ContainsKey("https://spaceezy.com$path")
    $pg = Get-Page "$WEB$path"
    Assert ($pg.status -eq 200) "$path returns 200 (even if empty)" "got $($pg.status)"
    $robotsMeta = Get-Meta $pg.html "robots"
    $isNoindex = ($robotsMeta -and $robotsMeta -match 'noindex')
    if ($inSitemap) {
        Assert (-not $isNoindex) "$path is indexable and in sitemap" "has noindex despite sitemap"
        Assert ($pg.html -match 'href="/properties/|href="/projects/') "$path in sitemap renders real inventory"
    } else {
        # Not in sitemap: either noindex (empty) - verify honest empty state.
        Assert ($isNoindex) "$path empty pages are noindex" "not in sitemap but indexable"
        if ($slug -in @("properties-in-ghaziabad", "properties-in-wave-city")) {
            # Only assert visible empty-state text when the CRM truly has no matching inventory.
            Assert ($pg.html -match 'No live listings here yet' -or $pg.html -match 'href="/properties/') "$path shows honest empty state or inventory"
        }
    }
}

# ---------- 5. Adaptive inventory behaviour ----------
Write-Host "[5] Adaptive inventory" -ForegroundColor Cyan
$fh = Get-Page "$WEB/flats-for-sale"
$fhRobots = Get-Meta $fh.html "robots"
Assert (-not ($fhRobots -and $fhRobots -match 'noindex')) -name "/flats-for-sale indexable (published flats exist)" -detail "got $fhRobots"
Assert (([regex]::Matches($fh.html, 'href="/properties/')).Count -gt 0) "/flats-for-sale renders property cards"
$fhBlocks = Get-JsonLdBlocks $fh.html
$fhJoined = ($fhBlocks -join "")
Assert ($fhJoined -match '"BreadcrumbList"') "/flats-for-sale has BreadcrumbList JSON-LD"
Assert ($fhJoined -match '"WebPage"') "/flats-for-sale has WebPage JSON-LD"

# ---------- 6. Private routes noindex ----------
Write-Host "[6] Private routes" -ForegroundColor Cyan
foreach ($p in @("/login", "/dashboard")) {
    $pg = Get-Page "$WEB$p"
    Assert ($pg.status -eq 200) "$p returns 200" "got $($pg.status)"
    $rm = Get-Meta $pg.html "robots"
    Assert ($rm -and $rm -match 'noindex') "$p meta robots noindex" "got: $rm"
}

# ---------- 7. Nav + footer link integrity ----------
Write-Host "[7] Crawlable navigation" -ForegroundColor Cyan
$navHrefs = @()
foreach ($m in [regex]::Matches($homePg.html, '<a[^>]+href="(/[^"#?]*)"')) { $navHrefs += $m.Groups[1].Value }
$navHrefs = $navHrefs | Sort-Object -Unique
$requiredNav = @("/properties", "/projects", "/search", "/about", "/contact",
    "/residential-properties", "/commercial-properties", "/flats-for-sale", "/plots-for-sale",
    "/properties-in-ghaziabad", "/properties-in-wave-city")
foreach ($n in $requiredNav) { Assert ($navHrefs -contains $n) "nav/footer exposes $n" }
$footerBits = @("Properties in Ghaziabad", "Properties in Wave City", "Flats for Sale", "Plots for Sale", "Commercial Properties", "About SpaceEzy", "Contact SpaceEzy")
foreach ($b in $footerBits) { Assert ($homePg.html -match [regex]::Escape($b)) "footer shows '$b'" }

# Every internal link discovered on the homepage must resolve.
$uniqueLinks = $navHrefs | Sort-Object -Unique
foreach ($l in $uniqueLinks) {
    $r = Get-Page "$WEB$l"
    Assert ($r.status -eq 200) "internal link $l resolves" "got $($r.status)"
}

# ---------- 8. Project & property detail pages ----------
Write-Host "[8] Detail pages" -ForegroundColor Cyan
$projSlug = $sitemapProjectSlugs | Select-Object -First 1
Assert ($projSlug) "sitemap has at least one project"
if ($projSlug) {
    $pp = Get-Page "$WEB/projects/$projSlug"
    Assert ($pp.status -eq 200) "project page 200" "got $($pp.status)"
    Assert ((Get-Canonical $pp.html)) "project page canonical present"
    $ppLd = Get-JsonLdBlocks $pp.html
    $ppJoined = ($ppLd -join "")
    Assert ($ppJoined -match '"BreadcrumbList"') "project page BreadcrumbList JSON-LD"
    Assert ($pp.html -match 'Frequently asked questions') "project page renders FAQ section"
    Assert ($ppJoined -match '"FAQPage"') "project page FAQPage JSON-LD"
    $ph1 = Get-H1s $pp.html
    Assert ($ph1.Count -eq 1) "project page one H1" "got $($ph1.Count)"
}
$tok = $sitemapTokens | Select-Object -First 1
Assert ($tok) "sitemap has at least one property"
if ($tok) {
    $pr = Get-Page "$WEB/properties/$tok"
    Assert ($pr.status -eq 200) "property page 200" "got $($pr.status)"
    $prCanon = Get-Canonical $pr.html
    Assert ($prCanon -and ((Norm-Url $prCanon) -eq (Norm-Url "https://spaceezy.com/properties/$tok"))) "property canonical self" "got $prCanon"
    $prLd = Get-JsonLdBlocks $pr.html
    $prJoined = ($prLd -join "")
    Assert ($prJoined -match '"BreadcrumbList"') "property BreadcrumbList JSON-LD"
    Assert ($prJoined -match '"Residence"|"RealEstateListing"') "property Residence/Listing JSON-LD"
    Assert ($pr.html -match 'href="/properties/') "property page links to sibling units"
    $prH1 = Get-H1s $pr.html
    Assert ($prH1.Count -eq 1) "property page one H1" "got $($prH1.Count)"
}

# ---------- 9. Brand consistency ----------
Write-Host "[9] Brand consistency" -ForegroundColor Cyan
foreach ($p in @("/", "/about", "/contact", "/properties-in-wave-city")) {
    $pg = Get-Page "$WEB$p"
    Assert ($pg.html -notmatch 'localhost:3000" rel="canonical"|localhost:8000') "$p leaks no localhost canonical"
}
$about = Get-Page "$WEB/about"
Assert ((Get-Title $about.html) -like "*SpaceEzy*") "about title carries SpaceEzy brand" "got $(Get-Title $about.html)"
$contact = Get-Page "$WEB/contact"
Assert ($contact.html -match 'admin@spaceezy.com') "contact shows official email"
Assert ($contact.html -match '7827267897|78272 67897') "contact shows official phone"

# ---------- Summary ----------
Write-Host ""
Write-Host "=== RESULT: $script:pass passed, $script:fail failed ===" -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
if ($script:fail -gt 0) {
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  - $f" -ForegroundColor Red }
    exit 1
}
exit 0



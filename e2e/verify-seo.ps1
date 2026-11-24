# verify-seo.ps1 - SEO / brand-sitelink E2E suite for the Spaceezy public site.
# Run:  powershell -ExecutionPolicy Bypass -File e2e\verify-seo.ps1
# Env:  E2E_WEB_BASE (default http://localhost:3000), E2E_API_BASE (default http://localhost:8000/api/v1)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WEB = if ($env:E2E_WEB_BASE) { $env:E2E_WEB_BASE.TrimEnd('/') } else { "http://localhost:3000" }
$API = if ($env:E2E_API_BASE) { $env:E2E_API_BASE.TrimEnd('/') } else { "http://localhost:8000/api/v1" }
# Canonical origin the app emits (NEXT_PUBLIC_SITE_URL). Override when testing
# a staging build; production falls back to the primary domain.
$ORIGIN = if ($env:E2E_SITE_ORIGIN) { $env:E2E_SITE_ORIGIN.TrimEnd('/') } else { "https://spaceezy.com" }

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
    "/flats-for-sale",
    "/residential-properties"
)
# Data-driven hubs are discovered from the sitemap (section 3) so the suite
# works against any database, not one particular city. Empty categories still
# answer 200 but are noindex and absent from the sitemap.
$landingSlugs = @(
    "flats-for-sale", "plots-for-sale", "commercial-properties", "residential-properties"
)
$legacyMap = [ordered]@{}
$legacyPlace = ""

Write-Host "`n=== Spaceezy SEO E2E ===" -ForegroundColor Cyan
Write-Host "WEB=$WEB  API=$API`n"

# Warm up ISR caches (hit twice, pages may revalidate in background).
foreach ($u in @("/", "/sitemap.xml", "/flats-for-sale")) { Get-Page "$WEB$u" | Out-Null }
Start-Sleep -Seconds 3

# ---------- 1. Homepage: title / H1 / content / links ----------
Write-Host "[1] Homepage brand + structure" -ForegroundColor Cyan
$homePg = Get-Page "$WEB/"
Assert ($homePg.status -eq 200) "home returns 200" "got $($homePg.status)"
$hTitle = Get-Title $homePg.html
Assert ($hTitle -eq "Spaceezy | Premium Real Estate") "home title = brand default (<=60 chars)" "got: $hTitle"
$h1s = Get-H1s $homePg.html
Assert ($h1s.Count -eq 1) "home has exactly one H1" "got $($h1s.Count)"
Assert ($h1s.Count -ge 1 -and $h1s[0] -like "Real Estate Properties*") "home H1 = 'Real Estate Properties ...'" "got: $($h1s -join '|')"
$hCanon = Get-Canonical $homePg.html
Assert ($hCanon -and ((Norm-Url $hCanon) -eq $ORIGIN)) "home canonical self-references spaceezy.com" "got: $hCanon"
$hDesc = Get-Meta $homePg.html "description"
Assert ($hDesc -and $hDesc.Length -gt 40) "home meta description present"
Assert ($homePg.html -notmatch 'name="keywords"') "home has no meta keywords tag"
Assert ((Get-Meta $homePg.html "og:title")) "home og:title present"
Assert ((Get-Meta $homePg.html "og:image")) "home og:image present"
Assert ((Get-Meta $homePg.html "twitter:card")) "home twitter card present"

$clusterLinks = @{
    "/projects"   = "Projects"
    "/properties" = "Properties"
}
foreach ($k in $clusterLinks.Keys) {
    Assert ($homePg.html -match ('href="' + [regex]::Escape($k) + '"')) "home links to $k"
}
# Hub links are generated from the live registry: at least one location hub and
# one category hub must be reachable from the home page when they are indexable.
Assert (([regex]::Matches($homePg.html, 'href="/(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-[a-z0-9-]+"')).Count -gt 0) "home links to a location hub"
Assert (([regex]::Matches($homePg.html, 'href="/(flats|plots)-for-sale"')).Count -gt 0) "home links to a category hub"
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
Assert ($rb.html -notmatch 'Disallow:\s*/(search|enquiry)') "robots keeps utility pages crawlable for noindex"
Assert ($rb.html -match '(?i)Disallow:.*(sort=|page=|minPrice=)') "robots still disallows filter params"
Assert ($rb.html -match ('Sitemap: ' + [regex]::Escape("$ORIGIN/sitemap.xml"))) "robots references absolute sitemap URL"

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
    Assert ($locSet.ContainsKey((Norm-Url "$ORIGIN$p"))) "sitemap includes $p"
}
Assert (-not ($locs | Where-Object { $_ -match '/dashboard|/login' })) "sitemap excludes private routes"

# Discover generated hubs + a real place for the retired-alias checks.
foreach ($loc in $locs) {
    $path = ([uri]$loc).AbsolutePath.TrimStart('/')
    if ($path -match '^(properties|flats|plots|villas|commercial-property)-in-[a-z0-9-]+$' -or
        $path -match '^[0-9]+-bhk-flats-in-[a-z0-9-]+$') {
        if ($landingSlugs -notcontains $path) { $landingSlugs += $path }
        if (-not $legacyPlace -and $path -match '^(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-(.+)$') { $legacyPlace = $matches[1] }
    }
}
if ($legacyPlace) {
    $legacyMap["/flats-for-sale-in-$legacyPlace"] = "/flats-in-$legacyPlace"
    $legacyMap["/property-for-sale-in-$legacyPlace"] = "/properties-in-$legacyPlace"
}

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
# Note: the reverse direction (every published record in the sitemap) is no
# longer asserted here � records that fail the content-quality gate are
# intentionally noindex. Run `npm run seo:audit` to list them.

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
    $robotsMeta = Get-Meta $pg.html "robots"
    $isNoindex = ($robotsMeta -and $robotsMeta -match 'noindex')
    $landingIndex[$p] = -not $isNoindex
    if ((Norm-Url $c) -ne (Norm-Url "$ORIGIN$p")) {
        # Duplicate-intent hubs canonicalise to the winner but stay crawlable
        # and indexable; only utility/gate failures use noindex.
        Assert (-not $isNoindex) "$p canonical-only hub is not noindex" "got $robotsMeta"
    } else {
        Assert (-not $isNoindex) "$p is indexable" "got $robotsMeta"
    }
    if ($c) {
        $cn = Norm-Url $c
        if ($cn -eq (Norm-Url "$ORIGIN$p")) {
            if ($canonicals.ContainsKey($cn)) { Assert $false "$p no duplicate canonical" "dup with $($canonicals[$cn])" }
            else { $canonicals[$cn] = $p; Assert $true "$p no duplicate canonical" }
        }
    }
    Assert ((Get-Meta $pg.html "description")) "$p meta description present"
    Assert ($pg.html -match 'og:title') "$p og:title present"
    $h1x = Get-H1s $pg.html
    Assert ($h1x.Count -eq 1) "$p exactly one H1" "got $($h1x.Count)"
    Assert ($pg.html -notmatch 'name="keywords"') "$p has no meta keywords"
}

# Sitemap <-> indexability consistency for every landing page.
foreach ($slug in $landingSlugs) {
    $path = "/$slug"
    $inSitemap = $locSet.ContainsKey("$ORIGIN$path")
    $pg = Get-Page "$WEB$path"
    Assert ($pg.status -eq 200) "$path returns 200 (even if empty)" "got $($pg.status)"
    $robotsMeta = Get-Meta $pg.html "robots"
    $isNoindex = ($robotsMeta -and $robotsMeta -match 'noindex')
    if ($inSitemap) {
        Assert (-not $isNoindex) "$path is indexable and in sitemap" "has noindex despite sitemap"
        Assert ($pg.html -match 'href="/properties/|href="/projects/') "$path in sitemap renders real inventory"
    } else {
        # Not in sitemap: either a canonical-only duplicate (not noindex) or a
        # noindex empty category. Verify the declared signal is honest.
        $c = Get-Canonical $pg.html
        $isCanonicalised = $c -and ((Norm-Url $c) -ne (Norm-Url "$ORIGIN$path"))
        Assert ($isNoindex -or $isCanonicalised) "$path is noindex or canonicalised" "not in sitemap with self-canonical and no noindex"
        if ($isCanonicalised) {
            Assert ($pg.html -match 'href="/properties/|href="/projects/') "$path canonicalised hub renders real inventory"
        } elseif ($slug -match '^(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-') {
            Assert ($pg.html -match 'No live listings here yet') "$path shows honest empty state"
        }
    }
}

# Retired URLs must answer with one permanent redirect to the canonical hub.
# curl is used with redirects disabled so we can assert the header itself,
# even when the destination hub is currently empty/noindex.
foreach ($old in $legacyMap.Keys) {
    $target = $legacyMap[$old]
    $line = & curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" "$WEB$old"
    $parts = ($line -split '\s+', 2)
    $code = if ($parts.Length -gt 0) { $parts[0] } else { "" }
    $dest = if ($parts.Length -gt 1) { $parts[1] } else { "" }
    Assert ($code -in @("301", "308")) "retired $old uses a permanent redirect" "got $code"
    Assert ($dest -eq "$WEB$target") "retired $old redirects to $target" "got $dest"
}

# ---------- 5. Adaptive inventory behaviour ----------
Write-Host "[5] Adaptive inventory" -ForegroundColor Cyan
$fh = Get-Page "$WEB/flats-for-sale"
$fhRobots = Get-Meta $fh.html "robots"
$fhNoindex = [bool]($fhRobots -and $fhRobots -match 'noindex')
$fhInSitemap = $locSet.ContainsKey("$ORIGIN/flats-for-sale")
$fhCanon = Get-Canonical $fh.html
$fhCanonicalised = $fhCanon -and ((Norm-Url $fhCanon) -ne (Norm-Url "$ORIGIN/flats-for-sale"))
Assert ($fhInSitemap -or $fhCanonicalised -or $fhNoindex) "/flats-for-sale has a valid out-of-sitemap signal" "inSitemap=$fhInSitemap noindex=$fhNoindex canonicalised=$fhCanonicalised"
if ($fhInSitemap -or $fhCanonicalised) {
    Assert (([regex]::Matches($fh.html, 'href="/properties/')).Count -gt 0) "/flats-for-sale renders property cards"
} else {
    Assert ($fh.html -match 'No live listings here yet') "/flats-for-sale shows honest empty state"
}
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
foreach ($m in [regex]::Matches($homePg.html, '<a[^>]+href="(/[^"#?]*)"')) { $href = $m.Groups[1].Value; if ($href -notmatch '^/cdn-cgi/') { $navHrefs += $href } }
$navHrefs = $navHrefs | Sort-Object -Unique
# Static navigation is always present; hub links come from the data-driven
# registry and are only rendered when the hub is indexable.
$requiredNav = @("/properties", "/projects", "/about", "/contact")
foreach ($n in $requiredNav) { Assert ($navHrefs -contains $n) "nav/footer exposes $n" }
$footerBits = @("About Spaceezy", "Contact Spaceezy")
foreach ($b in $footerBits) { Assert ($homePg.html -match [regex]::Escape($b)) "footer shows '$b'" }
$indexableCategories = @($corePages | Where-Object { $_ -notin @("/", "/projects", "/properties", "/about", "/contact") -and $locSet.ContainsKey((Norm-Url "$ORIGIN$_")) })
foreach ($c in $indexableCategories) {
    Assert ($navHrefs -contains $c) "nav/footer exposes indexable hub $c"
}
$locationHubs = @($navHrefs | Where-Object { $_ -match '^/(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-[a-z0-9-]+$' })
$categoryHubs = @($navHrefs | Where-Object { $_ -in @("/flats-for-sale", "/plots-for-sale") })
if (@($locs | Where-Object { $_ -match '/(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-[a-z0-9-]+$' }).Count -gt 0) {
    Assert ($locationHubs.Count -gt 0) "footer exposes at least one location hub"
}
if ($locSet.ContainsKey("$ORIGIN/flats-for-sale")) {
    Assert ($categoryHubs.Count -gt 0) "footer exposes at least one category hub"
}

# Every internal link discovered on the homepage must resolve.
$uniqueLinks = $navHrefs | Sort-Object -Unique
foreach ($l in $uniqueLinks) {
    $r = Get-Page "$WEB$l"
    Assert ($r.status -eq 200) "internal link $l resolves" "got $($r.status)"
}

# ---------- 8. Project & property detail pages ----------
Write-Host "[8] Detail pages" -ForegroundColor Cyan
$projSlug = $sitemapProjectSlugs | Select-Object -First 1
if (-not $projSlug -and $apiSlugs.Count) { $projSlug = $apiSlugs[0] }
if ($projSlug) {
    $pp = Get-Page "$WEB/projects/$projSlug"
    Assert ($pp.status -eq 200) "project page 200" "got $($pp.status)"
    Assert ((Get-Canonical $pp.html)) "project page canonical present"
    $ppLd = Get-JsonLdBlocks $pp.html
    $ppJoined = ($ppLd -join "")
    Assert ($ppJoined -match '"BreadcrumbList"') "project page BreadcrumbList JSON-LD"
    $hasVisibleFaq = $pp.html -match 'Frequently asked questions'
    Assert ($hasVisibleFaq -eq ($ppJoined -match '"FAQPage"')) "project FAQ markup matches visible FAQ" "visible=$hasVisibleFaq"
    $ph1 = Get-H1s $pp.html
    Assert ($ph1.Count -eq 1) "project page one H1" "got $($ph1.Count)"
}
$tok = $sitemapTokens | Select-Object -First 1
if (-not $tok -and $apiProps) {
    $available = @($apiProps.items | Where-Object { $_.availability -ne "Sold" } | Select-Object -First 1)
    if ($available.Count) { $tok = $available[0].token }
}
if ($tok) {
    $pr = Get-Page "$WEB/properties/$tok"
    Assert ($pr.status -eq 200) "property page 200" "got $($pr.status)"
    $prCanon = Get-Canonical $pr.html
    Assert ($prCanon -and ((Norm-Url $prCanon) -eq (Norm-Url "$ORIGIN/properties/$tok"))) "property canonical self" "got $prCanon"
    $prLd = Get-JsonLdBlocks $pr.html
    $prJoined = ($prLd -join "")
    Assert ($prJoined -match '"BreadcrumbList"') "property BreadcrumbList JSON-LD"
    Assert ($prJoined -match '"Residence"|"RealEstateListing"') "property Residence/Listing JSON-LD"
    Assert ($pr.html -match 'href="/properties/|href="/properties"|href="/projects/') "property page links back to inventory"
    $prH1 = Get-H1s $pr.html
    Assert ($prH1.Count -eq 1) "property page one H1" "got $($prH1.Count)"
}

# ---------- 9. Brand consistency ----------
Write-Host "[9] Brand consistency" -ForegroundColor Cyan
$brandPaths = @("/", "/about", "/contact")
$firstHub = @($landingSlugs | Where-Object { $_ -match '^(?:properties|flats|plots|villas|commercial-property|[0-9]+-bhk-flats)-in-' } | Select-Object -First 1)
if ($firstHub.Count) { $brandPaths += "/$($firstHub[0])" }
foreach ($p in $brandPaths) {
    $pg = Get-Page "$WEB$p"
    Assert ($pg.html -notmatch 'localhost:3000" rel="canonical"|localhost:8000') "$p leaks no localhost canonical"
}
$about = Get-Page "$WEB/about"
Assert ((Get-Title $about.html) -like "*Spaceezy*") "about title carries Spaceezy brand" "got $(Get-Title $about.html)"
$contact = Get-Page "$WEB/contact"
Assert ($contact.html -match 'mailto:[^"]+@') "contact shows an email link"
Assert ($contact.html -match 'tel:\+?[0-9]+') "contact shows a phone link"

# ---------- 10. Routing precedence, 404s and utility pages ----------
Write-Host "[10] Routing + utility pages" -ForegroundColor Cyan
$staticExpectations = @{
    "/projects" = "Real Estate Projects | Spaceezy"
    "/properties" = "Properties for Sale & Rent | Spaceezy"
    "/about" = "About Spaceezy"
}
foreach ($p in $staticExpectations.Keys) {
    $pg = Get-Page "$WEB$p"
    Assert ($pg.status -eq 200) "static $p returns 200" "got $($pg.status)"
    Assert ((Get-Title $pg.html) -eq $staticExpectations[$p]) "static $p wins over /[hubSlug]" "got $(Get-Title $pg.html)"
}
$unknown = Get-Page "$WEB/this-route-does-not-exist-12345"
Assert ($unknown.status -eq 404) "unknown hub slug returns 404" "got $($unknown.status)"

# www -> apex HTTPS must be host-based, not dependent on x-forwarded-proto.
$wwwHost = "www." + ([uri]$ORIGIN).Host
foreach ($proto in @("http", "https")) {
    $line = & curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" -H "Host: $wwwHost" -H "X-Forwarded-Proto: $proto" "$WEB/"
    $parts = ($line -split '\s+', 2)
    $code = if ($parts.Length -gt 0) { $parts[0] } else { "" }
    $dest = if ($parts.Length -gt 1) { $parts[1] } else { "" }
    Assert ($code -in @("301", "308")) "${proto}://www uses a permanent redirect" "got $code"
    Assert ($dest -eq "$ORIGIN/") "${proto}://www redirects in one hop to $ORIGIN/" "got $dest"
}

foreach ($fp in @("/projects?q=test&page=2", "/properties?bhk=2&sort=price")) {
    $pg = Get-Page "$WEB$fp"
    $clean = ($fp -split '\?')[0]
    $c = Get-Canonical $pg.html
    $rm = Get-Meta $pg.html "robots"
    Assert (-not ($rm -and $rm -match 'noindex')) "filter URL $fp is not noindex" "got $rm"
    Assert ($c -and ((Norm-Url $c) -eq (Norm-Url "$ORIGIN$clean"))) "filter URL $fp canonicalises to $clean" "got $c"
}
Assert ($rb.html -match '(?i)Disallow:.*(sort=|page=|minPrice=)') "filter params remain disallowed in robots"

foreach ($u in @("/search", "/enquiry", "/login", "/dashboard")) {
    $pg = Get-Page "$WEB$u"
    $rm = Get-Meta $pg.html "robots"
    Assert ($rm -and $rm -match 'noindex') "$u is noindex" "got $rm"
    Assert (-not $locSet.ContainsKey((Norm-Url "$ORIGIN$u"))) "$u absent from sitemap"
}
$utilityPages = @($homePg.html)
if ($landingSlugs.Count) { $utilityPages += (Get-Page "$WEB/$($landingSlugs[0])").html }
if ($sitemapProjectSlugs.Count) { $utilityPages += (Get-Page "$WEB/projects/$($sitemapProjectSlugs[0])").html }
foreach ($html in $utilityPages) {
    foreach ($u in @("/search", "/enquiry", "/login")) {
        $anchors = [regex]::Matches($html, '<a[^>]+href="' + [regex]::Escape($u) + '[^"]*"[^>]*>')
        $followed = @($anchors | Where-Object { $_.Value -notmatch 'rel="[^"]*nofollow' })
        Assert ($followed.Count -eq 0) "utility $u has no crawlable follow link" "found $($followed.Count)"
    }
}

# ---------- Summary ----------
Write-Host ""
Write-Host "=== RESULT: $script:pass passed, $script:fail failed ===" -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
if ($script:fail -gt 0) {
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  - $f" -ForegroundColor Red }
    exit 1
}
exit 0



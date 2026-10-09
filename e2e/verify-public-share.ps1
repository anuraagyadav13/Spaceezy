# Phase D E2E: Public Property Link + WhatsApp Sharing + CRM-driven Public Website
$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = if ($env:E2E_API_BASE) { $env:E2E_API_BASE } else { 'http://localhost:8000/api/v1' }
$web  = if ($env:E2E_WEB_BASE) { $env:E2E_WEB_BASE } else { 'http://localhost:3000' }
$apiOrigin = $base -replace '/api/v1$', ''
$script:pass = 0; $script:fail = 0; $script:failures = @()

function Check($name, $ok, $detail) {
    if ($ok) { $script:pass++; Write-Output "PASS  $name" }
    else { $script:fail++; $script:failures += $name; Write-Output "FAIL  $name -- $detail" }
}
function J($resp) { try { ($resp.Content | ConvertFrom-Json) } catch { $null } }
function Req($method, $url, $bodyObj, $session) {
    # curl.exe: PS 5.1 swallows error response bodies in WebException (both
    # ErrorDetails and the stream come back empty) — curl reads them fine.
    $raw = ''; $code = 0
    foreach ($try in 1..2) {
        $out = [IO.Path]::GetTempFileName()
        $err = [IO.Path]::GetTempFileName()
        $dataFile = $null
        $a = @('-s', '-S', '-X', $method.ToUpperInvariant(), '-o', $out, '-w', '%{http_code}', '--stderr', $err)
        if ($script:cookie) { $a += @('-H', "Cookie: $($script:cookie)") }
        if ($null -ne $bodyObj) {
            $dataFile = [IO.Path]::GetTempFileName()
            [IO.File]::WriteAllText($dataFile, (ConvertTo-Json $bodyObj -Depth 6), (New-Object Text.UTF8Encoding $false))
            $a += @('-H', 'Content-Type: application/json', '--data-binary', "@$dataFile")
        }
        $status = & curl.exe @a $url
        try { $raw = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8) } catch {}
        $errTxt = ''
        try { $errTxt = [IO.File]::ReadAllText($err, [Text.Encoding]::UTF8).Trim() } catch {}
        Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
        if ($dataFile) { Remove-Item $dataFile -Force -ErrorAction SilentlyContinue }
        $code = 0; try { $code = [int]$status } catch {}
        if ($code -gt 0 -and $raw) { break }
        if ($errTxt) { $raw = "CURL_ERR: $errTxt" }
        Start-Sleep -Milliseconds 500
    }
    $json = $null; try { $json = $raw | ConvertFrom-Json } catch {}
    return @{ ok = ($code -ge 200 -and $code -lt 300); status = $code; raw = $raw; json = $json }
}
function Get-Items($j) {
    # IMPORTANT: PowerShell functions unroll arrays through the pipeline and a
    # single PSCustomObject has no .Count — always return a real array with the
    # unary comma so callers' .Count is reliable for 0/1/N results.
    $result = @()
    if (-not $j) { return , $result }
    $d = $j.data
    if ($null -eq $d) { return , $result }
    if ($d -is [System.Array]) { return , @($d) }
    foreach ($k in @('items', 'projects', 'properties', 'leads', 'activities', 'timeline', 'messages')) {
        if ($d.PSObject.Properties.Name -contains $k -and $null -ne $d.$k) { return , @($d.$k) }
    }
    return , @($d)
}
function Get-Web($path) {
    try { $r = Invoke-WebRequest -Uri "$web$path" -UseBasicParsing -TimeoutSec 60; return @{ ok = $true; status = [int]$r.StatusCode; raw = $r.Content } }
    catch { $s = 0; try { $s = [int]$_.Exception.Response.StatusCode } catch {}; return @{ ok = $false; status = $s; raw = '' } }
}
function Wait-WebContains($path, $needle, $secs) {
    $deadline = (Get-Date).AddSeconds($secs)
    do {
        $h = Get-Web $path
        if ($h.status -eq 200 -and $h.raw.Contains($needle)) { return $h }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    return $h
}

Write-Output '=== SETUP ==='
$sb = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$script:sb = $sb
$loginR = Invoke-WebRequest -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"admin@spaceezy.com","password":"password123"}' -UseBasicParsing -WebSession $sb
Check 'S1 admin login' ($loginR.StatusCode -eq 200) "status=$($loginR.StatusCode)"
$script:cookie = (($sb.Cookies.GetCookies($apiOrigin) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; ')
$ids = Get-Content 'C:\Users\anute\AppData\Local\Temp\opencode\demo-ids.txt'
$projectId = [string]$ids[0]; $slug = [string]$ids[1]; $mhState = [string](Get-Content 'C:\Users\anute\AppData\Local\Temp\opencode\loc-ids.txt')[0]
$propIds = @(Get-Content 'C:\Users\anute\AppData\Local\Temp\opencode\demo-prop-ids.txt' | ForEach-Object { [string]$_ })
Write-Output "project=$projectId slug=$slug props=$($propIds.Count)"

# tokens from the PUBLIC list (source of truth for published units)
$pubProps = Get-Items (Req Get "$base/public/properties").json
$tok = @{}; foreach ($p in $pubProps) { $tok[$p.unitNumber] = $p.token }
$tokA = $tok['A-1201']; $tokB = $tok['A-1202']
Check 'S2 public token map (A-1201 + A-1202)' ($tokA -and $tokB -and $tokA -match '^[0-9a-f]{32}$') "A1201=$tokA A1202=$tokB"

# unpublished-but-tokened unit (admin view) for the 404 oracle + 409 share
$adminProps = Get-Items (Req Get "$base/properties?limit=200").json
$unpub = $adminProps | Where-Object { -not $_.isPublic -and $_.publicToken } | Select-Object -First 1
Check 'S3 unpublished unit available for oracle tests' ([bool]$unpub) "found=$([bool]$unpub)"

$adminProjects = Get-Items (Req Get "$base/projects?limit=100").json
$draftProject = $adminProjects | Where-Object { -not $_.isPublic -and $_.publicSlug } | Select-Object -First 1

Write-Output '=== A. BACKEND PUBLIC APIs ==='
$r = Req Get "$base/public/projects?limit=50"
$items = Get-Items $r.json
$names = @($items | ForEach-Object { $_.name })
Check 'A1 project list shows published Aurora Heights' ($names -contains 'Aurora Heights') "names=$($names -join ',')"
Check 'A1 project list hides drafts' (-not (@($names | Where-Object { $_ -match 'E2E|Phase7' }).Count)) "leaked=$(@($names | Where-Object { $_ -match 'E2E|Phase7' }) -join ',')"
Check 'A1 project list no internal ids' (-not $r.raw.Contains($projectId) -and -not $r.raw.Contains('organizationId') -and -not $r.raw.Contains('"projectId"')) 'leaked internal id'

$rQ = Req Get "$base/public/projects?q=aurora"
Check 'A2 filter q=aurora' ((Get-Items $rQ.json).Count -ge 1) "count=$((Get-Items $rQ.json).Count) status=$($rQ.status) raw=$($rQ.raw.Substring(0, [Math]::Min(300, $rQ.raw.Length)))"
$rS = Req Get "$base/public/projects?stateId=$mhState"
Check 'A2 filter stateId' ((@($items2 = Get-Items $rS.json; $items2 | ForEach-Object { $_.name })) -contains 'Aurora Heights') $rS.raw
$rT = Req Get "$base/public/projects?propertyType=Residential"
Check 'A2 filter propertyType' (@(Get-Items $rT.json | ForEach-Object { $_.name }) -contains 'Aurora Heights') $rT.raw
$rC = Req Get "$base/public/projects?configuration=2%20BHK"
Check 'A2 filter configuration' (@(Get-Items $rC.json | ForEach-Object { $_.name }) -contains 'Aurora Heights') $rC.raw

$r = Req Get "$base/public/projects/$slug"
$pd = $r.json.data
$cfgNames = @(); if ($pd.configurations) { $cfgNames = @($pd.configurations | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.name } }) }
Check 'A3 project detail 200' ($r.status -eq 200) "status=$($r.status)"
Check 'A3 name + developer + rera' ($pd.name -eq 'Aurora Heights' -and $pd.developer -eq 'Aurora Builders Pvt Ltd' -and $pd.rera.number -eq 'P51800045678') "name=$($pd.name) dev=$($pd.developer) rera=$($pd.rera.number)"
Check 'A3 availability 4 total / 4 available' ($pd.availability.totalUnits -eq 4 -and $pd.availability.availableUnits -eq 4) "total=$($pd.availability.totalUnits) available=$($pd.availability.availableUnits)"
Check 'A3 unitTypes + configurations (2 BHK, 3 BHK)' (@($pd.unitTypes).Count -ge 1 -and ($cfgNames -contains '2 BHK') -and ($cfgNames -contains '3 BHK')) "unitTypes=$(@($pd.unitTypes).Count) cfgs=$($cfgNames -join ',')"
Check 'A3 startingPrice 4500000' ([long]$pd.startingPrice -eq 4500000) "price=$($pd.startingPrice)"
Check 'A3 no internal ids' (-not $r.raw.Contains($projectId) -and -not $r.raw.Contains('organizationId') -and -not $r.raw.Contains('"projectId"')) 'leaked'

$rU = Req Get "$base/public/projects/definitely-not-a-project"
Check 'A4 unknown slug -> 404 Project not found' ($rU.status -eq 404 -and $rU.raw.Contains('Project not found') -and $rU.raw.Contains('NOT_FOUND')) "status=$($rU.status) raw=$($rU.raw)"
if ($draftProject) {
    $rD = Req Get "$base/public/projects/$($draftProject.publicSlug)"
    Check 'A4 draft project slug -> 404' ($rD.status -eq 404 -and $rD.raw.Contains('Project not found')) "status=$($rD.status) raw=$($rD.raw)"
} else { Check 'A4 draft project slug -> 404 (unknown slug already covered; no slugged draft exists)' $true 'n/a' }

$r = Req Get "$base/public/properties?limit=50"
$pitems = Get-Items $r.json
Check 'A5 property list total=4' ($pitems.Count -eq 4) "count=$($pitems.Count)"
Check 'A5 tokens 32-hex' (@($pitems | Where-Object { $_.token -match '^[0-9a-f]{32}$' }).Count -eq 4) "tokens=$(@($pitems | ForEach-Object { $_.token }) -join ',')"
$badId = $false
foreach ($pid2 in $propIds) { if ($r.raw.Contains($pid2)) { $badId = $true } }
Check 'A5 no internal ids' (-not $badId -and -not $r.raw.Contains('organizationId') -and -not $r.raw.Contains('"projectId"') -and -not $r.raw.Contains($projectId)) 'leaked'

$f1 = (Get-Items (Req Get "$base/public/properties?configuration=2%20BHK").json).Count
Check 'A6 filter configuration=2 BHK -> 2' ($f1 -eq 2) "count=$f1"
$f2 = (Get-Items (Req Get "$base/public/properties?bhk=3").json).Count
Check 'A6 filter bhk=3 -> 2' ($f2 -eq 2) "count=$f2"
$f3 = (Get-Items (Req Get "$base/public/properties?availability=Available").json).Count
Check 'A6 filter availability=Available -> 4' ($f3 -eq 4) "count=$f3"
$f4 = (Get-Items (Req Get "$base/public/properties?q=Aurora").json).Count
Check 'A6 filter q=Aurora -> 4' ($f4 -eq 4) "count=$f4"
$f5 = (Get-Items (Req Get "$base/public/properties?stateId=$mhState").json).Count
Check 'A6 filter stateId -> 4' ($f5 -eq 4) "count=$f5"

$r = Req Get "$base/public/properties/$tokA"
$pd = $r.json.data
$inq = $pd.enquiry
Check 'A7 property detail 200' ($r.status -eq 200) "status=$($r.status)"
Check 'A7 core fields' ($pd.token -eq $tokA -and $pd.title -eq 'Aurora 1201 - 2 BHK' -and $pd.unitNumber -eq 'A-1201' -and [long]$pd.price -eq 4650000 -and $pd.availability -eq 'Available') "title=$($pd.title) price=$($pd.price) avail=$($pd.availability)"
Check 'A7 project context' ($pd.project.name -eq 'Aurora Heights' -and $pd.project.developer -eq 'Aurora Builders Pvt Ltd' -and $pd.project.slug -eq $slug) "proj=$($pd.project.name) dev=$($pd.project.developer)"
Check 'A7 enquiry prefill context' ($inq.propertyToken -eq $tokA -and $inq.projectSlug -eq $slug) "token=$($inq.propertyToken) slug=$($inq.projectSlug)"
$leak = $r.raw.Contains($propIds[0]) -or $r.raw.Contains($projectId) -or $r.raw.Contains('organizationId') -or $r.raw.Contains('"projectId"') -or $r.raw.Contains('"publicToken"')
Check 'A7 no internal ids' (-not $leak) 'leaked'
$imgsOk = $true; if ($pd.images) { foreach ($im in $pd.images) { if ($im -notmatch '^https?://') { $imgsOk = $false } } }
Check 'A7 images http(s) only (no blob:)' $imgsOk "images=$($pd.images -join ',')"

$r1 = Req Get "$base/public/properties/not-a-valid-token"
$r2 = Req Get "$base/public/properties/ffffffffffffffffffffffffffffffff"
$r3 = Req Get "$base/public/properties/$($unpub.publicToken)"
$identical = ($r1.status -eq 404 -and $r2.status -eq 404 -and $r3.status -eq 404 -and $r1.raw -eq $r2.raw -and $r2.raw -eq $r3.raw)
Check 'A8 404 oracle identical (malformed == unknown == unpublished)' $identical "malformed=$($r1.raw) | unknown=$($r2.raw) | unpublished=$($r3.raw)"
Check 'A8 404 body Property not found / NOT_FOUND' ($r1.raw.Contains('Property not found') -and $r1.raw.Contains('NOT_FOUND')) $r1.raw

$r = Req Get "$base/public/locations"
$states = Get-Items $r.json
$mh = $states | Where-Object { $_.name -eq 'Maharashtra' }
$dist = $null; if ($mh) { $dist = $mh.districts | Where-Object { $_.name -eq 'Mumbai City' } }
$reg = $null; if ($dist) { $reg = $dist.regions | Where-Object { $_.name -eq 'Andheri West' } }
Check 'A9 locations state/district/region tree' ($mh -and $dist -and $reg -and $reg.id) "mh=$([bool]$mh) dist=$([bool]$dist) reg=$([bool]$reg)"

$r = Req Get "$base/public/configurations"
$cnRaw = Get-Items $r.json
$cn = @($cnRaw | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.name } })
Check 'A10 configurations include 2 BHK + 3 BHK' (($cn -contains '2 BHK') -and ($cn -contains '3 BHK')) "got=$($cn -join ',')"

Write-Output '=== B. ENQUIRY -> LEAD ==='
$enq = Req Post "$base/public/enquiries" @{
    name = 'Public Site Visitor'; phone = '9876543210'; email = 'visitor@example.com'
    message = 'Interested in Aurora 1201, want a site visit.'; source = 'Website'
    propertyToken = $tokA; projectSlug = $slug
    preferredVisitDate = '2026-10-20'; preferredVisitTime = '11:00'
    interestedUnitType = '2 BHK'; landingPage = "$web/properties/$tokA"
}
$leadId = $null
if ($enq.json) { $d = $enq.json.data; if ($d.lead) { $leadId = $d.lead.id } elseif ($d.id) { $leadId = $d.id } }
Check 'B1 public enquiry accepted' ($enq.ok -and $leadId) "status=$($enq.status) raw=$($enq.raw)"
$ld = $null
if ($leadId) { $ldJ = Req Get "$base/leads/$leadId"; if ($ldJ.json) { $ld = $ldJ.json.data; if ($ld.lead) { $ld = $ld.lead } } }
if ($ld) {
    Check 'B2 lead resolved propertyId + projectId from token/slug' ($ld.propertyId -eq $propIds[0] -and $ld.projectId -eq $projectId) "propertyId=$($ld.propertyId) projectId=$($ld.projectId)"
    Check 'B3 lead source = Website' ($ld.source -eq 'Website') "source=$($ld.source)"
    Check 'B4 lead name recorded' ($ld.name -eq 'Public Site Visitor') "name=$($ld.name)"
} else { Check 'B2 lead detail' $false 'fetch failed'; Check 'B3 source' $false ''; Check 'B4 name' $false '' }
$bad = Req Post "$base/public/enquiries" @{ name = 'X'; phone = '9876543211'; organizationId = '11111111-1111-1111-1111-111111111111' }
Check 'B5 enquiry rejects unknown keys (organizationId injection)' ($bad.status -eq 400) "status=$($bad.status) raw=$($bad.raw)"

Write-Output '=== C. SHARE + WHATSAPP ==='
$shr = Req Post "$base/leads/$leadId/property-share" @{ propertyId = $propIds[0] }
$sd = $null; if ($shr.json) { $sd = $shr.json.data }
$expectedUrl = "$web/properties/$tokA"
Check 'C1 share 200' ($shr.ok -and $sd) "status=$($shr.status) raw=$($shr.raw)"
if ($sd) {
    $bodyTxt = $sd.body
    Check 'C1 message template fields' ($bodyTxt.Contains('Hi Public Site Visitor') -and $bodyTxt.Contains('Aurora Heights') -and $bodyTxt.Contains('Andheri West') -and $bodyTxt.Contains('2 BHK') -and $bodyTxt.Contains('950 sq.ft') -and $bodyTxt.Contains('View Property') -and $bodyTxt.Contains('Regards') -and $bodyTxt.Contains('Admin User')) "body=$($bodyTxt -replace "`n", ' | ')"
    Check 'C1 message contains public URL' ($bodyTxt.Contains($expectedUrl) -and $sd.publicUrl -eq $expectedUrl) "url=$($sd.publicUrl)"
    Check 'C1 publicToken returned' ($sd.publicToken -eq $tokA) "token=$($sd.publicToken)"
}
$c2 = Req Post "$base/leads/$leadId/property-share" @{ propertyId = $unpub.id }
Check 'C2 share unpublished unit -> 409 PROPERTY_NOT_PUBLISHED' ($c2.status -eq 409 -and $c2.raw.Contains('PROPERTY_NOT_PUBLISHED')) "status=$($c2.status) raw=$($c2.raw)"
$c3 = Req Post "$base/leads/00000000-0000-4000-8000-000000000000/property-share" @{ propertyId = $propIds[0] }
Check 'C3 share unknown lead -> 404' ($c3.status -eq 404 -and $c3.raw.Contains('Lead not found')) "status=$($c3.status) raw=$($c3.raw)"

$conv = Req Post "$base/whatsapp/conversations" @{ leadId = $leadId }
$convId = $null; if ($conv.json) { $cd = $conv.json.data; if ($cd.id) { $convId = $cd.id } elseif ($cd.conversation) { $convId = $cd.conversation.id } }
Check 'C4 whatsapp conversation created' ($convId) "raw=$($conv.raw)"
$msgBody = "Hi Public Site Visitor! Aurora 1201 - 2 BHK at Aurora Heights: $expectedUrl"
$sent = $null
if ($convId) { $sent = Req Post "$base/whatsapp/conversations/$convId/messages" @{ body = $msgBody; share = @{ propertyId = $propIds[0] } } }
Check 'C4 whatsapp send with share -> 2xx' ($sent -and $sent.ok) "raw=$(if ($sent) { $sent.raw } else { 'no send' })"

$tl = $null; if ($leadId) { $tl = Req Get "$base/leads/$leadId/timeline" }
if ($tl) {
    $acts = Get-Items $tl.json
    $shareItem = $acts | Where-Object { $_.title -eq 'WhatsApp property share sent' } | Select-Object -First 1
    Check 'C5 timeline shows property-share item' ([bool]$shareItem) "titles=$(@($acts | ForEach-Object { $_.title }) -join ' | ')"
    if ($shareItem) {
        $m = $shareItem.meta.share
        Check 'C5 timeline meta.share has propertyId + publicUrl + token' ($m -and $m.propertyId -eq $propIds[0] -and "$($m.publicUrl)".Contains($tokA) -and $m.publicToken -eq $tokA) "meta=$($shareItem.meta | ConvertTo-Json -Depth 6 -Compress)"
        Check 'C5 timeline share title/desc reference the unit' ($shareItem.description -match 'Aurora 1201') "desc=$($shareItem.description)"
    }
} else { Check 'C5 timeline fetch' $false 'no timeline' }
$msgsR = $null; if ($convId) { $msgsR = Req Get "$base/whatsapp/conversations/$convId" }
if ($msgsR -and $msgsR.json) {
    $msgs = Get-Items $msgsR.json
    $withShare = $msgs | Where-Object { $_.variables -and $_.variables.publicUrl } | Select-Object -First 1
    Check 'C6 message stores shareContext in variables' ([bool]$withShare) "msgs=$(@($msgs).Count)"
}

Write-Output '=== D. PUBLICATION TOGGLES (reversible) ==='
$d1 = Req Patch "$base/properties/$($propIds[1])" @{ isPublic = $false }
$after = (Get-Items (Req Get "$base/public/properties?limit=50").json).Count
$tok404 = Req Get "$base/public/properties/$tokB"
Check 'D1 unpublish unit -> list 3 + token 404' ($d1.ok -and $after -eq 3 -and $tok404.status -eq 404) "patch=$($d1.status) list=$after status=$($tok404.status) raw=$($tok404.raw)"
$d2 = Req Patch "$base/properties/$($propIds[1])" @{ isPublic = $true }
$after2 = (Get-Items (Req Get "$base/public/properties?limit=50").json).Count
Check 'D2 republish unit -> list 4' ($d2.ok -and $after2 -eq 4) "patch=$($d2.status) list=$after2"
$d3 = Req Patch "$base/projects/$projectId" @{ isPublic = $false }
$pAfter = (Get-Items (Req Get "$base/public/projects?limit=50").json).Count
$slug404 = Req Get "$base/public/projects/$slug"
$pProps = (Get-Items (Req Get "$base/public/properties?limit=50").json).Count
Check 'D3 unpublish project -> projects 0 + slug 404 + units cascade hidden' ($d3.ok -and $pAfter -eq 0 -and $slug404.status -eq 404 -and $pProps -eq 0) "patch=$($d3.status) projects=$pAfter slug=$($slug404.status) props=$pProps"
$d4 = Req Patch "$base/projects/$projectId" @{ isPublic = $true }
$pAfter2R = Req Get "$base/public/projects?limit=50"
$pAfter2 = (Get-Items $pAfter2R.json).Count
$propAfter2 = (Get-Items (Req Get "$base/public/properties?limit=50").json).Count
Check 'D4 republish project -> projects 1 + units 4' ($d4.ok -and $pAfter2 -eq 1 -and $propAfter2 -eq 4) "patch=$($d4.status) projects=$pAfter2 props=$propAfter2 pRaw=$($pAfter2R.raw.Substring(0, [Math]::Min(200, $pAfter2R.raw.Length)))"

Write-Output '=== E. FRONTEND (server-rendered HTML, ISR-aware polling) ==='
$h = Wait-WebContains '/' 'Aurora Heights' 75
Check 'E1 home 200 + live project data (poll ISR)' ($h.status -eq 200 -and $h.raw.Contains('Aurora Heights')) "status=$($h.status)"
Check 'E1 home no internal ids' (-not $h.raw.Contains($projectId)) 'leaked uuid'
$h = Wait-WebContains '/projects' 'Aurora Heights' 75
Check 'E2 /projects shows Aurora Heights (poll ISR)' ($h.status -eq 200 -and $h.raw.Contains('Aurora Heights')) "status=$($h.status)"
Check 'E2 /projects no internal ids' (-not $h.raw.Contains($projectId)) 'leaked uuid'
$h = Wait-WebContains '/projects/aurora-heights-fc88b8' 'Aurora Heights' 75
$hasTitle = $h.raw -match '<title>[^<]*Aurora Heights'
Check 'E3 project page 200 + title + og + canonical (poll ISR)' ($h.status -eq 200 -and $hasTitle -and $h.raw.Contains('og:title') -and $h.raw.Contains('canonical')) "status=$($h.status) title=$hasTitle"
Check 'E3 project page shows RERA + developer + availability' ($h.raw.Contains('P51800045678') -and $h.raw.Contains('Aurora Builders') -and $h.raw.Contains('Available')) "rera=$($h.raw.Contains('P51800045678')) dev=$($h.raw.Contains('Aurora Builders'))"
Check 'E3 project page no internal ids' (-not $h.raw.Contains($projectId) -and -not $h.raw.Contains('organizationId')) 'leaked'
$h = Wait-WebContains '/properties' 'Aurora 1201' 75
Check 'E4 /properties shows units (poll ISR)' ($h.status -eq 200 -and $h.raw.Contains('Aurora 1201')) "status=$($h.status)"
Check 'E4 /properties no internal ids' (-not $h.raw.Contains($propIds[0])) 'leaked uuid'
$h = Get-Web "/properties/$tokA"
Check 'E5 property page 200 + title + og + canonical token' ($h.status -eq 200 -and ($h.raw -match '<title>[^<]*Aurora 1201') -and $h.raw.Contains('og:title') -and $h.raw.Contains($tokA)) "status=$($h.status) title=$($h.raw -match '<title>[^<]*Aurora 1201')"
Check 'E5 property page content (project, developer, amenities)' ($h.raw.Contains('Aurora Heights') -and $h.raw.Contains('Aurora Builders') -and $h.raw.Contains('Rooftop Infinity Pool')) "proj=$($h.raw.Contains('Aurora Heights')) amen=$($h.raw.Contains('Rooftop Infinity Pool'))"
Check 'E5 property page no internal ids' (-not $h.raw.Contains($propIds[0]) -and -not $h.raw.Contains($projectId) -and -not $h.raw.Contains('organizationId')) 'leaked'
Check 'E5 property page no truncated /properties/ link' (-not ($h.raw -match 'href="/properties/"')) 'bad link'
$h = Get-Web "/properties/$($unpub.publicToken)"
Check 'E6 unpublished token -> 404' ($h.status -eq 404) "status=$($h.status)"
$h = Get-Web '/projects/definitely-not-a-project'
Check 'E6 unknown project slug -> 404' ($h.status -eq 404) "status=$($h.status)"
$h = Get-Web '/search'
Check 'E7 /search 200' ($h.status -eq 200) "status=$($h.status)"
$h = Get-Web "/enquiry?propertyToken=$tokA&projectSlug=$slug"
Check 'E8 /enquiry with prefilled params 200' ($h.status -eq 200) "status=$($h.status)"

Write-Output '=== F. REPO HYGIENE ==='
$pubPages = Get-ChildItem -Recurse 'C:\Users\anute\Desktop\SpaceEzy\Spaceezy\src\app\(public)' -Include '*.jsx', '*.js' -File
$mockRefs = @()
foreach ($f in $pubPages) {
    if (Select-String -LiteralPath $f.FullName -Pattern 'lib/mock' -SimpleMatch) { $mockRefs += $f.FullName }
}
Check 'F1 no lib/mock imports under src/app/(public)' ($mockRefs.Count -eq 0) ($mockRefs -join ',')

Write-Output ''
Write-Output "========== RESULT: $script:pass PASSED, $script:fail FAILED =========="
if ($script:fail -gt 0) { $script:failures | ForEach-Object { Write-Output "  FAILED: $_" } }
if ($script:fail -eq 0) { exit 0 } else { exit 1 }

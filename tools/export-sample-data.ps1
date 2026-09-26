<#
.SYNOPSIS
    Exports the seeded demo dataset to docs/sample-data-records.md.

.DESCRIPTION
    Generated rows are identified by their @lms-oc.test email domain, so this
    never picks up real customers. The file is regenerated from the database
    rather than hand-maintained, which is the only way it stays truthful: a
    hand-written list drifts the moment anyone registers or a loan is approved.

    Re-run this after adding records, or wire it into CI to fail on drift.

.EXAMPLE
    .\tools\export-sample-data.ps1
#>
[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\docs\sample-data-records.md'),
    [string]$DbHost    = 'localhost',
    [string]$DbUser    = 'root',
    [string]$DbName    = 'loan_management_db',
    [string]$DbPassword = $env:DB_PASSWORD
)

$ErrorActionPreference = 'Stop'

# Locate the MySQL client; allow an override for non-standard installs.
$mysql = $env:MYSQL_HOME
if (-not $mysql) { $mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin' }
$mysqlExe = Join-Path $mysql 'mysql.exe'
if (-not (Test-Path $mysqlExe)) { throw "mysql.exe not found at $mysqlExe. Set MYSQL_HOME." }

if (-not $DbPassword) { throw 'DB_PASSWORD is not set. The demo password in .env is not used here on purpose.' }

# Pass the password via MYSQL_PWD rather than -p. On the command line it lands in
# the process table where any local user can read it, and it also makes the MySQL
# client emit a warning that PowerShell would otherwise turn into a terminating
# error. MYSQL_PWD keeps it out of both problems.
$env:MYSQL_PWD = $DbPassword

function Invoke-Sql {
    <#
      Runs a query and returns an array of tab-split field arrays.

      The explicit -split is required: a native command's output is not reliably
      one array element per line, and without it PowerShell hands back a single
      joined string that then indexes by character - which silently produces a
      table of letters instead of a table of records.
    #>
    param([string]$Query)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & $mysqlExe "-u$DbUser" '-N' '-B' '-e' $Query $DbName 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -ne 0) { throw "Query failed (exit $code): $Query" }

    $lines = ([string]($raw -join "`n")) -split "`n" | Where-Object { $_.Trim() -ne '' }
    return ,@($lines | ForEach-Object { ,($_.TrimEnd() -split "`t") })
}

# Every customer is listed, not just the seeded ones, tagged by origin. Filtering
# to the seeder's own rows would be the natural shortcut and it is the wrong one:
# a customer registered through the app afterwards would simply not appear, and the
# inventory would quietly understate what is in the database. Listing everything and
# labelling the origin is what makes the file stay true as records are added.
$origin = "IF(c.email LIKE '%@lms-oc.test', 'seeded', 'in-app')"

$customers = Invoke-Sql @"
SELECT c.cif_no, c.account_number, c.full_name, c.dob, c.pan_no, c.phone_no, c.email,
       c.branch_code, $origin
FROM customer c ORDER BY c.cif_no;
"@

$loans = Invoke-Sql @"
SELECT l.loan_id, l.account_number, l.loan_type, l.principal_amount, l.interest_rate,
       l.loan_status, l.tenure_months, l.monthly_emi, l.application_date, $origin
FROM loan l JOIN customer c ON c.account_number = l.account_number
ORDER BY l.loan_id;
"@

$branches = Invoke-Sql "SELECT b.branch_code, b.branch_name, b.address FROM branch b ORDER BY b.branch_code;"

$byStatus = @{}
foreach ($row in $loans) {
    $key = $row[5]
    if ($byStatus.ContainsKey($key)) { $byStatus[$key] = $byStatus[$key] + 1 } else { $byStatus[$key] = 1 }
}

$sb = [System.Text.StringBuilder]::new()
$null = $sb.AppendLine('# Database record inventory')
$null = $sb.AppendLine()
$null = $sb.AppendLine('> **Generated file. Do not edit by hand.**')
$null = $sb.AppendLine('> Regenerate with `.\tools\export-sample-data.ps1` after adding or changing records,')
$null = $sb.AppendLine('> so this list always reflects what is actually in the database.')
$null = $sb.AppendLine()
$null = $sb.AppendLine('Covers **every** customer and loan, not only the demo rows, and tags each with where')
$null = $sb.AppendLine('it came from:')
$null = $sb.AppendLine()
$null = $sb.AppendLine('- `seeded` - written by `SampleDataService`, which inserts the whole batch in one')
$null = $sb.AppendLine('  transaction, so it is either entirely present or entirely absent. Generation is')
$null = $sb.AppendLine('  deterministic (fixed random seed), so a fresh database reproduces these rows exactly.')
$null = $sb.AppendLine('- `in-app` - created through the running application, e.g. via registration. These are')
$null = $sb.AppendLine('  real records and are listed for the same reason: an inventory that silently omitted')
$null = $sb.AppendLine('  them would understate the database.')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| | Count |')
$null = $sb.AppendLine('| --- | ---: |')
$null = $sb.AppendLine("| Customers (total) | $($customers.Count) |")
$null = $sb.AppendLine("| - seeded | $(($customers | Where-Object { $_[8] -eq 'seeded' }).Count) |")
$null = $sb.AppendLine("| - in-app | $(($customers | Where-Object { $_[8] -eq 'in-app' }).Count) |")
$null = $sb.AppendLine("| Loans (total) | $($loans.Count) |")
$null = $sb.AppendLine("| - seeded | $(($loans | Where-Object { $_[9] -eq 'seeded' }).Count) |")
$null = $sb.AppendLine("| - in-app | $(($loans | Where-Object { $_[9] -eq 'in-app' }).Count) |")
$null = $sb.AppendLine("| Branches (reference) | $($branches.Count) |")
$null = $sb.AppendLine()
$null = $sb.AppendLine('### Loans by status')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| Status | Count |')
$null = $sb.AppendLine('| --- | ---: |')
foreach ($k in ($byStatus.Keys | Sort-Object)) { $null = $sb.AppendLine("| $k | $($byStatus[$k]) |") }
$null = $sb.AppendLine()
$null = $sb.AppendLine('### Branches')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| Code | Name | Address |')
$null = $sb.AppendLine('| ---: | --- | --- |')
foreach ($b in $branches) { $null = $sb.AppendLine("| $($b[0]) | $($b[1]) | $($b[2]) |") }
$null = $sb.AppendLine()
$null = $sb.AppendLine('### Customers')
$null = $sb.AppendLine()
$null = $sb.AppendLine('Seeded logins use password `DemoCustomer!2026`, with the email as the username.')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| CIF | Account | Name | DOB | PAN | Phone | Email | Branch | Source |')
$null = $sb.AppendLine('| ---: | ---: | --- | --- | --- | --- | --- | ---: | --- |')
foreach ($c in $customers) {
    $null = $sb.AppendLine("| $($c[0]) | $($c[1]) | $($c[2]) | $($c[3]) | $($c[4]) | $($c[5]) | $($c[6]) | $($c[7]) | $($c[8]) |")
}
$null = $sb.AppendLine()
$null = $sb.AppendLine('### Loans')
$null = $sb.AppendLine()
$null = $sb.AppendLine('| Loan | Account | Type | Principal | Rate | Status | Tenure | Monthly EMI | Applied | Source |')
$null = $sb.AppendLine('| ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | --- |')
foreach ($l in $loans) {
    $null = $sb.AppendLine("| $($l[0]) | $($l[1]) | $($l[2]) | $($l[3]) | $($l[4]) | $($l[5]) | $($l[6]) | $($l[7]) | $($l[8]) | $($l[9]) |")
}

$outFile = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outFile)) | Out-Null
[System.IO.File]::WriteAllText($outFile, $sb.ToString())

Write-Host "Wrote $($customers.Count) customers and $($loans.Count) loans to $outFile"

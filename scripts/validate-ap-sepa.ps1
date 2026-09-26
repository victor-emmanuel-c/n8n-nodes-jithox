param(
  [string]$XmlPath = 'evidence/ap-template/payment.pain.001.001.03.xml',
  [string]$SchemaPath = '.ap-local/pain.001.001.03.xsd'
)
$ErrorActionPreference = 'Stop'
$settings = New-Object System.Xml.XmlReaderSettings
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$null = $settings.Schemas.Add('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03', (Resolve-Path $SchemaPath).Path)
$script:issues = New-Object System.Collections.Generic.List[string]
$settings.add_ValidationEventHandler({ param($sender, $event) $script:issues.Add($event.Message) })
$reader = [System.Xml.XmlReader]::Create((Resolve-Path $XmlPath).Path, $settings)
try { while ($reader.Read()) {} } finally { $reader.Dispose() }
$result = @{ status = $(if ($issues.Count -eq 0) { 'PASS' } else { 'FAIL' }); validator = '.NET System.Xml.XmlReader'; xml = $XmlPath; schema = $SchemaPath; issues = @($issues.ToArray()); bytes = (Get-Item $XmlPath).Length; checkedAt = [DateTime]::UtcNow.ToString('o'); doesNotProve = 'Bank-specific implementation rules, account ownership or acceptance by a bank' }
$result | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 'evidence/ap-template/xsd-result.json'
$result | ConvertTo-Json -Depth 4
if ($issues.Count -ne 0) { exit 1 }

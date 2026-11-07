$ErrorActionPreference = 'Stop'
$posRoot = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent $posRoot
$toolsRoot = Join-Path $workspace '.tmp/android-tools'
if (-not $env:JAVA_HOME) {
    $localJdk = Get-ChildItem (Join-Path $toolsRoot 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
}
if (-not $env:ANDROID_HOME -and (Test-Path (Join-Path $toolsRoot 'sdk'))) {
    $env:ANDROID_HOME = Join-Path $toolsRoot 'sdk'
}
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'Set JAVA_HOME (JDK 17) and ANDROID_HOME (Android SDK) first.' }
$env:Path = "$env:JAVA_HOME/bin;$env:Path"
$env:GRADLE_USER_HOME = Join-Path $toolsRoot 'gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $toolsRoot 'android-user'
$signingRoot = Join-Path $posRoot 'local-data/android-signing'
New-Item -ItemType Directory -Path $signingRoot -Force | Out-Null
$credentialFile = Join-Path $signingRoot 'credentials.json'
$keyFile = Join-Path $signingRoot 'release.jks'
if (-not (Test-Path -LiteralPath $credentialFile)) {
    if (Test-Path -LiteralPath $keyFile) { throw 'Signing key exists without credentials. Restore the original credentials; do not replace the key.' }
    $keyPassword = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    @{ password = $keyPassword } | ConvertTo-Json | Set-Content -LiteralPath $credentialFile -Encoding utf8
}
$env:POS_ANDROID_STORE_PASSWORD = (Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json).password
$env:POS_ANDROID_KEYSTORE = $keyFile
if (-not (Test-Path -LiteralPath $keyFile)) {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $keyFile -storetype JKS -alias 8sian-pos -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=8 Sian POS, O=8 Sian, C=TH' -storepass:env POS_ANDROID_STORE_PASSWORD -keypass:env POS_ANDROID_STORE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
}
try {
    & (Join-Path $posRoot 'android/gradlew.bat') -p (Join-Path $posRoot 'android') assembleRelease --console=plain --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    $releaseDir = Join-Path $posRoot 'release'
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $posRoot 'android/app/build/outputs/apk/release/app-release.apk') -Destination (Join-Path $releaseDir '8-Sian-POS-Huawei-0.6.12.apk')
    Write-Output 'APK: pos/release/8-Sian-POS-Huawei-0.6.12.apk'
    Write-Output 'Back up pos/local-data/android-signing privately. Future updates must use this same key.'
} finally {
    Remove-Item Env:POS_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:POS_ANDROID_KEYSTORE -ErrorAction SilentlyContinue
}

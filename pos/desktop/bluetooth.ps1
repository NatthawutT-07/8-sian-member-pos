$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ble = $null
$service = $null
$sent = 0
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Devices.Bluetooth.BluetoothLEDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
    [Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime] | Out-Null
    [Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
    [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
    [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
    $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
        $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    function Await-WinRT($Operation, [Type]$ResultType) {
        $task = $script:asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        if (-not $task.Wait(15000)) { throw 'Bluetooth timeout; check printer power and distance' }
        $task.GetAwaiter().GetResult()
    }
    if ($request.action -eq 'list') {
        $selector = [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelector()
        $devices = Await-WinRT ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
        $found = @($devices | Where-Object { $_.Name -match '^JP80H' } | ForEach-Object {
            @{ id = $_.Id; name = $_.Name }
        })
        @{ ok = $true; devices = $found } | ConvertTo-Json -Depth 4 -Compress
        exit 0
    }
    if ($request.action -notin @('probe','write') -or $request.deviceId -notlike 'BluetoothLE#*') {
        throw 'Invalid Bluetooth request'
    }
    $ble = Await-WinRT ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromIdAsync([string]$request.deviceId)) ([Windows.Devices.Bluetooth.BluetoothLEDevice])
    if ($null -eq $ble -or $ble.Name -notmatch '^JP80H') { throw 'JP80H printer unavailable' }
    $services = Await-WinRT ($ble.GetGattServicesForUuidAsync([Guid]'000018f0-0000-1000-8000-00805f9b34fb',[Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
    if ($services.Status -ne 'Success' -or $services.Services.Count -ne 1) { throw ('Print service: ' + $services.Status) }
    $service = @($services.Services | ForEach-Object { $_ })[0]
    $chars = Await-WinRT ($service.GetCharacteristicsForUuidAsync([Guid]'00002af1-0000-1000-8000-00805f9b34fb',[Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
    if ($chars.Status -ne 'Success' -or $chars.Characteristics.Count -ne 1) { throw ('Print channel: ' + $chars.Status) }
    $channel = @($chars.Characteristics | ForEach-Object { $_ })[0]
    # Use the negotiated ATT MTU, with a conservative cap for printer firmware buffers.
    $chunkSize = 20
    if ($service.Session.MaxPduSize -gt 23) { $chunkSize = [Math]::Min(180, [int]$service.Session.MaxPduSize - 3) }
    if ($request.action -eq 'write') {
        [byte[]]$payload = [Convert]::FromBase64String([string]$request.base64)
        if ($payload.Length -lt 1 -or $payload.Length -gt 2000000) { throw 'Invalid print job size' }
        for ($offset = 0; $offset -lt $payload.Length; $offset += $chunkSize) {
            $last = [Math]::Min($offset + $chunkSize - 1, $payload.Length - 1)
            $buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer([byte[]]$payload[$offset..$last])
            $status = Await-WinRT ($channel.WriteValueAsync($buffer,[Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithResponse)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus])
            if ($status -ne 'Success') { throw ('Bluetooth write: ' + $status) }
            $sent += $last - $offset + 1
        }
    }
    @{ ok = $true; name = $ble.Name; connected = ($ble.ConnectionStatus -eq 'Connected'); bytesSent = $sent; packetBytes = $chunkSize } | ConvertTo-Json -Compress
} catch {
    @{ ok = $false; error = $_.Exception.Message; bytesSent = $sent } | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($null -ne $service) { try { $service.Dispose() } catch {} }
    if ($null -ne $ble) { try { $ble.Dispose() } catch {} }
}

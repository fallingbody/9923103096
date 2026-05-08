Write-Host "=== System Status Check ===" -ForegroundColor Cyan

$baseURL = "http://4.224.186.213/evaluation-service"
$token = "Bearer valid-token"

$endpoints = @(
    @{name = "Health Check"; url = "/health"; method = "GET"}
    @{name = "Send Notification"; url = "/api/v1/notifications/send"; method = "POST"}
    @{name = "Get Notifications"; url = "/api/v1/notifications?studentId=test"; method = "GET"}
    @{name = "Priority Notifications"; url = "/api/v1/notifications/priority?studentId=test&limit=5"; method = "GET"}
    @{name = "Bulk Mark Read"; url = "/api/v1/notifications/bulk/read"; method = "PATCH"}
)

$passed = 0
$failed = 0

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri "$baseURL$($endpoint.url)" -Method $endpoint.method -Headers @{"Authorization" = $token} -UseBasicParsing -ErrorAction SilentlyContinue
        Write-Host "OK: $($endpoint.name) - WORKING" -ForegroundColor Green
        $passed++
    } catch {
        Write-Host "FAIL: $($endpoint.name) - FAILED" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Summary: $passed/5 endpoints working" -ForegroundColor Yellow
if ($failed -eq 0) {
    Write-Host "All systems operational!" -ForegroundColor Green
} else {
    Write-Host "Some endpoints are down" -ForegroundColor Red
}

Write-Host "=== Notification Service Check ===" -ForegroundColor Cyan

$baseURL = "http://4.224.186.213/evaluation-service"
$token = "Bearer valid-token"

$endpoints = @(
    @{
        name = "Health Check"
        url = "/health"
        method = "GET"
    },
    @{
        name = "Fetch Provided Notifications"
        url = "/notifications"
        method = "GET"
    },
    @{
        name = "Send Notification"
        url = "/api/v1/notifications/send"
        method = "POST"
        body = @{
            studentId = "1042"
            type = "Placement"
            title = "Placement Drive"
            message = "Test notification"
        }
    },
    @{
        name = "Get Notifications"
        url = "/api/v1/notifications?studentId=1042"
        method = "GET"
    },
    @{
        name = "Priority Notifications"
        url = "/api/v1/notifications/priority?studentId=1042&limit=5"
        method = "GET"
    },
    @{
        name = "Bulk Mark Read"
        url = "/api/v1/notifications/bulk/read"
        method = "PATCH"
        body = @{ notificationIds = @("sample-id") }
    }
)

$passed = 0
$failed = 0

foreach ($endpoint in $endpoints) {
    try {
        $params = @{
            Uri = "$baseURL$($endpoint.url)"
            Method = $endpoint.method
            Headers = @{ Authorization = $token }
            UseBasicParsing = $true
            ErrorAction = "Stop"
        }

        if ($endpoint.ContainsKey("body")) {
            $params.ContentType = "application/json"
            $params.Body = ($endpoint.body | ConvertTo-Json -Depth 5)
        }

        Invoke-WebRequest @params | Out-Null
        Write-Host "OK: $($endpoint.name)" -ForegroundColor Green
        $passed++
    } catch {
        Write-Host "FAIL: $($endpoint.name) - $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Summary: $passed/$($endpoints.Count) checks passed" -ForegroundColor Yellow

if ($failed -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
} else {
    Write-Host "Some checks failed." -ForegroundColor Red
}

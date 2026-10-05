$ErrorActionPreference = 'Continue'
$status = npx.cmd supabase status -o env 2>$null
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
function Get-LocalValue([string]$name) {
  $line = $status | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { throw "Missing local Supabase value: $name" }
  return ($line -replace "^$name=", '').Trim('"')
}

$api = Get-LocalValue 'API_URL'
$anon = Get-LocalValue 'ANON_KEY'
$dbContainer = 'supabase_db_tindahan'
$functionHeaders = @{ apikey = $anon; 'Content-Type' = 'application/json' }

function Invoke-Json([string]$uri, [hashtable]$headers, [object]$body) {
  $client = New-Object System.Net.Http.HttpClient
  $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $uri)
  foreach ($key in $headers.Keys) {
    if ($key -ne 'Content-Type') { $request.Headers.TryAddWithoutValidation($key, $headers[$key]) | Out-Null }
  }
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $responseHeaders = @{}
  foreach ($header in $response.Headers) { $responseHeaders[$header.Key] = ($header.Value -join ',') }
  foreach ($header in $response.Content.Headers) { $responseHeaders[$header.Key] = ($header.Value -join ',') }
  $client.Dispose()
  return @{ Status = [int]$response.StatusCode; Body = if ($content) { $content | ConvertFrom-Json } else { $null }; Headers = $responseHeaders }
}

function Invoke-Checkout([string]$name, [string]$token, [string]$ip) {
  $headers = $functionHeaders.Clone()
  $headers['x-forwarded-for'] = $ip
  $result = Invoke-Json "$api/functions/v1/checkout" $headers @{
    idempotencyKey = [guid]::NewGuid().ToString()
    guestToken = $token
    publishedMenuId = '15000000-0000-4000-8000-000000000001'
    items = @(@{
      publishedMenuItemId = '25000000-0000-4000-8000-000000000001'
      quantity = 1
      expectedUnitPriceCentavos = 8000
    })
    customerName = $name
    exactAddress = 'Hardening integration address'
    locationClassification = 'NEARBY'
    selectedAreaName = 'Marycris Complex'
    paymentMethod = 'ONLINE_PAYMENT'
  }
  if ($result.Status -ne 201) { throw "Checkout failed: $($result.Status)" }
  return $result.Body
}

function Invoke-GuestJson([object]$order, [string]$token, [string]$action, [string]$ip, [hashtable]$extra = @{}) {
  $headers = $functionHeaders.Clone()
  $headers['x-forwarded-for'] = $ip
  $body = @{ action = $action; orderCode = $order.order_code; guestToken = $token }
  foreach ($key in $extra.Keys) { $body[$key] = $extra[$key] }
  return Invoke-Json "$api/functions/v1/guest-access" $headers $body
}

function Invoke-Upload(
  [object]$order,
  [string]$token,
  [byte[]]$bytes,
  [string]$mime,
  [string]$filename,
  [string]$purpose,
  [string]$ip
) {
  $client = New-Object System.Net.Http.HttpClient
  $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$api/functions/v1/guest-access")
  $request.Headers.Add('apikey', $anon)
  $request.Headers.Add('x-forwarded-for', $ip)
  $form = New-Object System.Net.Http.MultipartFormDataContent
  $form.Add((New-Object System.Net.Http.StringContent($order.order_code)), 'orderCode')
  $form.Add((New-Object System.Net.Http.StringContent($token)), 'guestToken')
  $form.Add((New-Object System.Net.Http.StringContent($purpose)), 'purpose')
  $file = New-Object System.Net.Http.ByteArrayContent -ArgumentList @(,$bytes)
  $file.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue($mime)
  $form.Add($file, 'file', $filename)
  $request.Content = $form
  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $client.Dispose()
  return @{ Status = [int]$response.StatusCode; Body = if ($content) { $content | ConvertFrom-Json } else { $null } }
}

function Assert([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
}

$seedSql = @"
insert into public.published_menus (id,image_path,is_current,activated_at,expires_at)
values ('15000000-0000-4000-8000-000000000001','menus/hardening-edge.jpg',true,statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour');
insert into public.published_menu_items (id,published_menu_id,name_snapshot,category_snapshot,unit_price_centavos,internal_df_centavos,photo_path_snapshot,is_sold_out,sort_order)
values ('25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','Hardening Adobo','ULAM',8000,1000,'items/adobo.jpg',false,1);
"@
$seedSql | docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Null

$tokenA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
$tokenB = 'BCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr'
$orderA = Invoke-Checkout 'Hardening A' $tokenA '198.51.100.1'
$orderB = Invoke-Checkout 'Hardening B' $tokenB '198.51.100.2'

for ($index = 1; $index -le 30; $index += 1) {
  $result = Invoke-GuestJson $orderA $tokenA 'receipt' '198.51.100.10'
  Assert ($result.Status -eq 200) "Receipt request $index should be below or at the threshold"
}
$limited = Invoke-GuestJson $orderA $tokenA 'receipt' '198.51.100.10'
Assert ($limited.Status -eq 429) 'The first request above the receipt threshold must return 429'
Assert ($limited.Body.error.code -eq 'RATE_LIMITED') 'The 429 response must use RATE_LIMITED'
Assert ([int]$limited.Headers['Retry-After'] -gt 0) 'The 429 response must include Retry-After'
Assert ((Invoke-GuestJson $orderB $tokenB 'receipt' '198.51.100.11').Status -eq 200) 'An independent guest must retain its own limit'
Assert ((Invoke-GuestJson $orderA $tokenA 'list_messages' '198.51.100.10').Status -eq 200) 'Different guest actions must have independent limits'
$wrongToken = 'CDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrs'
Assert ((Invoke-GuestJson $orderB $wrongToken 'receipt' '198.51.100.12').Status -eq 401) 'Rate limiting must not replace guest authorization'

$jpeg = [byte[]](0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46)
$png = [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00)
$webp = [byte[]](0x52,0x49,0x46,0x46,0x04,0x00,0x00,0x00,0x57,0x45,0x42,0x50,0x00)

$jpegUpload = Invoke-Upload $orderA $tokenA $jpeg 'image/jpeg' 'photo.jpg' 'CHAT_IMAGE' '198.51.100.20'
Assert ($jpegUpload.Status -eq 201) 'Valid JPEG upload should succeed'
$pngUpload = Invoke-Upload $orderA $tokenA $png 'image/png' 'payment.png' 'PAYMENT_EVIDENCE' '198.51.100.21'
Assert ($pngUpload.Status -eq 201) 'Valid PNG payment evidence should succeed'
$webpUpload = Invoke-Upload $orderA $tokenA $webp 'image/webp' 'photo.webp' 'CHAT_IMAGE' '198.51.100.22'
Assert ($webpUpload.Status -eq 201) 'Valid WebP upload should succeed'
$ignoredFilename = Invoke-Upload $orderA $tokenA $jpeg 'image/jpeg' 'spoofed.exe' 'CHAT_IMAGE' '198.51.100.23'
Assert ($ignoredFilename.Status -eq 201) 'A client filename is ignored when validated bytes and MIME are safe'
$badType = Invoke-Upload $orderA $tokenA ([byte[]](0x3c,0x68,0x74,0x6d,0x6c)) 'text/html' 'attack.html' 'CHAT_IMAGE' '198.51.100.24'
Assert ($badType.Status -eq 400 -and $badType.Body.error.code -eq 'INVALID_FILE_TYPE') 'Disallowed types must be rejected safely'
$spoofedMime = Invoke-Upload $orderA $tokenA $jpeg 'image/png' 'spoofed.png' 'CHAT_IMAGE' '198.51.100.25'
Assert ($spoofedMime.Status -eq 400 -and $spoofedMime.Body.error.code -eq 'INVALID_IMAGE_CONTENT') 'MIME and magic-byte mismatch must be rejected'
$oversized = New-Object byte[] (5242881)
$oversized[0] = 0xff; $oversized[1] = 0xd8; $oversized[2] = 0xff
$tooLarge = Invoke-Upload $orderA $tokenA $oversized 'image/jpeg' 'large.jpg' 'CHAT_IMAGE' '198.51.100.26'
Assert ($tooLarge.Status -eq 413 -and $tooLarge.Body.error.code -eq 'FILE_TOO_LARGE') 'Oversized images must be rejected'

$attachmentId = $jpegUpload.Body.attachment.id
$crossRead = Invoke-GuestJson $orderB $tokenB 'signed_read' '198.51.100.30' @{ attachmentId = $attachmentId }
Assert ($crossRead.Status -eq 403) 'Cross-order signed reads must remain denied'
$signed = Invoke-GuestJson $orderA $tokenA 'signed_read' '198.51.100.31' @{ attachmentId = $attachmentId }
Assert ($signed.Status -eq 200 -and $signed.Body.expiresIn -eq 60) 'Authorized signed read should succeed'
$signedRead = Invoke-WebRequest -Uri "$api$($signed.Body.signedUrl)" -UseBasicParsing
Assert ($signedRead.StatusCode -eq 200) 'The short-lived signed URL should read the private object'
$unsignedPath = "$api/storage/v1/object/message-media/orders/$($orderA.order_id)/messages/$attachmentId.jpg"
try {
  Invoke-WebRequest -Uri $unsignedPath -UseBasicParsing | Out-Null
  throw 'Direct unsigned private read unexpectedly succeeded'
} catch {
  Assert ($_.Exception.Response.StatusCode.value__ -ne 200) 'Direct unsigned private read must fail'
}

$expiredToken = 'DEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrst'
$sha = [System.Security.Cryptography.SHA256]::Create()
$expiredHash = -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($expiredToken)) | ForEach-Object { $_.ToString('x2') })
$expiredSql = @"
insert into public.orders (id,order_code,source,published_menu_id,customer_name,exact_address,location_classification,selected_area_name,payment_method,payment_verification_state,delivery_threshold_centavos,base_charge_below_threshold_centavos,far_area_rate_centavos,food_subtotal_centavos,internal_df_total_centavos,base_delivery_charge_centavos,far_area_charge_centavos,guest_access_token_hash,guest_chat_expires_at,original_snapshot,created_at,last_edited_at)
values ('45000000-0000-4000-8000-000000000001','CRD-EXPRD23456','ONLINE','15000000-0000-4000-8000-000000000001','Expired Hardening','Address','NEARBY','Marycris Complex','ONLINE_PAYMENT','NOT_VERIFIED',2000,1500,2000,8000,1000,1500,0,'$expiredHash',statement_timestamp()-interval '1 hour','{"snapshot_version":1}',statement_timestamp()-interval '25 hours',statement_timestamp()-interval '25 hours');
"@
$expiredSql | docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Null
$expiredOrder = [pscustomobject]@{ order_code = 'CRD-EXPRD23456'; order_id = '45000000-0000-4000-8000-000000000001' }
Assert ((Invoke-Upload $expiredOrder $expiredToken $jpeg 'image/jpeg' 'expired.jpg' 'CHAT_IMAGE' '198.51.100.32').Status -eq 403) 'Expired guests cannot upload'
Assert ((Invoke-GuestJson $expiredOrder $expiredToken 'signed_read' '198.51.100.33' @{ attachmentId = $attachmentId }).Status -eq 403) 'Expired guests cannot request signed reads'

$evidenceId = $pngUpload.Body.attachment.id
$cleanupSetup = @"
update public.message_attachments set retained_until = statement_timestamp() - interval '1 second' where id = '$evidenceId';
insert into public.message_attachments (id,order_id,purpose,bucket_id,storage_path,mime_type,size_bytes,created_by_type,created_at,retained_until)
values ('75000000-0000-4000-8000-000000000001','$($orderA.order_id)','PAYMENT_EVIDENCE','payment-evidence','orders/$($orderA.order_id)/evidence/missing.jpg','image/jpeg',10,'GUEST',statement_timestamp()-interval '31 days',statement_timestamp()-interval '1 day');
"@
$cleanupSetup | docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Null
$cleanup = Invoke-Json "$api/functions/v1/retention-cleanup" @{ 'Content-Type'='application/json'; 'x-cleanup-secret'='phase-1-4-local-cleanup-secret-64-characters-long-test-only-value' } @{ source='integration-test' }
Assert ($cleanup.Status -eq 200 -and $cleanup.Body.deleted -eq 2 -and $cleanup.Body.failed -eq 0) 'Cleanup should delete existing and tolerate missing objects'
$cleanupState = (docker exec $dbContainer psql -U postgres -d postgres -tAc "select count(*) from public.message_attachments where id in ('$evidenceId','75000000-0000-4000-8000-000000000001') and deleted_at is not null").Trim()
Assert ($cleanupState -eq '2') 'Cleanup must tombstone both completed metadata rows'
$preserved = (docker exec $dbContainer psql -U postgres -d postgres -tAc "select (exists(select 1 from public.orders where id='$($orderA.order_id)') and exists(select 1 from public.messages m join public.message_attachments a on a.message_id=m.id where a.id='$evidenceId'))::text").Trim()
Assert ($preserved -eq 'true') 'Cleanup must preserve order and message history'
$cleanupAgain = Invoke-Json "$api/functions/v1/retention-cleanup" @{ 'Content-Type'='application/json'; 'x-cleanup-secret'='phase-1-4-local-cleanup-secret-64-characters-long-test-only-value' } @{ source='integration-test' }
Assert ($cleanupAgain.Status -eq 200 -and $cleanupAgain.Body.processed -eq 0) 'Cleanup reruns must be idempotent'

Write-Output 'Phase 1.4 Edge/Storage integration: PASS'

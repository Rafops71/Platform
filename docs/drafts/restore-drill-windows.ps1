$f = Read-Host "Full path of the backup file (for example C:\Users\you\Downloads\db-2026-11-22.dump.enc)"
$sec = Read-Host "Your phrase (it will not show on screen)" -AsSecureString
$pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$b = [IO.File]::ReadAllBytes($f.Trim('"'))
if ([Text.Encoding]::ASCII.GetString($b,0,8) -ne 'Salted__') { "NOT A BACKUP FILE: it does not start with the lock marker."; return }
$salt = [byte[]]$b[8..15]
$kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($pw, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
$kv = $kdf.GetBytes(48)
$aes = [Security.Cryptography.Aes]::Create()
$aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'
$aes.Key = [byte[]]$kv[0..31]; $aes.IV = [byte[]]$kv[32..47]
try { $dec = $aes.CreateDecryptor().TransformFinalBlock($b, 16, $b.Length - 16) } catch { "WRONG PHRASE, or the file is damaged. Nothing was saved."; return }
$head = [Text.Encoding]::ASCII.GetString($dec, 0, 5)
if ($head -eq 'PGDMP') { "OK: your phrase opens this backup. It starts with PGDMP and holds $($dec.Length) bytes. Nothing was saved." } else { "The file opened but does not look like a database copy." }

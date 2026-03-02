import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '167.172.51.232', username: 'root' },
  { host: '167.99.90.211', username: 'root' },
  { host: '46.101.86.238', username: 'root' },
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCmltcG9ydCBqc29uCmltcG9ydCBvcwoKdmlzaXRfY291bnQgPSAwCmVycm9yX2NvdW50ID0gMApsb2NrID0gdGhyZWFkaW5nLkxvY2soKQpTVEFUVVNfRklMRSA9ICIvcm9vdC92aXNpdF9zdGF0dXMuanNvbiIKCiMgUmVhbGlzdGljIFVzZXItQWdlbnRzIChEZXNrdG9wICsgTW9iaWxlIG1peCkKVVNFUl9BR0VOVFMgPSBbCiAgICAjIFdpbmRvd3MgQ2hyb21lCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIxLjAuMC4wIFNhZmFyaS81MzcuMzYnLAogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTEuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICMgTWFjIENocm9tZQogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMS4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICMgV2luZG93cyBGaXJlZm94CiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTIzLjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTIzLjAnLAogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEyMi4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEyMi4wJywKICAgICMgTWFjIFNhZmFyaQogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4yIFNhZmFyaS82MDUuMS4xNScsCiAgICAjIGlQaG9uZSBTYWZhcmkKICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzMgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgJ01vemlsbGEvNS4wIChpUGhvbmU7IENQVSBpUGhvbmUgT1MgMTdfMiBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTcuMSBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScsCiAgICAjIEFuZHJvaWQgQ2hyb21lCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBTTS1TOTE4QikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBQaXhlbCA4KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIE1vYmlsZSBTYWZhcmkvNTM3LjM2JywKICAgICMgaVBhZCBTYWZhcmkKICAgICdNb3ppbGxhLzUuMCAoaVBhZDsgQ1BVIE9TIDE3XzMgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgIyBXaW5kb3dzIEVkZ2UKICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIFNhZmFyaS81MzcuMzYgRWRnLzEyMi4wLjAuMCcsCl0KCiMgUmVhbGlzdGljIHNjcmVlbiByZXNvbHV0aW9ucwpTQ1JFRU5fU0laRVMgPSBbCiAgICAoMTkyMCwgMTA4MCksICgxMzY2LCA3NjgpLCAoMTUzNiwgODY0KSwgKDE0NDAsIDkwMCksCiAgICAoMTI4MCwgNzIwKSwgKDE2MDAsIDkwMCksICgyNTYwLCAxNDQwKSwgKDEyODAsIDgwMCksCiAgICAoMzkwLCA4NDQpLCAoMzkzLCA4NzMpLCAoNDE0LCA4OTYpLCAoMzc1LCA4MTIpLCAgIyBNb2JpbGUKICAgICg4MjAsIDExODApLCAoNzY4LCAxMDI0KSwgICMgVGFibGV0Cl0KCiMgUmVhbGlzdGljIHJlZmVycmVycwpSRUZFUlJFUlMgPSBbCiAgICAnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS8nLAogICAgJ2h0dHBzOi8vd3d3Lmdvb2dsZS5jb20vc2VhcmNoP3E9JywKICAgICdodHRwczovL3d3dy5nb29nbGUuY29tLnNhLycsCiAgICAnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS5zYS9zZWFyY2g/cT0nLAogICAgJycsICAjIERpcmVjdCB2aXNpdCAobm8gcmVmZXJyZXIpCiAgICAnJywgICMgRGlyZWN0IHZpc2l0CiAgICAnaHR0cHM6Ly90LmNvLycsCiAgICAnaHR0cHM6Ly93d3cuZmFjZWJvb2suY29tLycsCiAgICAnaHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS8nLApdCgojIEFjY2VwdC1MYW5ndWFnZSBoZWFkZXJzIChTYXVkaS9BcmFiaWMgZm9jdXNlZCkKQUNDRVBUX0xBTkdTID0gWwogICAgJ2FyLVNBLGFyO3E9MC45LGVuLVVTO3E9MC44LGVuO3E9MC43JywKICAgICdhcixlbi1VUztxPTAuOSxlbjtxPTAuOCcsCiAgICAnYXItU0EsYXI7cT0wLjksZW47cT0wLjgnLAogICAgJ2VuLVVTLGVuO3E9MC45LGFyO3E9MC44JywKICAgICdhci1TQSxlbi1VUztxPTAuOCxlbjtxPTAuNycsCl0KCmRlZiB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCBzdGF0dXM9InJ1bm5pbmciKToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIGVsYXBzZWQgPSBpbnQodGltZS50aW1lKCkgLSBzdGFydF90aW1lKQogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgcmVtYWluaW5nID0gbWF4KDAsIHRvdGFsX3NlY29uZHMgLSBlbGFwc2VkKQogICAgcHJvZ3Jlc3MgPSBtaW4oMTAwLCByb3VuZCgodmlzaXRfY291bnQgLyBtYXhfdmlzaXRvcnMpICogMTAwLCAxKSkgaWYgbWF4X3Zpc2l0b3JzID4gMCBlbHNlIDAKICAgIGRhdGEgPSB7CiAgICAgICAgInN0YXR1cyI6IHN0YXR1cywKICAgICAgICAidmlzaXRzIjogdmlzaXRfY291bnQsCiAgICAgICAgInRhcmdldCI6IG1heF92aXNpdG9ycywKICAgICAgICAicHJvZ3Jlc3MiOiBwcm9ncmVzcywKICAgICAgICAiZWxhcHNlZCI6IGVsYXBzZWQsCiAgICAgICAgInJlbWFpbmluZyI6IHJlbWFpbmluZywKICAgICAgICAiZXJyb3JzIjogZXJyb3JfY291bnQsCiAgICAgICAgInRpbWVzdGFtcCI6IGludCh0aW1lLnRpbWUoKSkKICAgIH0KICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4oU1RBVFVTX0ZJTEUsICJ3IikgYXMgZjoKICAgICAgICAgICAganNvbi5kdW1wKGRhdGEsIGYpCiAgICBleGNlcHQ6CiAgICAgICAgcGFzcwoKZGVmIGNyZWF0ZV9icm93c2VyKHByb3h5PU5vbmUpOgogICAgY28gPSBDaHJvbWl1bU9wdGlvbnMoKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWhlYWRsZXNzPW5ldycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbm8tc2FuZGJveCcpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1ncHUnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZGV2LXNobS11c2FnZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1leHRlbnNpb25zJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWxvZ2dpbmcnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZGVmYXVsdC1hcHBzJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1uby1maXJzdC1ydW4nKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtYmFja2dyb3VuZC1uZXR3b3JraW5nJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLXN5bmMnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtdHJhbnNsYXRlJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1tdXRlLWF1ZGlvJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWZlYXR1cmVzPVRyYW5zbGF0ZVVJJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWlwYy1mbG9vZGluZy1wcm90ZWN0aW9uJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLXJlbmRlcmVyLWJhY2tncm91bmRpbmcnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtYmFja2dyb3VuZGluZy1vY2NsdWRlZC13aW5kb3dzJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWhhbmctbW9uaXRvcicpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1wcm9tcHQtb24tcmVwb3N0JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWRvbWFpbi1yZWxpYWJpbGl0eScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1jb21wb25lbnQtdXBkYXRlJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1tZXRyaWNzLXJlY29yZGluZy1vbmx5JykKICAgICMgRGlzYWJsZSBpbWFnZXMgdG8gc2F2ZSBSQU0gYW5kIHNwZWVkIHVwCiAgICBjby5zZXRfYXJndW1lbnQoJy0tYmxpbmstc2V0dGluZ3M9aW1hZ2VzRW5hYmxlZD1mYWxzZScpCiAgICAjIE1lbW9yeSBvcHRpbWl6YXRpb24KICAgIGNvLnNldF9hcmd1bWVudCgnLS1qcy1mbGFncz0tLW1heC1vbGQtc3BhY2Utc2l6ZT0xMjgnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtc29mdHdhcmUtcmFzdGVyaXplcicpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tc2luZ2xlLXByb2Nlc3MnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLXp5Z290ZScpCiAgICAKICAgICMgUmFuZG9tIHNjcmVlbiBzaXplCiAgICBzY3JlZW4gPSByYW5kb20uY2hvaWNlKFNDUkVFTl9TSVpFUykKICAgIGNvLnNldF9hcmd1bWVudChmJy0td2luZG93LXNpemU9e3NjcmVlblswXX0se3NjcmVlblsxXX0nKQogICAgCiAgICAjIFByb3h5CiAgICBpZiBwcm94eToKICAgICAgICBjby5zZXRfYXJndW1lbnQoZictLXByb3h5LXNlcnZlcj17cHJveHlbImhvc3QiXX06e3Byb3h5WyJwb3J0Il19JykKICAgIAogICAgIyBSYW5kb20gVXNlci1BZ2VudAogICAgdWEgPSByYW5kb20uY2hvaWNlKFVTRVJfQUdFTlRTKQogICAgY28uc2V0X3VzZXJfYWdlbnQodWEpCiAgICAKICAgICMgQWNjZXB0IGxhbmd1YWdlCiAgICBsYW5nID0gcmFuZG9tLmNob2ljZShBQ0NFUFRfTEFOR1MpCiAgICBjby5zZXRfYXJndW1lbnQoZictLWxhbmc9e2xhbmcuc3BsaXQoIiwiKVswXX0nKQogICAgCiAgICB0cnk6CiAgICAgICAgcGFnZSA9IENocm9taXVtUGFnZShhZGRyX29yX29wdHM9Y28pCiAgICAgICAgcmV0dXJuIHBhZ2UKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICByZXR1cm4gTm9uZQoKZGVmIHdvcmtlcih3b3JrZXJfaWQsIHRhcmdldF91cmwsIG1heF92aXNpdHMsIGVuZF90aW1lLCBzdGFydF90aW1lLCBkdXJhdGlvbl9taW51dGVzLCBwcm94aWVzKToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIAogICAgdmlzaXRzX3RoaXNfYnJvd3NlciA9IDAKICAgIG1heF92aXNpdHNfcGVyX2Jyb3dzZXIgPSByYW5kb20ucmFuZGludCgyNSwgNDApICAjIFJlc3RhcnQgQ2hyb21lIGV2ZXJ5IDI1LTQwIHZpc2l0cwogICAgcGFnZSA9IE5vbmUKICAgIAogICAgd2hpbGUgdGltZS50aW1lKCkgPCBlbmRfdGltZToKICAgICAgICAjIENoZWNrIGlmIHdlIHJlYWNoZWQgdGFyZ2V0CiAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA+PSBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAKICAgICAgICAjIENyZWF0ZSBvciByZXN0YXJ0IGJyb3dzZXIKICAgICAgICBpZiBwYWdlIGlzIE5vbmUgb3IgdmlzaXRzX3RoaXNfYnJvd3NlciA+PSBtYXhfdmlzaXRzX3Blcl9icm93c2VyOgogICAgICAgICAgICBpZiBwYWdlOgogICAgICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgICAgIHBhZ2UucXVpdCgpCiAgICAgICAgICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgICAgICAgICAgcGFzcwogICAgICAgICAgICBwcm94eSA9IHJhbmRvbS5jaG9pY2UocHJveGllcykgaWYgcHJveGllcyBlbHNlIE5vbmUKICAgICAgICAgICAgcGFnZSA9IGNyZWF0ZV9icm93c2VyKHByb3h5KQogICAgICAgICAgICBpZiBwYWdlIGlzIE5vbmU6CiAgICAgICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICAgICAgZXJyb3JfY291bnQgKz0gMQogICAgICAgICAgICAgICAgdGltZS5zbGVlcCgyKQogICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgdmlzaXRzX3RoaXNfYnJvd3NlciA9IDAKICAgICAgICAgICAgbWF4X3Zpc2l0c19wZXJfYnJvd3NlciA9IHJhbmRvbS5yYW5kaW50KDI1LCA0MCkKICAgICAgICAKICAgICAgICB0cnk6CiAgICAgICAgICAgICMgVmlzaXQgdGhlIHBhZ2UKICAgICAgICAgICAgcGFnZS5nZXQodGFyZ2V0X3VybCkKICAgICAgICAgICAgCiAgICAgICAgICAgICMgU21hbGwgcmFuZG9tIGRlbGF5IGxpa2UgYSByZWFsIGh1bWFuICgwLjUgLSAyIHNlY29uZHMpCiAgICAgICAgICAgIHRpbWUuc2xlZXAocmFuZG9tLnVuaWZvcm0oMC41LCAyLjApKQogICAgICAgICAgICAKICAgICAgICAgICAgIyBDb3VudCBBRlRFUiBzdWNjZXNzZnVsIHZpc2l0CiAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgIGlmIHZpc2l0X2NvdW50IDwgbWF4X3Zpc2l0czoKICAgICAgICAgICAgICAgICAgICB2aXNpdF9jb3VudCArPSAxCiAgICAgICAgICAgICAgICAgICAgY3VycmVudCA9IHZpc2l0X2NvdW50CiAgICAgICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIAogICAgICAgICAgICB2aXNpdHNfdGhpc19icm93c2VyICs9IDEKICAgICAgICAgICAgCiAgICAgICAgICAgICMgVXBkYXRlIHN0YXR1cyBldmVyeSAxMCB2aXNpdHMKICAgICAgICAgICAgaWYgY3VycmVudCAlIDEwID09IDA6CiAgICAgICAgICAgICAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0cywgZHVyYXRpb25fbWludXRlcywgc3RhcnRfdGltZSwgInJ1bm5pbmciKQogICAgICAgICAgICAgICAgCiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICBlcnJvcl9jb3VudCArPSAxCiAgICAgICAgICAgICMgSWYgQ2hyb21lIGNyYXNoZWQsIHJlc2V0IGl0CiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgIHBhZ2UucXVpdCgpCiAgICAgICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAgcGFnZSA9IE5vbmUKICAgICAgICAgICAgdGltZS5zbGVlcCgxKQogICAgCiAgICAjIENsZWFudXAKICAgIGlmIHBhZ2U6CiAgICAgICAgdHJ5OgogICAgICAgICAgICBwYWdlLnF1aXQoKQogICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgcGFzcwoKZGVmIHJ1bl9hdHRhY2sodGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzPTEwMCwgZHVyYXRpb25fbWludXRlcz01LCBwcm94aWVzPU5vbmUpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgdmlzaXRfY291bnQgPSAwCiAgICBlcnJvcl9jb3VudCA9IDAKCiAgICB0b3RhbF9zZWNvbmRzID0gZHVyYXRpb25fbWludXRlcyAqIDYwCiAgICAjIDI1IHRocmVhZHMgLSBzYWZlIGZvciA4R0IgUkFNIChpbWFnZXMgZGlzYWJsZWQgPSB+MjAwTUIgcGVyIENocm9tZSkKICAgIG51bV90aHJlYWRzID0gbWluKDI1LCBtYXgoNSwgbWF4X3Zpc2l0b3JzIC8vIDEwKSkKCiAgICBzdGFydF90aW1lID0gdGltZS50aW1lKCkKICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsICJzdGFydGluZyIpCgogICAgcHJveHlfaW5mbyA9IGYiIHwgUHJveGllczoge2xlbihwcm94aWVzKX0iIGlmIHByb3hpZXMgZWxzZSAiIHwgTm8gcHJveHkiCiAgICBwcmludChmIlN0YXJ0aW5nOiB7bWF4X3Zpc2l0b3JzfSB2aXNpdG9ycyBpbiB7ZHVyYXRpb25fbWludXRlc30gbWluIHwge251bV90aHJlYWRzfSB0aHJlYWRze3Byb3h5X2luZm99IikKCiAgICBlbmRfdGltZSA9IHRpbWUudGltZSgpICsgdG90YWxfc2Vjb25kcwogICAgdGhyZWFkcyA9IFtdCiAgICBmb3IgaSBpbiByYW5nZShudW1fdGhyZWFkcyk6CiAgICAgICAgdCA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PXdvcmtlciwgYXJncz0oaSwgdGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzLCBlbmRfdGltZSwgc3RhcnRfdGltZSwgZHVyYXRpb25fbWludXRlcywgcHJveGllcyBvciBbXSkpCiAgICAgICAgdC5kYWVtb24gPSBUcnVlCiAgICAgICAgdC5zdGFydCgpCiAgICAgICAgdGhyZWFkcy5hcHBlbmQodCkKICAgICAgICAjIFN0YWdnZXIgdGhyZWFkIHN0YXJ0cyB0byBhdm9pZCBSQU0gc3Bpa2UKICAgICAgICB0aW1lLnNsZWVwKDAuNSkKCiAgICB3aGlsZSBhbnkodC5pc19hbGl2ZSgpIGZvciB0IGluIHRocmVhZHMpOgogICAgICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsICJydW5uaW5nIikKICAgICAgICB0aW1lLnNsZWVwKDIpCgogICAgZm9yIHQgaW4gdGhyZWFkczoKICAgICAgICB0LmpvaW4odGltZW91dD01KQoKICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsICJmaW5pc2hlZCIpCiAgICBwcmludChmIkZpbmlzaGVkISBUb3RhbDoge3Zpc2l0X2NvdW50fSB2aXNpdHMgaW4ge2R1cmF0aW9uX21pbnV0ZXN9IG1pbnV0ZXMgfCBFcnJvcnM6IHtlcnJvcl9jb3VudH0iKQoKaWYgX19uYW1lX18gPT0gIl9fbWFpbl9fIjoKICAgIHVybCA9IHN5cy5hcmd2WzFdIGlmIGxlbihzeXMuYXJndikgPiAxIGVsc2UgImh0dHA6Ly9leGFtcGxlLmNvbSIKICAgIHZpc2l0b3JzID0gaW50KHN5cy5hcmd2WzJdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMiBlbHNlIDEwMAogICAgZHVyYXRpb24gPSBpbnQoc3lzLmFyZ3ZbM10pIGlmIGxlbihzeXMuYXJndikgPiAzIGVsc2UgNQogICAgcHJveHlfZmlsZSA9IHN5cy5hcmd2WzRdIGlmIGxlbihzeXMuYXJndikgPiA0IGVsc2UgTm9uZQoKICAgIHByb3hpZXMgPSBbXQogICAgaWYgcHJveHlfZmlsZToKICAgICAgICB0cnk6CiAgICAgICAgICAgIHdpdGggb3Blbihwcm94eV9maWxlLCAncicpIGFzIGY6CiAgICAgICAgICAgICAgICBwcm94aWVzID0ganNvbi5sb2FkKGYpCiAgICAgICAgICAgIHByaW50KGYiTG9hZGVkIHtsZW4ocHJveGllcyl9IHByb3hpZXMiKQogICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgcHJpbnQoIkZhaWxlZCB0byBsb2FkIHByb3hpZXMsIHJ1bm5pbmcgd2l0aG91dCBwcm94eSIpCgogICAgcnVuX2F0dGFjayh1cmwsIHZpc2l0b3JzLCBkdXJhdGlvbiwgcHJveGllcyBpZiBwcm94aWVzIGVsc2UgTm9uZSkK";

const SETUP_COMMAND = 'apt update -y && apt install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 fonts-liberation libappindicator3-1 xdg-utils && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt install -y ./google-chrome-stable_current_amd64.deb && rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage && echo "SETUP_COMPLETE"';

async function fireAndForget(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      try { conn.end(); } catch(e) {}
      resolve('Command sent (timeout)');
    }, 8000);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          try { conn.end(); } catch(e) {}
          return reject(err);
        }
        let output = '';
        let done = false;
        stream.on('data', (data) => {
          output += data.toString();
          if (!done && output.includes('\n')) {
            done = true;
            clearTimeout(timer);
            try { conn.end(); } catch(e) {}
            resolve(output.trim());
          }
        });
        stream.on('close', () => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            try { conn.end(); } catch(e) {}
            resolve(output.trim() || 'Command executed');
          }
        });
        stream.stderr.on('data', () => {});
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    }).connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 8000,
    });
  });
}

export async function POST(req) {
  try {
    const { action, url, visitors, duration, servers, proxies } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;

    const getCommand = () => {
      if (action === 'setup') {
        return `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started"`;
      } else if (action === 'deploy') {
        return `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Script deployed successfully"`;
      } else if (action === 'start') {
        if (!url) throw new Error("URL is required");
        const v = visitors || 100;
        const d = duration || 5;
        const killCmd = 'kill $(pgrep -f visit.py) 2>/dev/null; kill $(pgrep -f "chrome") 2>/dev/null; rm -f /root/visit_status.json; sleep 1';
        if (proxies && proxies.length > 0) {
          const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
          return `${killCmd} && echo "${proxyB64}" | base64 -d > /root/proxies.json && nohup python3 /root/visit.py "${url}" ${v} ${d} /root/proxies.json > /root/visit.log 2>&1 & echo "Started"`;
        }
        return `${killCmd} && nohup python3 /root/visit.py "${url}" ${v} ${d} > /root/visit.log 2>&1 & echo "Started"`;
      } else if (action === 'stop') {
        return `kill $(pgrep -f visit.py) 2>/dev/null; kill $(pgrep -f "chrome") 2>/dev/null; echo "Stopped"`;
      } else {
        throw new Error("Unknown action");
      }
    };

    const command = getCommand();

    const results = await Promise.all(
      serverList.map(async (server) => {
        try {
          const output = await fireAndForget(server, command);
          return { host: server.host, status: 'success', output };
        } catch (error) {
          return { host: server.host, status: 'error', error: error.message };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

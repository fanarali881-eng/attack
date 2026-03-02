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

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCmltcG9ydCBqc29uCmltcG9ydCBvcwoKdmlzaXRfY291bnQgPSAwCmVycm9yX2NvdW50ID0gMApsb2NrID0gdGhyZWFkaW5nLkxvY2soKQpTVEFUVVNfRklMRSA9ICIvcm9vdC92aXNpdF9zdGF0dXMuanNvbiIKCiMgUmVhbGlzdGljIFVzZXItQWdlbnRzIChEZXNrdG9wICsgTW9iaWxlIG1peCkKVVNFUl9BR0VOVFMgPSBbCiAgICAjIFdpbmRvd3MgQ2hyb21lCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIxLjAuMC4wIFNhZmFyaS81MzcuMzYnLAogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTEuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICMgTWFjIENocm9tZQogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMS4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICMgV2luZG93cyBGaXJlZm94CiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTIzLjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTIzLjAnLAogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEyMi4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEyMi4wJywKICAgICMgTWFjIFNhZmFyaQogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4yIFNhZmFyaS82MDUuMS4xNScsCiAgICAjIGlQaG9uZSBTYWZhcmkKICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzMgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgJ01vemlsbGEvNS4wIChpUGhvbmU7IENQVSBpUGhvbmUgT1MgMTdfMiBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTcuMSBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScsCiAgICAjIEFuZHJvaWQgQ2hyb21lCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBTTS1TOTE4QikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBQaXhlbCA4KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIE1vYmlsZSBTYWZhcmkvNTM3LjM2JywKICAgICMgaVBhZCBTYWZhcmkKICAgICdNb3ppbGxhLzUuMCAoaVBhZDsgQ1BVIE9TIDE3XzMgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgIyBXaW5kb3dzIEVkZ2UKICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIFNhZmFyaS81MzcuMzYgRWRnLzEyMi4wLjAuMCcsCl0KCiMgUmVhbGlzdGljIHNjcmVlbiByZXNvbHV0aW9ucwpTQ1JFRU5fU0laRVMgPSBbCiAgICAoMTkyMCwgMTA4MCksICgxMzY2LCA3NjgpLCAoMTUzNiwgODY0KSwgKDE0NDAsIDkwMCksCiAgICAoMTI4MCwgNzIwKSwgKDE2MDAsIDkwMCksICgyNTYwLCAxNDQwKSwgKDEyODAsIDgwMCksCiAgICAoMzkwLCA4NDQpLCAoMzkzLCA4NzMpLCAoNDE0LCA4OTYpLCAoMzc1LCA4MTIpLCAgIyBNb2JpbGUKICAgICg4MjAsIDExODApLCAoNzY4LCAxMDI0KSwgICMgVGFibGV0Cl0KCiMgUmVhbGlzdGljIHJlZmVycmVycwpSRUZFUlJFUlMgPSBbCiAgICAnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS8nLAogICAgJ2h0dHBzOi8vd3d3Lmdvb2dsZS5jb20vc2VhcmNoP3E9JywKICAgICdodHRwczovL3d3dy5nb29nbGUuY29tLnNhLycsCiAgICAnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS5zYS9zZWFyY2g/cT0nLAogICAgJycsICAjIERpcmVjdCB2aXNpdCAobm8gcmVmZXJyZXIpCiAgICAnJywgICMgRGlyZWN0IHZpc2l0CiAgICAnaHR0cHM6Ly90LmNvLycsCiAgICAnaHR0cHM6Ly93d3cuZmFjZWJvb2suY29tLycsCiAgICAnaHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS8nLApdCgojIEFjY2VwdC1MYW5ndWFnZSBoZWFkZXJzIChTYXVkaS9BcmFiaWMgZm9jdXNlZCkKQUNDRVBUX0xBTkdTID0gWwogICAgJ2FyLVNBLGFyO3E9MC45LGVuLVVTO3E9MC44LGVuO3E9MC43JywKICAgICdhcixlbi1VUztxPTAuOSxlbjtxPTAuOCcsCiAgICAnYXItU0EsYXI7cT0wLjksZW47cT0wLjgnLAogICAgJ2VuLVVTLGVuO3E9MC45LGFyO3E9MC44JywKICAgICdhci1TQSxlbi1VUztxPTAuOCxlbjtxPTAuNycsCl0KCmRlZiB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCBzdGF0dXM9InJ1bm5pbmciKToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIGVsYXBzZWQgPSBpbnQodGltZS50aW1lKCkgLSBzdGFydF90aW1lKQogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgcmVtYWluaW5nID0gbWF4KDAsIHRvdGFsX3NlY29uZHMgLSBlbGFwc2VkKQogICAgcHJvZ3Jlc3MgPSBtaW4oMTAwLCByb3VuZCgodmlzaXRfY291bnQgLyBtYXhfdmlzaXRvcnMpICogMTAwLCAxKSkgaWYgbWF4X3Zpc2l0b3JzID4gMCBlbHNlIDAKICAgIGRhdGEgPSB7CiAgICAgICAgInN0YXR1cyI6IHN0YXR1cywKICAgICAgICAidmlzaXRzIjogdmlzaXRfY291bnQsCiAgICAgICAgInRhcmdldCI6IG1heF92aXNpdG9ycywKICAgICAgICAicHJvZ3Jlc3MiOiBwcm9ncmVzcywKICAgICAgICAiZWxhcHNlZCI6IGVsYXBzZWQsCiAgICAgICAgInJlbWFpbmluZyI6IHJlbWFpbmluZywKICAgICAgICAiZXJyb3JzIjogZXJyb3JfY291bnQsCiAgICAgICAgInRpbWVzdGFtcCI6IGludCh0aW1lLnRpbWUoKSkKICAgIH0KICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4oU1RBVFVTX0ZJTEUsICJ3IikgYXMgZjoKICAgICAgICAgICAganNvbi5kdW1wKGRhdGEsIGYpCiAgICBleGNlcHQ6CiAgICAgICAgcGFzcwoKZGVmIGNyZWF0ZV9icm93c2VyKHByb3h5PU5vbmUpOgogICAgY28gPSBDaHJvbWl1bU9wdGlvbnMoKQogICAgY28uaGVhZGxlc3MoKSAgIyBVc2UgRHJpc3Npb25QYWdlJ3MgaGVhZGxlc3MgbWV0aG9kIChOT1QgLS1oZWFkbGVzcz1uZXcpCiAgICBjby5hdXRvX3BvcnQoKSAgIyBBdXRvIGFzc2lnbiBwb3J0IHRvIGF2b2lkIGNvbmZsaWN0cwogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLXNhbmRib3gnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZ3B1JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWRldi1zaG0tdXNhZ2UnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZXh0ZW5zaW9ucycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1sb2dnaW5nJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWRlZmF1bHQtYXBwcycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbm8tZmlyc3QtcnVuJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWJhY2tncm91bmQtbmV0d29ya2luZycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1zeW5jJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLXRyYW5zbGF0ZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbXV0ZS1hdWRpbycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1mZWF0dXJlcz1UcmFuc2xhdGVVSScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1pcGMtZmxvb2RpbmctcHJvdGVjdGlvbicpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1yZW5kZXJlci1iYWNrZ3JvdW5kaW5nJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWJhY2tncm91bmRpbmctb2NjbHVkZWQtd2luZG93cycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1oYW5nLW1vbml0b3InKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtcHJvbXB0LW9uLXJlcG9zdCcpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1kb21haW4tcmVsaWFiaWxpdHknKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtY29tcG9uZW50LXVwZGF0ZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbWV0cmljcy1yZWNvcmRpbmctb25seScpCiAgICAjIERpc2FibGUgaW1hZ2VzIHRvIHNhdmUgUkFNIGFuZCBzcGVlZCB1cAogICAgY28uc2V0X2FyZ3VtZW50KCctLWJsaW5rLXNldHRpbmdzPWltYWdlc0VuYWJsZWQ9ZmFsc2UnKQogICAgIyBNZW1vcnkgb3B0aW1pemF0aW9uCiAgICBjby5zZXRfYXJndW1lbnQoJy0tanMtZmxhZ3M9LS1tYXgtb2xkLXNwYWNlLXNpemU9MTI4JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLXNvZnR3YXJlLXJhc3Rlcml6ZXInKQogICAgCiAgICAjIFJhbmRvbSBzY3JlZW4gc2l6ZQogICAgc2NyZWVuID0gcmFuZG9tLmNob2ljZShTQ1JFRU5fU0laRVMpCiAgICBjby5zZXRfYXJndW1lbnQoZictLXdpbmRvdy1zaXplPXtzY3JlZW5bMF19LHtzY3JlZW5bMV19JykKICAgIAogICAgIyBQcm94eQogICAgaWYgcHJveHk6CiAgICAgICAgY28uc2V0X2FyZ3VtZW50KGYnLS1wcm94eS1zZXJ2ZXI9e3Byb3h5WyJob3N0Il19Ontwcm94eVsicG9ydCJdfScpCiAgICAKICAgICMgUmFuZG9tIFVzZXItQWdlbnQKICAgIHVhID0gcmFuZG9tLmNob2ljZShVU0VSX0FHRU5UUykKICAgIGNvLnNldF91c2VyX2FnZW50KHVhKQogICAgCiAgICAjIEFjY2VwdCBsYW5ndWFnZQogICAgbGFuZyA9IHJhbmRvbS5jaG9pY2UoQUNDRVBUX0xBTkdTKQogICAgY28uc2V0X2FyZ3VtZW50KGYnLS1sYW5nPXtsYW5nLnNwbGl0KCIsIilbMF19JykKICAgIAogICAgdHJ5OgogICAgICAgIHBhZ2UgPSBDaHJvbWl1bVBhZ2UoYWRkcl9vcl9vcHRzPWNvKQogICAgICAgIHJldHVybiBwYWdlCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgcmV0dXJuIE5vbmUKCmRlZiB3b3JrZXIod29ya2VyX2lkLCB0YXJnZXRfdXJsLCBtYXhfdmlzaXRzLCBlbmRfdGltZSwgc3RhcnRfdGltZSwgZHVyYXRpb25fbWludXRlcywgcHJveGllcyk6CiAgICBnbG9iYWwgdmlzaXRfY291bnQsIGVycm9yX2NvdW50CiAgICAKICAgIHZpc2l0c190aGlzX2Jyb3dzZXIgPSAwCiAgICBtYXhfdmlzaXRzX3Blcl9icm93c2VyID0gcmFuZG9tLnJhbmRpbnQoMjUsIDQwKSAgIyBSZXN0YXJ0IENocm9tZSBldmVyeSAyNS00MCB2aXNpdHMKICAgIHBhZ2UgPSBOb25lCiAgICAKICAgIHdoaWxlIHRpbWUudGltZSgpIDwgZW5kX3RpbWU6CiAgICAgICAgIyBDaGVjayBpZiB3ZSByZWFjaGVkIHRhcmdldAogICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgaWYgdmlzaXRfY291bnQgPj0gbWF4X3Zpc2l0czoKICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgCiAgICAgICAgIyBDcmVhdGUgb3IgcmVzdGFydCBicm93c2VyCiAgICAgICAgaWYgcGFnZSBpcyBOb25lIG9yIHZpc2l0c190aGlzX2Jyb3dzZXIgPj0gbWF4X3Zpc2l0c19wZXJfYnJvd3NlcjoKICAgICAgICAgICAgaWYgcGFnZToKICAgICAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgICAgICBwYWdlLnF1aXQoKQogICAgICAgICAgICAgICAgZXhjZXB0OgogICAgICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAgcHJveHkgPSByYW5kb20uY2hvaWNlKHByb3hpZXMpIGlmIHByb3hpZXMgZWxzZSBOb25lCiAgICAgICAgICAgIHBhZ2UgPSBjcmVhdGVfYnJvd3Nlcihwcm94eSkKICAgICAgICAgICAgaWYgcGFnZSBpcyBOb25lOgogICAgICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMikKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIHZpc2l0c190aGlzX2Jyb3dzZXIgPSAwCiAgICAgICAgICAgIG1heF92aXNpdHNfcGVyX2Jyb3dzZXIgPSByYW5kb20ucmFuZGludCgyNSwgNDApCiAgICAgICAgCiAgICAgICAgdHJ5OgogICAgICAgICAgICAjIFZpc2l0IHRoZSBwYWdlCiAgICAgICAgICAgIHBhZ2UuZ2V0KHRhcmdldF91cmwpCiAgICAgICAgICAgIAogICAgICAgICAgICAjIFNtYWxsIHJhbmRvbSBkZWxheSBsaWtlIGEgcmVhbCBodW1hbiAoMC41IC0gMiBzZWNvbmRzKQogICAgICAgICAgICB0aW1lLnNsZWVwKHJhbmRvbS51bmlmb3JtKDAuNSwgMi4wKSkKICAgICAgICAgICAgCiAgICAgICAgICAgICMgQ291bnQgQUZURVIgc3VjY2Vzc2Z1bCB2aXNpdAogICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA8IG1heF92aXNpdHM6CiAgICAgICAgICAgICAgICAgICAgdmlzaXRfY291bnQgKz0gMQogICAgICAgICAgICAgICAgICAgIGN1cnJlbnQgPSB2aXNpdF9jb3VudAogICAgICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICAKICAgICAgICAgICAgdmlzaXRzX3RoaXNfYnJvd3NlciArPSAxCiAgICAgICAgICAgIAogICAgICAgICAgICAjIFVwZGF0ZSBzdGF0dXMgZXZlcnkgMTAgdmlzaXRzCiAgICAgICAgICAgIGlmIGN1cnJlbnQgJSAxMCA9PSAwOgogICAgICAgICAgICAgICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdHMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsICJydW5uaW5nIikKICAgICAgICAgICAgICAgIAogICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgZXJyb3JfY291bnQgKz0gMQogICAgICAgICAgICAjIElmIENocm9tZSBjcmFzaGVkLCByZXNldCBpdAogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICBwYWdlLnF1aXQoKQogICAgICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgICAgICBwYXNzCiAgICAgICAgICAgIHBhZ2UgPSBOb25lCiAgICAgICAgICAgIHRpbWUuc2xlZXAoMSkKICAgIAogICAgIyBDbGVhbnVwCiAgICBpZiBwYWdlOgogICAgICAgIHRyeToKICAgICAgICAgICAgcGFnZS5xdWl0KCkKICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgIHBhc3MKCmRlZiBydW5fYXR0YWNrKHRhcmdldF91cmwsIG1heF92aXNpdG9ycz0xMDAsIGR1cmF0aW9uX21pbnV0ZXM9NSwgcHJveGllcz1Ob25lKToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIHZpc2l0X2NvdW50ID0gMAogICAgZXJyb3JfY291bnQgPSAwCgogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgIyAyNSB0aHJlYWRzIC0gc2FmZSBmb3IgOEdCIFJBTSAoaW1hZ2VzIGRpc2FibGVkID0gfjIwME1CIHBlciBDaHJvbWUpCiAgICBudW1fdGhyZWFkcyA9IG1pbigyNSwgbWF4KDUsIG1heF92aXNpdG9ycyAvLyAxMCkpCgogICAgc3RhcnRfdGltZSA9IHRpbWUudGltZSgpCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAic3RhcnRpbmciKQoKICAgIHByb3h5X2luZm8gPSBmIiB8IFByb3hpZXM6IHtsZW4ocHJveGllcyl9IiBpZiBwcm94aWVzIGVsc2UgIiB8IE5vIHByb3h5IgogICAgcHJpbnQoZiJTdGFydGluZzoge21heF92aXNpdG9yc30gdmlzaXRvcnMgaW4ge2R1cmF0aW9uX21pbnV0ZXN9IG1pbiB8IHtudW1fdGhyZWFkc30gdGhyZWFkc3twcm94eV9pbmZvfSIpCgogICAgZW5kX3RpbWUgPSB0aW1lLnRpbWUoKSArIHRvdGFsX3NlY29uZHMKICAgIHRocmVhZHMgPSBbXQogICAgZm9yIGkgaW4gcmFuZ2UobnVtX3RocmVhZHMpOgogICAgICAgIHQgPSB0aHJlYWRpbmcuVGhyZWFkKHRhcmdldD13b3JrZXIsIGFyZ3M9KGksIHRhcmdldF91cmwsIG1heF92aXNpdG9ycywgZW5kX3RpbWUsIHN0YXJ0X3RpbWUsIGR1cmF0aW9uX21pbnV0ZXMsIHByb3hpZXMgb3IgW10pKQogICAgICAgIHQuZGFlbW9uID0gVHJ1ZQogICAgICAgIHQuc3RhcnQoKQogICAgICAgIHRocmVhZHMuYXBwZW5kKHQpCiAgICAgICAgIyBTdGFnZ2VyIHRocmVhZCBzdGFydHMgdG8gYXZvaWQgUkFNIHNwaWtlCiAgICAgICAgdGltZS5zbGVlcCgwLjUpCgogICAgd2hpbGUgYW55KHQuaXNfYWxpdmUoKSBmb3IgdCBpbiB0aHJlYWRzKToKICAgICAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgdGltZS5zbGVlcCgyKQoKICAgIGZvciB0IGluIHRocmVhZHM6CiAgICAgICAgdC5qb2luKHRpbWVvdXQ9NSkKCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAiZmluaXNoZWQiKQogICAgcHJpbnQoZiJGaW5pc2hlZCEgVG90YWw6IHt2aXNpdF9jb3VudH0gdmlzaXRzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW51dGVzIHwgRXJyb3JzOiB7ZXJyb3JfY291bnR9IikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIGR1cmF0aW9uID0gaW50KHN5cy5hcmd2WzNdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMyBlbHNlIDUKICAgIHByb3h5X2ZpbGUgPSBzeXMuYXJndls0XSBpZiBsZW4oc3lzLmFyZ3YpID4gNCBlbHNlIE5vbmUKCiAgICBwcm94aWVzID0gW10KICAgIGlmIHByb3h5X2ZpbGU6CiAgICAgICAgdHJ5OgogICAgICAgICAgICB3aXRoIG9wZW4ocHJveHlfZmlsZSwgJ3InKSBhcyBmOgogICAgICAgICAgICAgICAgcHJveGllcyA9IGpzb24ubG9hZChmKQogICAgICAgICAgICBwcmludChmIkxvYWRlZCB7bGVuKHByb3hpZXMpfSBwcm94aWVzIikKICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgIHByaW50KCJGYWlsZWQgdG8gbG9hZCBwcm94aWVzLCBydW5uaW5nIHdpdGhvdXQgcHJveHkiKQoKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgZHVyYXRpb24sIHByb3hpZXMgaWYgcHJveGllcyBlbHNlIE5vbmUpCg==";

const SETUP_COMMAND = 'apt update -y && apt install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 fonts-liberation libappindicator3-1 xdg-utils && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt install -y ./google-chrome-stable_current_amd64.deb && rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage && echo "SETUP_COMPLETE"';

async function fireAndForget(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      try { conn.end(); } catch(e) {}
      resolve('Command sent (timeout)');
    }, 15000);

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
      readyTimeout: 15000,
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
        const killCmd = 'kill $(pgrep -f visit.py) 2>/dev/null; kill $(pgrep -f "chrome") 2>/dev/null; rm -f /root/visit_status.json /root/visit.log; sleep 1';
        if (proxies && proxies.length > 0) {
          const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
          return `${killCmd}; echo "${proxyB64}" | base64 -d > /root/proxies.json; nohup bash -c 'python3 /root/visit.py "${url}" ${v} ${d} /root/proxies.json' > /root/visit.log 2>&1 & echo "Started"`;
        }
        return `${killCmd}; nohup bash -c 'python3 /root/visit.py "${url}" ${v} ${d}' > /root/visit.log 2>&1 & echo "Started"`;
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

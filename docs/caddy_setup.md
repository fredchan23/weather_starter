# Caddy Setup Guide (GCE VM)

This guide documents the working reverse-proxy and HTTPS setup for `weather-starter-vm`.

## Current Working State

- VM app listens on `127.0.0.1:3000`.
- Caddy terminates TLS and proxies to the app.
- Active public hostname: `34-60-122-241.sslip.io`.
- External checks passed:
  - `http://34-60-122-241.sslip.io/` redirects to HTTPS (`308`).
  - `https://34-60-122-241.sslip.io/health` returns `200` with `{"status":"healthy"}`.

## Prerequisites

1. VM is running and reachable.
2. Firewall allows `tcp:80` and `tcp:443` on target tags used by the VM.
3. Backend service is healthy on localhost:

```bash
curl http://127.0.0.1:3000/health
```

4. Caddy installed and running:

```bash
sudo systemctl status caddy
```

## Minimal Caddyfile (HTTP only)

Use this for plain HTTP reverse proxy:

```caddy
:80 {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3000
}
```

## Domain + HTTPS Setup (Automatic TLS)

Caddy automatically provisions certificates when the hostname resolves to your VM.

### 1) Confirm hostname resolves to VM IP

```bash
getent hosts 34-60-122-241.sslip.io
```

Expected output includes VM IP `34.60.122.241`.

### 2) Write hostname-based Caddyfile

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
34-60-122-241.sslip.io {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3000
}
EOF
```

### 3) Validate and reload Caddy

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager -n 40
```

### 4) Verify redirect and HTTPS

```bash
curl -I http://34-60-122-241.sslip.io/
curl -i https://34-60-122-241.sslip.io/health
curl -I https://34-60-122-241.sslip.io/
```

Expected:

- HTTP response is `308` redirect to HTTPS.
- HTTPS responses include `Server: Caddy` and `200` status for app routes.

## Custom Domain Setup

If you own a domain, replace the sslip hostname with your domain.

### DNS

Create an `A` record:

- Name: your desired host (for example `weather.example.com`)
- Value: VM external IP (for example `34.60.122.241`)

Wait for DNS propagation, then update `/etc/caddy/Caddyfile`:

```caddy
weather.example.com {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy after validation:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Operational Checks

Run these after deploy/restart:

```bash
sudo systemctl is-active caddy
sudo systemctl is-active weather-starter
curl -fsS http://127.0.0.1:3000/health
curl -fsS https://34-60-122-241.sslip.io/health
```

## Troubleshooting

### 502 from Caddy (`connect: connection refused`)

Cause: upstream app on `127.0.0.1:3000` is not ready.

Check:

```bash
sudo systemctl status weather-starter --no-pager -n 80
sudo journalctl -u weather-starter -n 120 --no-pager
```

### HTTPS not issuing

Cause candidates:

1. Hostname does not resolve to VM IP.
2. Port `80` or `443` blocked.
3. Invalid Caddyfile.

Check:

```bash
getent hosts YOUR_DOMAIN
sudo caddy validate --config /etc/caddy/Caddyfile
sudo journalctl -u caddy -n 200 --no-pager
```

### Caddy reload fails

Validate config first and restore backup if needed:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Notes from Recovery Session

- On constrained VMs, app restart loops can amplify operational instability.
- Keep app service stable before testing Caddy health to avoid misleading proxy errors.
- Keep backup copies of `Caddyfile` before edits.

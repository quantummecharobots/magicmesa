# Magic Mesa

A multiplayer Magic: The Gathering companion app with video chat, life tracking, and card recognition.

## Features

- Real-time video chat with up to 4 players
- Life counter with poison and commander damage tracking
- Card scanning and recognition
- MTG Arena-inspired UI with ornate styling

## Development

### Prerequisites

- Node.js 18+
- npm

### Running Locally

```bash
# Frontend
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:5173

## Deployment

### Cloudflare Tunnel Setup

Magic Mesa uses Cloudflare Tunnel for secure remote access with Zero Trust authentication.

#### Prerequisites

- Cloudflare account with a domain
- cloudflared CLI installed (`winget install --id Cloudflare.cloudflared`)

#### Initial Setup

1. **Authenticate with Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```
   Complete the browser authentication and select your domain.

2. **Create a named tunnel:**
   ```bash
   cloudflared tunnel create magicmesa
   ```

3. **Route DNS to tunnel:**
   ```bash
   cloudflared tunnel route dns magicmesa magicmesa.yourdomain.com
   ```

4. **Create config file** at `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: magicmesa
   credentials-file: C:\Users\<username>\.cloudflared\<tunnel-id>.json

   ingress:
     - hostname: magicmesa.yourdomain.com
       service: http://localhost:5174
     - service: http_status:404
   ```

5. **Run the tunnel:**
   ```bash
   cloudflared tunnel run magicmesa
   ```

#### Access Control (Cloudflare Zero Trust)

To restrict access to authorized users:

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. Navigate to **Access** → **Applications**
3. Click **Add an application** → **Self-hosted**
4. Configure:
   - **Application name:** Magic Mesa
   - **Application domain:** `magicmesa` + select your domain
5. Add a policy:
   - **Policy name:** Allowed Users
   - **Action:** Allow
   - **Include:** Emails → add authorized email addresses
6. Save the application

Users will now need to authenticate via email PIN before accessing the site.

#### Managing the Tunnel

```bash
# Start tunnel
cloudflared tunnel run magicmesa

# List tunnels
cloudflared tunnel list

# Check tunnel status
cloudflared tunnel info magicmesa

# Delete tunnel (if needed)
cloudflared tunnel delete magicmesa
```

#### Current Deployment

- **URL:** https://magicmesa.thefallen8.com
- **Tunnel ID:** ffd85c72-c5d0-43ec-ac2b-27d74c28f930
- **Auth:** Email PIN via Cloudflare Access

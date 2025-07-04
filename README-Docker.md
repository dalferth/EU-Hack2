# EU-Hack Docker Setup

This project is containerized using Docker and Docker Compose. The setup includes:

- **Frontend**: React application served by Nginx
- **Proxy**: Node.js proxy server for API calls
- **Nginx**: Reverse proxy that routes traffic to the appropriate services

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser       │    │   Nginx         │    │   Frontend      │
│   (Port 80)     │───▶│   Reverse Proxy │───▶│   (React App)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Proxy         │
                       │   (Node.js)     │
                       └─────────────────┘
```

## Quick Start

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost
   - API endpoints: http://localhost/api/*

3. **Stop all services:**
   ```bash
   docker-compose down
   ```

## Services

### Frontend (React)
- **Port**: 80 (via Nginx)
- **Build**: Multi-stage Docker build with Node.js and Nginx
- **Features**: 
  - Static file serving
  - Client-side routing support
  - Asset caching
  - Security headers

### Proxy (Node.js)
- **Port**: 4000 (internal)
- **Purpose**: Proxies API calls to external services
- **Endpoints**:
  - `/api/meetings/*` → Europarl meetings API
  - `/api/meps/:id` → Europarl MEPs API

### Nginx (Reverse Proxy)
- **Port**: 80 (external)
- **Purpose**: Routes traffic between frontend and proxy
- **Features**:
  - CORS handling
  - Request forwarding
  - Security headers

## Development

### Running in development mode:
```bash
# Start only the proxy service
docker-compose up proxy

# Run frontend locally
cd eu-hack
npm start
```

### Viewing logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f proxy
docker-compose logs -f nginx
```

### Rebuilding services:
```bash
# Rebuild all services
docker-compose up --build

# Rebuild specific service
docker-compose up --build frontend
```

## Environment Variables

The setup uses default configurations. If you need to customize:

1. Create a `.env` file in the root directory
2. Add environment variables as needed
3. Reference them in `docker-compose.yml`

## Troubleshooting

### Port conflicts:
If port 80 is already in use, change the port mapping in `docker-compose.yml`:
```yaml
nginx:
  ports:
    - "8080:80"  # Change 8080 to your preferred port
```

### Build issues:
```bash
# Clean up Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

### Container access:
```bash
# Access running containers
docker-compose exec frontend sh
docker-compose exec proxy sh
docker-compose exec nginx sh
``` 
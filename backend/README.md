# Headscale Panel Backend

[![Go](https://img.shields.io/badge/Go-1.24-blue.svg)](https://golang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A powerful, self-hosted backend service for managing [Headscale](https://github.com/juanfont/headscale) networks. This project provides a comprehensive control panel API with advanced user management, RBAC, and a built-in OIDC provider, allowing it to serve as the central authentication authority for your Tailscale/Headscale mesh network.

## ✨ Key Features

### 🔐 Identity & Access Management (IAM)
- **Unified User Management**: Seamlessly manage local users and sync them with Headscale.
- **RBAC System**: Granular control with Users, Groups, and Permissions.
- **Two-Factor Authentication**: Built-in TOTP (Google Authenticator) support for enhanced security.

### 🆔 Built-in OIDC Provider
- **Headscale Authentication**: Acts as a fully compliant OpenID Connect (OIDC) provider.
- **Seamless Login**: Users can log in to their Tailscale clients using their panel credentials.
- **OAuth2 Client Management**: Generate and manage Client IDs and Secrets for external applications.

### 🔄 Headscale Integration
- **Real-time Sync**: Automatically synchronizes Users, Machines (Nodes), and ACLs from Headscale via gRPC.
- **Network Visualization**: View and manage connected devices and their status.
- **ACL Management**: Parse and visualize Access Control Lists (HuJSON support).

## 🚀 Getting Started

### Prerequisites
- Go 1.24+
- A running [Headscale](https://github.com/juanfont/headscale) instance (v0.27+)
- Headscale API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/headscale-panel_backend.git
   cd headscale-panel_backend
   ```

2. **Configuration**
   Copy the example configuration file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in your Headscale details:
   ```dotenv
   # System
   SYSTEM_BASE_URL=http://your-panel-domain.com # Important for OIDC

   # Headscale Connection
   HEADSCALE_GRPC_ADDR=localhost:50443
   HEADSCALE_API_KEY=your_generated_api_key
   HEADSCALE_INSECURE=false
   ```

3. **Run the server**
   ```bash
   go run main.go
   ```

## ⚙️ Configuring Headscale OIDC

To use this panel as the authentication server for Headscale, update your `headscale` `config.yaml`:

```yaml
oidc:
  only_start_if_oidc_is_available: false
  issuer: "https://auth.example.com"
  client_id: "headscale-panel-test"
  client_secret: "headscale-panel-test-secret"
  scope: ["openid", "profile", "email"] 
  pkce:
    enabled: false
    method: S256
```

> **Note**: You can generate the `client_id` and `client_secret` via the System > OAuth Clients API after starting the backend.

## 🛠️ Tech Stack
- **Language**: Go
- **Framework**: Gin Web Framework
- **Database**: SQLite (via GORM)
- **Protocol**: gRPC (Headscale API), OIDC/OAuth2

## 📄 License
MIT License

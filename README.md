# MCP-Portainer Bridge

An MCP (Model Context Protocol) server that provides a bridge between Claude Desktop and Portainer for Docker container management.

## Features

- **Container Management**: List, start, stop, restart, pause/unpause containers
- **Container Creation**: Deploy new containers with full configuration
- **Monitoring**: View container logs and detailed information
- **Resource Management**: List images, volumes, and networks
- **Stack Deployment**: Deploy docker-compose stacks
- **Safety Features**: Confirmation required for destructive operations
- **System Info**: Get Docker daemon information

## Installation

1. Clone this repository:
```bash
git clone https://github.com/SamuraiBuddha/mcp-portainer-bridge.git
cd mcp-portainer-bridge
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Portainer details
```

4. Set your Portainer API token:
- Log into Portainer
- Go to User Settings → Access Tokens
- Create a new token
- Add it to your `.env` file

## Configuration

### Environment Variables

- `PORTAINER_URL`: Your Portainer instance URL (default: http://192.168.50.78:9000)
- `PORTAINER_TOKEN`: Your Portainer API token (required)
- `PORTAINER_ENDPOINT_ID`: The endpoint ID to manage (default: 1)

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "portainer-bridge": {
      "command": "node",
      "args": ["C:/path/to/mcp-portainer-bridge/server.js"],
      "env": {
        "PORTAINER_URL": "http://192.168.50.78:9000",
        "PORTAINER_TOKEN": "your_token_here",
        "PORTAINER_ENDPOINT_ID": "1"
      }
    }
  }
}
```

## Available Tools

### Container Operations
- `portainer_list_containers` - List all containers
- `portainer_container_info` - Get detailed container information
- `portainer_container_logs` - View container logs
- `portainer_container_action` - Start/stop/restart containers
- `portainer_create_container` - Create new containers

### Resource Management
- `portainer_list_images` - List Docker images
- `portainer_list_volumes` - List Docker volumes
- `portainer_list_networks` - List Docker networks
- `portainer_system_info` - Get Docker system information

### Stack Management
- `portainer_deploy_stack` - Deploy docker-compose stacks

## Safety Features

The bridge includes safety confirmations for:
- Container stop/restart/kill operations
- Container creation
- Stack deployment
- Any destructive operations

## Usage Examples

### List all containers:
```
Use the portainer_list_containers tool to show all containers on the NAS
```

### View container logs:
```
Use portainer_container_logs with container_id="myapp" and tail=50
```

### Create a container:
```
Use portainer_create_container with:
- name: "test-nginx"
- image: "nginx:latest"
- ports: [{host: 8080, container: 80}]
- confirm: true
```

### Deploy a stack:
```
Use portainer_deploy_stack with:
- name: "my-stack"
- compose_content: "<yaml content>"
- confirm: true
```

## Troubleshooting

1. **Connection refused**: Check that Portainer is accessible at the configured URL
2. **401 Unauthorized**: Verify your API token is correct and hasn't expired
3. **404 Not Found**: Check the endpoint ID matches your Portainer setup

## Security Notes

- Store your API token securely
- Use HTTPS when connecting to Portainer over the network
- Regularly rotate API tokens
- Be cautious with destructive operations

## License

MIT

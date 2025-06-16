#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PORTAINER_URL = process.env.PORTAINER_URL || 'http://192.168.50.78:9000';
const PORTAINER_TOKEN = process.env.PORTAINER_TOKEN;
const PORTAINER_ENDPOINT_ID = process.env.PORTAINER_ENDPOINT_ID || 1;

// Axios instance with auth
const api = axios.create({
  baseURL: PORTAINER_URL,
  headers: {
    'X-API-Key': PORTAINER_TOKEN
  }
});

// Helper function for safety confirmations
function requiresConfirmation(action) {
  const dangerous = ['remove', 'delete', 'stop', 'restart', 'kill', 'prune'];
  return dangerous.some(word => action.toLowerCase().includes(word));
}

class PortainerMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-portainer-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'portainer_list_containers',
          description: 'List all containers on the NAS',
          inputSchema: {
            type: 'object',
            properties: {
              all: {
                type: 'boolean',
                description: 'Show all containers (including stopped)',
                default: true
              }
            }
          }
        },
        {
          name: 'portainer_container_info',
          description: 'Get detailed info about a specific container',
          inputSchema: {
            type: 'object',
            properties: {
              container_id: {
                type: 'string',
                description: 'Container ID or name'
              }
            },
            required: ['container_id']
          }
        },
        {
          name: 'portainer_container_logs',
          description: 'Get logs from a container',
          inputSchema: {
            type: 'object',
            properties: {
              container_id: {
                type: 'string',
                description: 'Container ID or name'
              },
              tail: {
                type: 'number',
                description: 'Number of lines to show from the end',
                default: 100
              }
            },
            required: ['container_id']
          }
        },
        {
          name: 'portainer_container_action',
          description: 'Perform action on container (start/stop/restart/pause/unpause)',
          inputSchema: {
            type: 'object',
            properties: {
              container_id: {
                type: 'string',
                description: 'Container ID or name'
              },
              action: {
                type: 'string',
                enum: ['start', 'stop', 'restart', 'pause', 'unpause'],
                description: 'Action to perform'
              },
              confirm: {
                type: 'boolean',
                description: 'Confirmation for destructive actions',
                default: false
              }
            },
            required: ['container_id', 'action']
          }
        },
        {
          name: 'portainer_create_container',
          description: 'Create a new container from an image',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Container name'
              },
              image: {
                type: 'string',
                description: 'Docker image to use'
              },
              env: {
                type: 'array',
                items: { type: 'string' },
                description: 'Environment variables (KEY=VALUE format)'
              },
              ports: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    host: { type: 'number' },
                    container: { type: 'number' }
                  }
                },
                description: 'Port mappings'
              },
              volumes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    host: { type: 'string' },
                    container: { type: 'string' }
                  }
                },
                description: 'Volume mappings'
              },
              restart_policy: {
                type: 'string',
                enum: ['no', 'always', 'unless-stopped', 'on-failure'],
                default: 'unless-stopped'
              },
              confirm: {
                type: 'boolean',
                description: 'Confirmation to create container',
                default: false
              }
            },
            required: ['name', 'image', 'confirm']
          }
        },
        {
          name: 'portainer_list_images',
          description: 'List all Docker images on the NAS',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'portainer_list_volumes',
          description: 'List all Docker volumes on the NAS',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'portainer_list_networks',
          description: 'List all Docker networks on the NAS',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'portainer_system_info',
          description: 'Get Docker system information',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'portainer_deploy_stack',
          description: 'Deploy a docker-compose stack',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Stack name'
              },
              compose_content: {
                type: 'string',
                description: 'Docker compose file content (YAML)'
              },
              env: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' }
                  }
                },
                description: 'Environment variables for the stack'
              },
              confirm: {
                type: 'boolean',
                description: 'Confirmation to deploy stack',
                default: false
              }
            },
            required: ['name', 'compose_content', 'confirm']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!PORTAINER_TOKEN) {
        throw new McpError(
          ErrorCode.InternalError,
          'PORTAINER_TOKEN not configured'
        );
      }

      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'portainer_list_containers':
            return await this.listContainers(args.all);

          case 'portainer_container_info':
            return await this.getContainerInfo(args.container_id);

          case 'portainer_container_logs':
            return await this.getContainerLogs(args.container_id, args.tail);

          case 'portainer_container_action':
            if (requiresConfirmation(args.action) && !args.confirm) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `⚠️ This action (${args.action}) requires confirmation. Please set confirm=true to proceed.`
                  }
                ]
              };
            }
            return await this.containerAction(args.container_id, args.action);

          case 'portainer_create_container':
            if (!args.confirm) {
              return {
                content: [
                  {
                    type: 'text',
                    text: '⚠️ Creating a container requires confirmation. Please set confirm=true to proceed.'
                  }
                ]
              };
            }
            return await this.createContainer(args);

          case 'portainer_list_images':
            return await this.listImages();

          case 'portainer_list_volumes':
            return await this.listVolumes();

          case 'portainer_list_networks':
            return await this.listNetworks();

          case 'portainer_system_info':
            return await this.getSystemInfo();

          case 'portainer_deploy_stack':
            if (!args.confirm) {
              return {
                content: [
                  {
                    type: 'text',
                    text: '⚠️ Deploying a stack requires confirmation. Please set confirm=true to proceed.'
                  }
                ]
              };
            }
            return await this.deployStack(args);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error.response) {
          throw new McpError(
            ErrorCode.InternalError,
            `Portainer API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
        }
        throw error;
      }
    });
  }

  async listContainers(all = true) {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/json`, {
      params: { all }
    });

    const containers = response.data.map(c => ({
      id: c.Id.substring(0, 12),
      name: c.Names[0].replace('/', ''),
      image: c.Image,
      status: c.Status,
      state: c.State,
      ports: c.Ports.map(p => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : `${p.PrivatePort}`).join(', ')
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${containers.length} containers:\n\n${containers.map(c => 
            `📦 ${c.name} (${c.id})\n   Image: ${c.image}\n   Status: ${c.status}\n   Ports: ${c.ports || 'none'}\n`
          ).join('\n')}`
        }
      ]
    };
  }

  async getContainerInfo(containerId) {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/json`);
    const c = response.data;

    return {
      content: [
        {
          type: 'text',
          text: `Container: ${c.Name.replace('/', '')} (${c.Id.substring(0, 12)})\n` +
                `State: ${c.State.Status}\n` +
                `Started: ${c.State.StartedAt}\n` +
                `Image: ${c.Config.Image}\n` +
                `Restart Policy: ${c.HostConfig.RestartPolicy.Name}\n` +
                `Environment:\n${c.Config.Env.map(e => `  - ${e}`).join('\n')}\n` +
                `Mounts:\n${c.Mounts.map(m => `  - ${m.Source} -> ${m.Destination}`).join('\n') || '  none'}\n` +
                `Networks: ${Object.keys(c.NetworkSettings.Networks).join(', ')}`
        }
      ]
    };
  }

  async getContainerLogs(containerId, tail = 100) {
    const response = await api.get(
      `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/logs`,
      {
        params: {
          stdout: true,
          stderr: true,
          tail: tail
        },
        responseType: 'text'
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: `Logs for container ${containerId} (last ${tail} lines):\n\n${response.data}`
        }
      ]
    };
  }

  async containerAction(containerId, action) {
    await api.post(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/${action}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `✅ Successfully performed '${action}' on container ${containerId}`
        }
      ]
    };
  }

  async createContainer(args) {
    const config = {
      Image: args.image,
      name: args.name,
      Env: args.env || [],
      HostConfig: {
        RestartPolicy: {
          Name: args.restart_policy || 'unless-stopped'
        },
        PortBindings: {},
        Binds: []
      },
      ExposedPorts: {}
    };

    // Configure ports
    if (args.ports) {
      args.ports.forEach(p => {
        config.ExposedPorts[`${p.container}/tcp`] = {};
        config.HostConfig.PortBindings[`${p.container}/tcp`] = [
          { HostPort: p.host.toString() }
        ];
      });
    }

    // Configure volumes
    if (args.volumes) {
      config.HostConfig.Binds = args.volumes.map(v => `${v.host}:${v.container}`);
    }

    const createResponse = await api.post(
      `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/create`,
      config,
      { params: { name: args.name } }
    );

    await api.post(
      `/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/containers/${createResponse.data.Id}/start`
    );

    return {
      content: [
        {
          type: 'text',
          text: `✅ Container '${args.name}' created and started successfully!\nID: ${createResponse.data.Id.substring(0, 12)}`
        }
      ]
    };
  }

  async listImages() {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/images/json`);
    
    const images = response.data.map(img => ({
      id: img.Id.substring(7, 19),
      tags: img.RepoTags || ['<none>'],
      size: (img.Size / 1024 / 1024).toFixed(2) + ' MB',
      created: new Date(img.Created * 1000).toLocaleDateString()
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${images.length} images:\n\n${images.map(img => 
            `🖼️  ${img.tags.join(', ')}\n   ID: ${img.id}\n   Size: ${img.size}\n   Created: ${img.created}\n`
          ).join('\n')}`
        }
      ]
    };
  }

  async listVolumes() {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/volumes`);
    const volumes = response.data.Volumes || [];

    return {
      content: [
        {
          type: 'text',
          text: `Found ${volumes.length} volumes:\n\n${volumes.map(v => 
            `💾 ${v.Name}\n   Driver: ${v.Driver}\n   Mountpoint: ${v.Mountpoint}\n`
          ).join('\n')}`
        }
      ]
    };
  }

  async listNetworks() {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/networks`);
    
    const networks = response.data.map(n => ({
      id: n.Id.substring(0, 12),
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${networks.length} networks:\n\n${networks.map(n => 
            `🌐 ${n.name} (${n.id})\n   Driver: ${n.driver}\n   Scope: ${n.scope}\n`
          ).join('\n')}`
        }
      ]
    };
  }

  async getSystemInfo() {
    const response = await api.get(`/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/info`);
    const info = response.data;

    return {
      content: [
        {
          type: 'text',
          text: `Docker System Information:\n\n` +
                `🖥️  Server Version: ${info.ServerVersion}\n` +
                `🐧 OS: ${info.OperatingSystem}\n` +
                `🏗️  Architecture: ${info.Architecture}\n` +
                `💾 Total Memory: ${(info.MemTotal / 1024 / 1024 / 1024).toFixed(2)} GB\n` +
                `🧮 CPUs: ${info.NCPU}\n` +
                `📦 Containers: ${info.Containers} (Running: ${info.ContainersRunning})\n` +
                `🖼️  Images: ${info.Images}\n` +
                `💿 Storage Driver: ${info.Driver}\n` +
                `📂 Docker Root: ${info.DockerRootDir}`
        }
      ]
    };
  }

  async deployStack(args) {
    // For compose deployment, we'll use Portainer's stack API
    const stackData = {
      Name: args.name,
      StackFileContent: args.compose_content,
      Env: args.env || []
    };

    const response = await api.post(
      `/api/stacks?endpointId=${PORTAINER_ENDPOINT_ID}&method=string&type=2`,
      stackData
    );

    return {
      content: [
        {
          type: 'text',
          text: `✅ Stack '${args.name}' deployed successfully!\nStack ID: ${response.data.Id}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Portainer Bridge running on stdio');
  }
}

const server = new PortainerMCPServer();
server.run().catch(console.error);

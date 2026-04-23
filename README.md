[English](./README.md) / [中文](./README.zh-CN.md)

# LinkRPC

A TypeScript-based RPC framework that supports multiple connection types, including HTTP, Socket, and SocketIO.

## Repository

[Github](https://github.com/MingZeY/LinkRPC)

## Features

- 🛡️ **Type-safe RPC calls** - Utilize TypeScript's type system for end-to-end type safety
- 🔌 **Multiple connection types** - Support HTTP, Socket, and SocketIO connections, or custom `LinkRPCProvider`
- 🔄 **Middleware support** - Extensible middleware system for request/response processing
- 📝 **Context awareness** - Built-in context system for passing data between handlers
- 🔁 **Bidirectional communication** - Support for bidirectional RPC calls between client and server, capability depends on connection type
- 📦 **Easy to use** - Simple API for defining services and methods
- 🚀 **Zero dependencies** - No external library dependencies, only depends on TypeScript standard library
- 🌐 **Frontend and backend compatible** - Can be used in Node.js backend and browser frontend
- 📈 **High extensibility** - Can be easily integrated into frameworks like Electron, Express, etc. as RPC call solutions

## Installation

```bash
npm install linkrpc
```

## Basic Usage

### Server Setup

```typescript
import { LinkRPCServer, LinkRPCAPIDefine } from 'linkrpc';

// Define API interface
const ServerAPIDefine = new LinkRPCAPIDefine<{
    // Service layer - define services here or use interface inheritance
    math:{
        // Method layer - define methods here
        add(a:number,b:number):number,
    },
}>({
    timeout:10 * 1000
});

// Create server instance
const server = new LinkRPCServer({
    // Let TypeScript infer types from ServerAPIDefine
    local:ServerAPIDefine,
    // Connection layer - use Provider or custom Provider here
    // connection:new LinkRPCBuildin.provider.default(),
    // connection:new LinkRPCBuildin.provider.http(),
    // connection:new LinkRPCBuildin.provider.socket(),
    // connection:new LinkRPCBuildin.provider.socketio(),
});

// Hook service method
server.hook('math','add',{
    handler: (a,b) => a+b,
});

// Start listening
server.listen({
    port:3698,
})
```

### Client Setup

```typescript
import { LinkRPCClient, LinkRPCAPIDefine } from 'linkrpc';
// Reuse or import the same API definition
const ServerAPIDefine = new LinkRPCAPIDefine<{
  math:{
      add(a:number,b:number):number,
  },
}>();

// Create client instance
const client = new LinkRPCClient({
    // Let TypeScript infer types from ServerAPIDefine
    remote:ServerAPIDefine,
});

// Connect to server
const connection = await client.connect({
    port:3698,
});

// Get API instance
const api = client.getAPI(connection);

// Make RPC call
const result = await api.math.add.call(1,2); // Returns 3
```

## Connection Types

LinkRPC supports multiple connection types:

1. **HTTP** - HTTP connection
2. **Socket** - Raw socket connection
3. **SocketIO** - Socket.IO connection
4. **Custom** - User-defined connection provider, see abstract class `LinkRPCProvider`

```typescript
new LinkRPCServer({
    local:ServerAPIDefine,
    connection:{
        // optional, default is default provider
        // Connection layer - use Provider or custom Provider here
        // connection:new LinkRPCBuildin.provider.default(),
        // connection:new LinkRPCBuildin.provider.http(),
        // connection:new LinkRPCBuildin.provider.socket(),
        // connection:new LinkRPCBuildin.provider.socketio(),
    }
})
```

## API Documentation

### Server API

- `new LinkRPCServer(config)` - Create a new server instance
- `server.hook(serviceName, methodName, config)` - Hook a single method
- `server.hookService(serviceName, instance)` - Hook an entire service
- `server.use(middleware)` - Add middleware
- `server.listen()` - Start listening for connections
- `server.close()` - Close the server

### Client API

- `new LinkRPCClient(config)` - Create a new client instance
- `client.connect()` - Connect to server
- `client.getAPI(connection)` - Get API instance for connection
- `client.use(middleware)` - Add middleware

## Middleware Usage

LinkRPC supports middleware on both server and client:

```typescript
class MyMiddleware extends LinkRPCMiddleware{

    async inbound(context:RPCContext,next:(context:RPCContext) => Promise<RPCContext>):Promise<RPCContext>{
        // Do something when inbound packet before other middlewares processed
        await next(context);
        // Do something when inbound packet after other middlewares processed
        return context;
    }

    async outbound(context:RPCContext,next:(context:RPCContext) => Promise<RPCContext>):Promise<RPCContext>{
        // Do something when outbound packet before other middlewares processed
        await next(context);
        // Do something when outbound packet after other middlewares processed
        return context;
    }

}
```

## Context Usage

LinkRPC provides a built-in context system that allows you to access request context in service methods. This is particularly useful for accessing connection information, authentication data, or other request-specific data.

### Example: Using Context in Services

```typescript
// Server-side code
import { LinkRPCServer, LinkRPCAPIDefine, LinkRPCContextSymbol, type LinkRPCContext, type LinkRPCContextAware } from 'linkrpc';

// Define service interface
interface MathServiceInterface {
    add(a: number, b: number):number;
}

// Create API definition
const serverAPIDefine = new LinkRPCAPIDefine<{
    math: MathServiceInterface,
}>();

// Create server instance
const server = new LinkRPCServer({
    local: serverAPIDefine,
});

// Implement service with context awareness
class MathService implements MathServiceInterface, LinkRPCContextAware {
    // Inject context using LinkRPCContextSymbol
    [LinkRPCContextSymbol]: LinkRPCContext | null = null;

    /**
     * For safety, must use @LinkRPCAPIDefine.method() to mark method as RPC method in service usage
     * You need set experimentalDecorators:true in tsconfig.json
     */
    @LinkRPCAPIDefine.method()
    add(a: number, b: number): number {
        // Access context
        const context = this[LinkRPCContextSymbol];
        if (!context) {
            throw new Error('Context is not available');
        }
        
        // Use context information (e.g., connection details, authentication)
        console.log('Request received from:', context.connection);
        
        return a + b;
    }
}

// Hook service to server, only methods marked with @LinkRPCAPIDefine.method() will be hooked
server.hookService('math', new MathService());

// Start server
server.listen({
    port: 3698,
});
```

```typescript
// Client-side code
import { LinkRPCClient, LinkRPCAPIDefine } from 'linkrpc';

// Reuse API definition
const serverAPIDefine = new LinkRPCAPIDefine<{
    math: MathServiceInterface,
}>();

// Create client
const client = new LinkRPCClient({
    remote: serverAPIDefine,
});

// Connect and make RPC call
const connection = await client.connect({
    port: 3698,
});
const api = client.getAPI(connection);
const result = await api.math.add.call(1, 2); // Returns 3
```

## More Usage

See `./example/*.ts` for more usage.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](https://github.com/MingZeY/LinkRPC/blob/master/LICENSE) file for details.

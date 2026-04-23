[English](./README.md) / [中文](./README.zh-CN.md)
# TypedRPC

TypeScript-based RPC framework with support for multiple connection types including HTTP, Socket, and SocketIO.

## Repository

[Github](https://github.com/MingZeY/TypedRPC)

## Features

- 🛡️ **Type-Safe RPC calls** - Leverage TypeScript's type system for end-to-end type safety
- 🔌 **Multiple connection types** - Support for HTTP, Socket, and SocketIO connections, or custom connection providers
- 🔄 **Middleware support** - Extensible middleware system for request/response handling
- 📝 **Context-aware** - Built-in context system for passing data between handlers
- 🔁 **Bidirectional communication** - Support for two-way RPC calls between client and server, capability depends on connection type
- 📦 **Easy to use** - Simple API for defining services and methods
- 🚀 **Zero dependencies** - No external library dependencies, only depends on TypeScript standard library
- 🌐 **Frontend and backend compatible** - Can be used in Node.js backend and browser frontend
- 📈 **High extensibility** - Can be easily integrated into frameworks like Electron, Express as an RPC solution

## Installation

```bash
npm install @mingzey/typedrpc
```

## Basic Usage

### Server Setup

```typescript
import { TypedRPCServer, TypedRPCAPIDefine } from '@mingzey/typedrpc';

// Define your API interface
const ServerAPIDefine = new TypedRPCAPIDefine<{
    // Service layer - Define your services here or use interface inheritance
    math:{
        // Method layer - Define your methods here
        add(a:number,b:number):number,
    },
}>({
    timeout:10 * 1000
});

// Create server instance
const server = new TypedRPCServer({
    // let typescript infer the type from ServerAPIDefine
    local:ServerAPIDefine,
    // Connection layer - use your connection provider here
    // connection:{
    //     provider:new TypedRPCConnectionProviderHTTP(),
    // }
});

// Hook service methods
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
import { TypedRPCClient, TypedRPCAPIDefine } from '@mingzey/typedrpc';
// Reuse or import the same API definition
const ServerAPIDefine = new TypedRPCAPIDefine<{
  math:{
      add(a:number,b:number):number,
  },
}>();

// Create client instance
const client = new TypedRPCClient({
    // let typescript infer the type from ServerAPIDefine
    remote:ServerAPIDefine,
});

// Connect to server
const connection = await client.connect("localhost:3698");

// Get API instance
const api = client.getAPI(connection);

// Make RPC calls
const result = await api.math.add.call(1,2); // Returns 3
```

## Connection Types

TypedRPC supports multiple connection types:

1. **HTTP** - RESTful HTTP API
2. **Socket** - Raw socket connections
3. **SocketIO** - Socket.IO connections
4. **Custom** - User-defined connection providers, see abstract class `TypedRPCConnectionProvider`

```typescript
new TypedRPCServer({
    local:ServerAPIDefine,
    connection:{
        provider:new TypedRPCConnectionProviderHTTP(),
        // or use socket connection
        // provider:new TypedRPCConnectionProviderSocket(),
        // or use socketio connection
        // provider:new TypedRPCConnectionProviderSocketIO(),
        // or implaement your own connection provider
    }
})
```

## API Documentation

### Server API

- `new TypedRPCServer(config)` - Create a new server instance
- `server.hook(serviceName, methodName, config)` - Hook a single method
- `server.hookService(serviceName, instance)` - Hook an entire service
- `server.use(middleware)` - Add middleware
- `server.listen()` - Start listening for connections
- `server.close()` - Close the server

### Client API

- `new TypedRPCClient(config)` - Create a new client instance
- `client.connect()` - Connect to the server
- `client.getAPI(connection)` - Get API instance for a connection
- `client.use(middleware)` - Add middleware

## Middleware Usage

TypedRPC supports middleware for both servers and clients:

```typescript
class MyMiddleware extends TypedRPCMiddleware{

    async inbound(context: TypedRPCContext): Promise<TypedRPCContext> {
      // Do something when inbound packet
      return context;
    }

    async outbound(context: TypedRPCContext): Promise<TypedRPCContext> {
      // Do something when outbound packet
      return context;
    }

}
```

## Context Usage

TypedRPC provides a built-in context system that allows you to access request context in your service methods. This is particularly useful for accessing connection information, authentication data, or other request-specific data.

### Example: Using Context in Services

```typescript
// Server-side code
import { TypedRPCServer, TypedRPCAPIDefine, TypedRPCContextSymbol, type TypedRPCContext, type TypedRPCContextAware } from '@mingzey/typedrpc';

// Define service interface
interface MathServiceInterface {
    add(a: number, b: number):number;
}

// Create API definition
const serverAPIDefine = new TypedRPCAPIDefine<{
    math: MathServiceInterface,
}>();

// Create server instance
const server = new TypedRPCServer({
    local: serverAPIDefine,
});

// Implement service with context awareness
class MathService implements MathServiceInterface, TypedRPCContextAware {
    // Inject context using TypedRPCContextSymbol
    [TypedRPCContextSymbol]: TypedRPCContext | null = null;

    /**
     * For safety, must use @TypedRPCAPIDefine.method() to mark method as RPC method in service usage
     * You need set experimentalDecorators:true in tsconfig.json
     */
    @TypedRPCAPIDefine.method()
    add(a: number, b: number): number {
        // Access context
        const context = this[TypedRPCContextSymbol];
        if (!context) {
            throw new Error('Context is not available');
        }
        
        // Use context information (e.g., connection details, authentication)
        console.log('Request received from:', context.connection);
        
        return a + b;
    }
}

// Hook service to server, only methods marked with @TypedRPCAPIDefine.method() will be hooked
server.hookService('math', new MathService());

// Start server
server.listen({
    port: 3698,
});
```

```typescript
// Client-side code
import { TypedRPCClient, TypedRPCAPIDefine } from 'typedrpc';

// Reuse API definition
const serverAPIDefine = new TypedRPCAPIDefine<{
    math: MathServiceInterface,
}>();

// Create client
const client = new TypedRPCClient({
    remote: serverAPIDefine,
});

// Connect and make RPC call
const connection = await client.connect("localhost:3698");
const api = client.getAPI(connection);
const result = await api.math.add.call(1, 2); // Returns 3
```

## More Usage

see `./test/*.ts` for more usage.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](https://github.com/MingZeY/TypedRPC/blob/master/LICENSE) file for details.

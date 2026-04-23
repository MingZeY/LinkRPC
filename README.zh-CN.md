[English](./README.md) / [中文](./README.zh-CN.md)

# LinkRPC

基于 TypeScript 的 RPC 框架，支持多种连接类型，包括 HTTP、Socket 和 SocketIO。

## 仓库

[Github](https://github.com/MingZeY/LinkRPC)

## 特性

- 🛡️ **类型安全的 RPC 调用** - 利用 TypeScript 的类型系统实现端到端的类型安全
- 🔌 **多种连接类型** - 支持 HTTP、Socket 和 SocketIO 连接，或自定义`LinkRPCProvider`
- 🔄 **中间件支持** - 可扩展的中间件系统，用于请求/响应处理
- 📝 **上下文感知** - 内置上下文系统，用于在处理程序之间传递数据
- 🔁 **双向通信** - 支持客户端和服务器之间的双向 RPC 调用，能力取决于连接类型
- 📦 **易于使用** - 用于定义服务和方法的简单 API
- 🚀 **零依赖** - 不依赖任何外部库，仅依赖 TypeScript 标准库
- 🌐 **前后端通用** - 可在 Node.js 后端和浏览器前端使用
- 📈 **高拓展性** - 可轻松集成入 Electron、Express 等框架作为 RPC 调用方案

## 安装

```bash
npm install linkrpc
```

## 基本使用

### 服务器设置

```typescript
import { LinkRPCServer, LinkRPCAPIDefine } from 'linkrpc';

// 定义 API 接口
const ServerAPIDefine = new LinkRPCAPIDefine<{
    // 服务层 - 在此处定义服务或使用接口继承
    math:{
        // 方法层 - 在此处定义方法
        add(a:number,b:number):number,
    },
}>({
    timeout:10 * 1000
});

// 创建服务器实例
const server = new LinkRPCServer({
    // 让 TypeScript 从 ServerAPIDefine 推断类型
    local:ServerAPIDefine,
    // 连接层 - 在此处使用 Provider 或 自定义的 Provider
    // provider:new LinkRPCBuildin.provider.default(),
    // provider:new LinkRPCBuildin.provider.http(),
    // provider:new LinkRPCBuildin.provider.socket(),
    // provider:new LinkRPCBuildin.provider.socketio(),
});

// 挂钩服务方法
server.hook('math','add',{
    handler: (a,b) => a+b,
});

// 开始监听
server.listen({
    port:3698,
})
```

### 客户端设置

```typescript
import { LinkRPCClient, LinkRPCAPIDefine } from 'linkrpc';
// 重用或导入相同的 API 定义
const ServerAPIDefine = new LinkRPCAPIDefine<{
  math:{
      add(a:number,b:number):number,
  },
}>();

// 创建客户端实例
const client = new LinkRPCClient({
    // 让 TypeScript 从 ServerAPIDefine 推断类型
    remote:ServerAPIDefine,
});

// 连接到服务器
const connection = await client.connect({
    port:3698,
});

// 获取 API 实例
const api = client.getAPI(connection);

// 进行 RPC 调用
const result = await api.math.add.call(1,2); // 返回 3
```

## 连接类型

LinkRPC 支持多种连接类型：

1. **HTTP** - HTTP 连接
2. **Socket** - 原始套接字连接
3. **SocketIO** - Socket.IO 连接
4. **自定义** - 用户定义的连接提供者，参见抽象类 `LinkRPCProvider`

```typescript
new LinkRPCServer({
    local:ServerAPIDefine,
    // optional, default is default provider
    // 连接层 - 在此处使用 Provider 或 自定义的 Provider
    // provider:new LinkRPCBuildin.provider.default(),
    // provider:new LinkRPCBuildin.provider.http(),
    // provider:new LinkRPCBuildin.provider.socket(),
    // provider:new LinkRPCBuildin.provider.socketio(),
})
```

## API 文档

### 服务器 API

- `new LinkRPCServer(config)` - 创建新的服务器实例
- `server.hook(serviceName, methodName, config)` - 挂钩单个方法
- `server.hookService(serviceName, instance)` - 挂钩整个服务
- `server.use(middleware)` - 添加中间件
- `server.listen()` - 开始监听连接
- `server.close()` - 关闭服务器

### 客户端 API

- `new LinkRPCClient(config)` - 创建新的客户端实例
- `client.connect()` - 连接到服务器
- `client.getAPI(connection)` - 获取连接的 API 实例
- `client.use(middleware)` - 添加中间件

## 中间件使用

LinkRPC 支持服务器和客户端的中间件：

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

## 上下文使用

LinkRPC 提供内置的上下文系统，允许您在服务方法中访问请求上下文。这对于访问连接信息、认证数据或其他请求特定数据特别有用。

### 示例：在服务中使用上下文

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

see `./example/*.ts` for more usage.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](https://github.com/MingZeY/LinkRPC/blob/master/LICENSE) file for details.

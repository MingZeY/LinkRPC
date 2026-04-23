import { RPCConnection } from "../../connection.js";
import { RPCPacketFactory, type RPCPacket } from "../../packet.js";
import { RPCProvider } from "../../provider.js";
import { dynamicimport } from "../../utils.js";

type SupportLibSocketIO = typeof import('socket.io');
type SupportLibSocketIOClient = typeof import('socket.io-client');
type SupportLibHTTP = typeof import('http');
type SupportLib = {
    "socket.io"?:Promise<SupportLibSocketIO>,
    "socket.io-client"?:Promise<SupportLibSocketIOClient>,
    "http"?:Promise<SupportLibHTTP>,
}

type SupportLibType = {
    "socket.io-client":{
        ManagerOptions:import('socket.io-client').ManagerOptions;
        SocketOptions:import('socket.io-client').SocketOptions;
    },
    "socket.io":{
        ServerOptions:import('socket.io').ServerOptions;
    }
}


class RPCConnectionSocketIOServer extends RPCConnection{

    private closed = false;

    constructor(private socket:InstanceType<SupportLibSocketIO['Socket']>){
        super();
        this.socket.on('message',(data:string) => {
            const packet = RPCPacketFactory.parsePacketFromString(data);
            if(packet){
                this.emitter.emit('receive',packet);
            }
        })
        this.socket.on('close',() => {
            this.emitter.emit('closed');
            this.closed = true;
        })
    }

    send(packet: RPCPacket): Promise<void> {
        this.socket.emit('message',JSON.stringify(packet));
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(this.closed){
            return Promise.resolve()
        }
        this.closed = true;
        this.socket.disconnect();
        return Promise.resolve();
    }

    isClosed(): boolean {
        return this.closed;
    }
    
}

class RPCConnectionSocketIOClient extends RPCConnection{

    private closed = false;

    constructor(private socket:InstanceType<SupportLibSocketIOClient['Socket']>){
        super();
        this.socket.on('message',(data:string) => {
            const packet = RPCPacketFactory.parsePacketFromString(data);
            if(packet){
                this.emitter.emit('receive',packet);
            }
        })
        this.socket.on('disconnect',() => {
            this.emitter.emit('closed');
            this.closed = true;
        })
    }

    send(packet: RPCPacket): Promise<void> {
        this.socket.emit('message',JSON.stringify(packet));
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(this.closed){
            return Promise.resolve()
        }
        this.closed = true;
        this.socket.disconnect();
        return Promise.resolve();
    }

    isClosed(): boolean {
        return this.closed;
    }
    
}


type RPCProviderSocketIOConfig = {
    lib?:SupportLib|undefined,
    httpServer?:InstanceType<SupportLibHTTP['Server']>,
    ioServer?:InstanceType<SupportLibSocketIO['Server']>,
    ioClient?:InstanceType<SupportLibSocketIOClient['Socket']>,
    options?:{
        server?:Partial<SupportLibType['socket.io']['ServerOptions']> | undefined,
        client?:Partial<SupportLibType['socket.io-client']['ManagerOptions'] & SupportLibType['socket.io-client']['SocketOptions']> | undefined
    }
}

class RPCProviderSocketIO extends RPCProvider{

    private config:RPCProviderSocketIOConfig;

    private sockets:Set<InstanceType<SupportLibSocketIO['Socket']>> = new Set();

    constructor(
        config?:RPCProviderSocketIOConfig
    ){
        super();
        const defaultConfig:RPCProviderSocketIOConfig = {}
        this.config = {
            ...defaultConfig,
            ...config,
        }
        this.config.lib = this.initLib(this.config.lib || {})
        if(this.config.httpServer){
            this.initHttpServer(this.config.httpServer);
        }
        if(this.config.ioServer){
            if(this.config.options?.server){
                throw Error("If instance ioServer has already been provided, the options for the instance are not effective and should not be passed in");
            }
            this.initSocketIOServer(this.config.ioServer);
        }
        if(this.config.ioClient){
            if(this.config.options?.client){
                throw Error("If instance ioClient has already been provided, the options for the instance are not effective and should not be passed in");
            }
            this.initSocketIOClient(this.config.ioClient);
        }
    }

    private initLib(lib:SupportLib):SupportLib{
        if(!lib['http']){
            lib['http'] = dynamicimport('http').catch(() => undefined)
        }
        if(!lib["socket.io"]){
            lib["socket.io"] = dynamicimport('socket.io').catch(() => undefined)
        }
        if(!lib["socket.io-client"]){
            lib["socket.io-client"] = dynamicimport('socket.io-client').catch(() => undefined)
        }
        return lib;
    }

    private async createHttpServer():Promise<InstanceType<SupportLibHTTP['Server']>>{
        const httpSupport = await this.config.lib?.http;
        if(!httpSupport){
            throw Error("http module not found,try set config.lib.http to import('http') or install http module");
        }
        return httpSupport.createServer();
    }

    private async createSocketIOServer(
        httpServer:InstanceType<SupportLibHTTP['Server']>,
        options?:Partial<SupportLibType['socket.io']['ServerOptions']> | undefined,
    ):Promise<InstanceType<SupportLibSocketIO['Server']>>{
        const socketIOSupport = await this.config.lib?.["socket.io"];
        if(!socketIOSupport){
            throw new Error('socket.io module not found,try set config.lib.socketio to import("socket.io") or install socket.io module');
        }
        const server = new socketIOSupport.Server(httpServer,{
            cors:{
                origin:'*',
                methods:['GET','POST'],
            },
            ...options,
        });
        return server;
    }

    private async createSocketIOClient(target:string,options?:Partial<SupportLibType['socket.io-client']['ManagerOptions'] & SupportLibType['socket.io-client']['SocketOptions']> | undefined):Promise<InstanceType<SupportLibSocketIOClient['Socket']>>{
        const socketIOClientSupport = await this.config.lib?.["socket.io-client"];
        if(!socketIOClientSupport){
            throw new Error('socket.io-client module not found,try set config.lib.socketio-client to import("socket.io-client") or install socket.io-client module');
        }
        const socket = socketIOClientSupport.io(target,options);
        return socket;
    }

    private initHttpServer(server:InstanceType<SupportLibHTTP['Server']>):InstanceType<SupportLibHTTP['Server']>{
        return server;
    }

    private initSocketIOServer(server:InstanceType<SupportLibSocketIO['Server']>):InstanceType<SupportLibSocketIO['Server']>{
        server.on('connection',(socket) => {
            this.sockets.add(socket);
            socket.on('disconnect',() => {
                this.sockets.delete(socket);
            })
            const connection = new RPCConnectionSocketIOServer(socket);
            this.emitter.emit('connection',connection);
        })
        return server;
    }

    private initSocketIOClient(client:InstanceType<SupportLibSocketIOClient['Socket']>):InstanceType<SupportLibSocketIOClient['Socket']>{
        return client;
    }
    
    listen(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<void> {
        return new Promise<void>(async (resolve) => {
            if(!this.config.httpServer){
                this.config.httpServer = this.initHttpServer(await this.createHttpServer());
            }
            if(!this.config.ioServer){
                this.config.ioServer = this.initSocketIOServer(await this.createSocketIOServer(this.config.httpServer,this.config.options?.server));
            }
            this.config.httpServer.listen(params?.port,params?.hostname,() => {
                resolve();
            })
        })
    }


    close(): Promise<void> {
        return new Promise((resolve) => {
            if(!this.config.httpServer){
                throw Error("httpServer is not initialized");
            }
            this.sockets.forEach((socket) => {
                socket.disconnect();
            })
            this.sockets.clear();
            this.config.httpServer.close(() => {
                resolve();
            })
        })
    }

    async connect(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<RPCConnection> {
        if(!params || !params.port){
            throw Error("params.port is required");
        }
        const client = this.initSocketIOClient(await this.createSocketIOClient(`ws://${params?.hostname||'localhost'}:${params.port}`,this.config.options?.client));
        const connection = new RPCConnectionSocketIOClient(client);
        return new Promise<RPCConnection>((resolve) => {
            client.on('connect',() => {
                resolve(connection);
            })
        })
    }

}

export {
    RPCProviderSocketIO
}
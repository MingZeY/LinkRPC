import { LinkRPCConnection, MAX_BINARY_PAYLOAD_SIZE, MAX_CHANNEL_NAME_LENGTH } from "../../connection.js";
import { LinkRPCPacketFactory, type LinkRPCPacket } from "../../packet.js";
import { LinkRPCProvider } from "../../provider.js";
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


class LinkRPCConnectionSocketIOServer extends LinkRPCConnection{
    constructor(private socket:InstanceType<SupportLibSocketIO['Socket']>){
        super();
        this.socket.on('message',(data:string) => {
            const packet = LinkRPCPacketFactory.parsePacketFromString(data);
            if(packet){
                this.emitter.emit('receive',packet);
            }
        })
        this.socket.on('channel', (frame: Buffer) => {
            if (frame.length < 4) return;
            const nameLen = frame.readUInt32BE(0);
            if (nameLen > MAX_CHANNEL_NAME_LENGTH) {
                this.close();
                return;
            }
            if (frame.length < 4 + nameLen) return;
            const channel = frame.subarray(4, 4 + nameLen).toString('utf-8');
            const data = frame.subarray(4 + nameLen);
            if (data.length > MAX_BINARY_PAYLOAD_SIZE) {
                this.close();
                return;
            }
            this.emitter.emit('binary', channel, data);
        })
        this.socket.on('disconnect',() => {
            this.emitter.emit('closed');
        })
    }

    send(packet: LinkRPCPacket): Promise<void> {
        this.socket.emit('message',JSON.stringify(packet));
        return Promise.resolve();
    }

    sendBinary(channel: string, data: Uint8Array): Promise<void> {
        const nameBuf = Buffer.from(channel, 'utf-8');
        if (nameBuf.length > MAX_CHANNEL_NAME_LENGTH) {
            throw new Error(`Channel name exceeds ${MAX_CHANNEL_NAME_LENGTH} bytes`);
        }
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        if (payload.length > MAX_BINARY_PAYLOAD_SIZE) {
            throw new Error(`Payload exceeds ${MAX_BINARY_PAYLOAD_SIZE} bytes`);
        }
        const nameLen = Buffer.alloc(4);
        nameLen.writeUInt32BE(nameBuf.length, 0);
        this.socket.emit('channel', Buffer.concat([nameLen, nameBuf, payload]));
        return Promise.resolve();
    }

    close(): Promise<void> {
        this.socket.disconnect();
        return Promise.resolve();
    }

    isClosed(): boolean {
        return this.socket.disconnected;
    }
    
}

class LinkRPCConnectionSocketIOClient extends LinkRPCConnection{

    private closed = false;

    constructor(private socket:InstanceType<SupportLibSocketIOClient['Socket']>){
        super();
        this.socket.on('message',(data:string) => {
            const packet = LinkRPCPacketFactory.parsePacketFromString(data);
            if(packet){
                this.emitter.emit('receive',packet);
            }
        })
        this.socket.on('channel', (frame: Buffer) => {
            if (frame.length < 4) return;
            const nameLen = frame.readUInt32BE(0);
            if (nameLen > MAX_CHANNEL_NAME_LENGTH) {
                this.close();
                return;
            }
            if (frame.length < 4 + nameLen) return;
            const channel = frame.subarray(4, 4 + nameLen).toString('utf-8');
            const data = frame.subarray(4 + nameLen);
            if (data.length > MAX_BINARY_PAYLOAD_SIZE) {
                this.close();
                return;
            }
            this.emitter.emit('binary', channel, data);
        })
        this.socket.on('disconnect',() => {
            this.emitter.emit('closed');
            this.closed = true;
        })
    }

    send(packet: LinkRPCPacket): Promise<void> {
        this.socket.emit('message',JSON.stringify(packet));
        return Promise.resolve();
    }

    sendBinary(channel: string, data: Uint8Array): Promise<void> {
        const nameBuf = Buffer.from(channel, 'utf-8');
        if (nameBuf.length > MAX_CHANNEL_NAME_LENGTH) {
            throw new Error(`Channel name exceeds ${MAX_CHANNEL_NAME_LENGTH} bytes`);
        }
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        if (payload.length > MAX_BINARY_PAYLOAD_SIZE) {
            throw new Error(`Payload exceeds ${MAX_BINARY_PAYLOAD_SIZE} bytes`);
        }
        const nameLen = Buffer.alloc(4);
        nameLen.writeUInt32BE(nameBuf.length, 0);
        this.socket.emit('channel', Buffer.concat([nameLen, nameBuf, payload]));
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

class LinkRPCProviderSocketIO extends LinkRPCProvider{

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
            const connection = new LinkRPCConnectionSocketIOServer(socket);
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

    async connect(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<LinkRPCConnection> {
        if(!params || !params.port){
            throw Error("params.port is required");
        }
        const client = this.initSocketIOClient(await this.createSocketIOClient(`ws://${params?.hostname||'localhost'}:${params.port}`,this.config.options?.client));
        const connection = new LinkRPCConnectionSocketIOClient(client);
        return new Promise<LinkRPCConnection>((resolve) => {
            client.on('connect',() => {
                resolve(connection);
            })
        })
    }

}

export {
    LinkRPCProviderSocketIO
}
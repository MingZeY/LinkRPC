import { LinkRPCConnection } from "../../connection.js";
import { LinkRPCPacketFactory, type LinkRPCPacket } from "../../packet.js";
import { LinkRPCProvider } from "../../provider.js";
import { dynamicimport } from "../../utils.js";

type SupportLibNet = typeof import('net');
type SupportLib = {
    net?:Promise<SupportLibNet>
}

class LinkRPCConnectionSocket extends LinkRPCConnection{

    constructor(
        private socket:InstanceType<SupportLibNet['Socket']>
    ){
        super();
        socket.on('close',() => {
            this.emitter.emit('closed');
        })
    }

    send(packet: LinkRPCPacket): Promise<void> {
        const buffer = Buffer.from(JSON.stringify(packet));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(buffer.length,0);
        this.socket.write(length);
        this.socket.write(buffer);
        return Promise.resolve();
    }

    close(): Promise<void> {
        return new Promise((resolve) => {
            this.socket.end(() => {
                resolve();
            })
        })
    }

    isClosed(): boolean {
        return this.socket.closed;
    }
    
}

type LinkRPCConnectionProviderSocketConfig = {
    server?:InstanceType<SupportLibNet['Server']> | undefined;
    lib?:SupportLib | undefined;
}


class LinkRPCProviderSocket extends LinkRPCProvider{

    private sockets:Set<InstanceType<SupportLibNet['Socket']>> = new Set();

    constructor(public config:LinkRPCConnectionProviderSocketConfig = {}){
        super();
        this.initLib();
        if(this.config.server){
            this.initServer(this.config.server);
        }
    }

    private initLib(){
        if(!this.config.lib){
            this.config.lib = {}
        }
        if(!this.config.lib.net){
            this.config.lib.net = dynamicimport('net').catch(() => undefined)
        }
    }

    private async createServer():Promise<InstanceType<SupportLibNet['Server']>>{
        const netSupport = await this.config.lib?.net;
        if(!netSupport){
            throw new Error('net module not found,try set config.lib.net to import("net") or install net module');
        }
        const server = netSupport.createServer();
        return server;
    }

    private initServer(server:InstanceType<SupportLibNet['Server']>){
        server.addListener('connection',(socket) => {
            const connection = this.createConnection(socket);
            this.sockets.add(socket);
            socket.on('close',() => {
                this.sockets.delete(socket);
            })
            this.emitter.emit('connection',connection);
        })
    }

    private createConnection(socket:InstanceType<SupportLibNet['Socket']>):LinkRPCConnectionSocket{
        const connection = new LinkRPCConnectionSocket(socket);

        let buffer = Buffer.alloc(0);
        let expectedLength: number | null = null;
        socket.on('data',(chunk) => {
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
            while (buffer.length >= 4) {
                if (expectedLength === null) {
                    // 读取消息长度
                    expectedLength = buffer.readUInt32BE(0);
                    buffer = Buffer.from(buffer.subarray(4));
                }

                if (buffer.length >= expectedLength) {
                    // 读取完整消息
                    const message = buffer.subarray(0, expectedLength).toString();
                    buffer = Buffer.from(buffer.subarray(expectedLength));
                    expectedLength = null;

                    // 处理消息
                    const packet = LinkRPCPacketFactory.parsePacketFromString(message);
                    if(packet){
                        connection.emitter.emit('receive',packet);
                    }
                } else {
                    break;
                }
            }
        })

        socket.on('error',(error) => {
            connection.close();
        })

        socket.on('close',() => {
            connection.close();
        })
        return connection;
    }
    
    listen(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<void> {
        return new Promise(async (resolve) => {
            if(!this.config.server){
                this.config.server = await this.createServer();
                this.initServer(this.config.server)
            }
            this.config.server.listen(params?.port, params?.hostname, () => {
                resolve();
            });
        })
    }

    close(): Promise<void> {
        return new Promise((resolve) => {
            if(!this.config.server){
                throw new Error("server is not set");
            }
            this.sockets.forEach((socket) => {
                socket.end();
            })
            this.config.server.close(() => {
                resolve();
            });
        })
    }

    async connect(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<LinkRPCConnection> {

        const netSupport = await this.config.lib?.net;
        if(!netSupport){
            throw new Error('net module not found,try set config.lib.net to import("net") or install net module');
        }

        const socket = new netSupport.Socket();
        const connection = this.createConnection(socket);

        return new Promise((resolve,reject) => {
            if(!params?.port){
                throw new Error("port is required");
            }
            socket.on('error',(error) => {
                reject(error);
            })
            socket.connect({
                host:params?.hostname,
                port:params.port,
            },() => {
                resolve(connection);
            })
        })
    }
    
}

export{
    LinkRPCProviderSocket,
}
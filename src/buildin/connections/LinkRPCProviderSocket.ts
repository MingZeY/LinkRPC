import { LinkRPCConnection, MAX_BINARY_PAYLOAD_SIZE, MAX_CHANNEL_NAME_LENGTH } from "../../connection.js";
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
        const header = Buffer.alloc(5);
        header.writeUInt8(0x01, 0);
        header.writeUInt32BE(buffer.length, 1);
        this.socket.write(Buffer.concat([header, buffer]));
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
        const nameLenBuf = Buffer.alloc(4);
        nameLenBuf.writeUInt32BE(nameBuf.length, 0);
        const dataLenBuf = Buffer.alloc(4);
        dataLenBuf.writeUInt32BE(payload.length, 0);
        const totalMessageLen = 4 + nameBuf.length + 4 + payload.length;
        const header = Buffer.alloc(5);
        header.writeUInt8(0x02, 0);
        header.writeUInt32BE(totalMessageLen, 1);
        this.socket.write(Buffer.concat([header, nameLenBuf, nameBuf, dataLenBuf, payload]));
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

        const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;
        const MAX_BINARY_MESSAGE_SIZE = MAX_BINARY_PAYLOAD_SIZE + MAX_CHANNEL_NAME_LENGTH + 9;

        let buffer = Buffer.alloc(0);
        let frameType: number | null = null;
        let expectedLength: number | null = null;

        socket.on('data',(chunk) => {
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

            while (true) {
                if (frameType === null) {
                    if (buffer.length < 1) break;
                    frameType = buffer.readUInt8(0);
                    buffer = buffer.subarray(1);
                }

                if (expectedLength === null) {
                    if (buffer.length < 4) break;
                    expectedLength = buffer.readUInt32BE(0);
                    const maxSize = frameType === 0x02 ? MAX_BINARY_MESSAGE_SIZE : MAX_MESSAGE_SIZE;
                    if (expectedLength > maxSize) {
                        connection.close();
                        socket.destroy();
                        return;
                    }
                    buffer = buffer.subarray(4);
                }

                if (buffer.length < expectedLength) break;

                const message = buffer.subarray(0, expectedLength);
                buffer = buffer.subarray(expectedLength);

                if (frameType === 0x01) {
                    const packet = LinkRPCPacketFactory.parsePacketFromString(message.toString());
                    if (packet) {
                        connection.emitter.emit('receive', packet);
                    }
                } else if (frameType === 0x02) {
                    if (message.length < 8) {
                        connection.close();
                        socket.destroy();
                        return;
                    }
                    const nameLen = message.readUInt32BE(0);
                    if (nameLen > MAX_CHANNEL_NAME_LENGTH || message.length < 8 + nameLen) {
                        connection.close();
                        socket.destroy();
                        return;
                    }
                    const channel = message.subarray(4, 4 + nameLen).toString('utf-8');
                    const dataLen = message.readUInt32BE(4 + nameLen);
                    if (dataLen > MAX_BINARY_PAYLOAD_SIZE || message.length < 8 + nameLen + dataLen) {
                        connection.close();
                        socket.destroy();
                        return;
                    }
                    const payload = message.subarray(8 + nameLen, 8 + nameLen + dataLen);
                    connection.emitter.emit('binary', channel, payload);
                } else {
                    connection.close();
                    socket.destroy();
                    return;
                }

                frameType = null;
                expectedLength = null;
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
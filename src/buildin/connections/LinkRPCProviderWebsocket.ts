import { LinkRPCConnection, MAX_BINARY_PAYLOAD_SIZE, MAX_CHANNEL_NAME_LENGTH } from '../../connection.js'
import { LinkRPCPacketFactory, type LinkRPCPacket } from '../../packet.js';
import { LinkRPCProvider } from '../../provider.js'
import { dynamicimport } from '../../utils.js';


type Protocol = 'ws' | 'wss';

type SupportLibHTTP = typeof import('http');
type SupportLibHTTPS = typeof import('https');
type SupportLibWS = typeof import('ws');
type SupportLib = {
    http?: Promise<SupportLibHTTP>,
    https?: Promise<SupportLibHTTPS>,
    ws?: Promise<SupportLibWS>,
    websocket?: typeof WebSocket,
}

type WebSocketServer = import('ws').Server;
type WebSocketClient = import('ws').WebSocket;

class LinkRPCConnectionWS extends LinkRPCConnection {

    private closed = false;

    constructor(
        private socket: WebSocketClient
    ) {
        super();
        socket.on('message', (data: Buffer | string, isBinary: boolean) => {
            if (isBinary) {
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
                if (buf.length < 4) return;
                const nameLen = buf.readUInt32BE(0);
                if (nameLen > MAX_CHANNEL_NAME_LENGTH) {
                    this.close();
                    return;
                }
                if (buf.length < 4 + nameLen) return;
                const channel = buf.subarray(4, 4 + nameLen).toString('utf-8');
                const payload = buf.subarray(4 + nameLen);
                if (payload.length > MAX_BINARY_PAYLOAD_SIZE) {
                    this.close();
                    return;
                }
                this.emitter.emit('binary', channel, payload);
            } else {
                const message = typeof data === 'string' ? data : data.toString();
                const packet = LinkRPCPacketFactory.parsePacketFromString(message);
                if (packet) {
                    this.emitter.emit('receive', packet);
                }
            }
        });
        socket.on('close', () => {
            this.closed = true;
            this.emitter.emit('closed');
        });
    }

    send(packet: LinkRPCPacket): Promise<void> {
        if (this.isClosed()) {
            throw new Error('connection is closed');
        }
        this.socket.send(JSON.stringify(packet));
        return Promise.resolve();
    }

    sendBinary(channel: string, data: Uint8Array): Promise<void> {
        if (this.isClosed()) throw new Error('connection is closed');
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
        this.socket.send(Buffer.concat([nameLen, nameBuf, payload]), { binary: true });
        return Promise.resolve();
    }

    close(): Promise<void> {
        if (this.closed) {
            return Promise.resolve();
        }
        this.closed = true;
        this.socket.close();
        this.emitter.emit('closed');
        return Promise.resolve();
    }

    isClosed(): boolean {
        return this.closed;
    }

}

class LinkRPCConnectionWebsocket extends LinkRPCConnection {

    constructor(
        private socket: InstanceType<typeof WebSocket>
    ) {
        super();
        socket.binaryType = 'arraybuffer';
        socket.addEventListener('message', (event) => {
            const data = event.data;
            if (data instanceof ArrayBuffer) {
                if (data.byteLength < 4) return;
                const view = new DataView(data);
                const nameLen = view.getUint32(0, false);
                if (nameLen > MAX_CHANNEL_NAME_LENGTH) {
                    this.close();
                    return;
                }
                if (data.byteLength < 4 + nameLen) return;
                const nameBytes = new Uint8Array(data, 4, nameLen);
                const channel = new TextDecoder().decode(nameBytes);
                const payloadLen = data.byteLength - 4 - nameLen;
                if (payloadLen > MAX_BINARY_PAYLOAD_SIZE) {
                    this.close();
                    return;
                }
                const payload = new Uint8Array(data, 4 + nameLen);
                this.emitter.emit('binary', channel, payload);
            } else if (typeof data === 'string') {
                const packet = LinkRPCPacketFactory.parsePacketFromString(data);
                if (packet) {
                    this.emitter.emit('receive', packet);
                }
            }
        })
        socket.addEventListener('close', () => {
            this.emitter.emit('closed');
        })
    }

    send(packet: LinkRPCPacket): Promise<void> {
        if (this.isClosed()) {
            throw new Error('connection is closed');
        }
        this.socket.send(JSON.stringify(packet));
        return Promise.resolve()
    }

    sendBinary(channel: string, data: Uint8Array): Promise<void> {
        if (this.isClosed()) throw new Error('connection is closed');
        const nameBuf = new TextEncoder().encode(channel);
        if (nameBuf.length > MAX_CHANNEL_NAME_LENGTH) {
            throw new Error(`Channel name exceeds ${MAX_CHANNEL_NAME_LENGTH} bytes`);
        }
        if (data.length > MAX_BINARY_PAYLOAD_SIZE) {
            throw new Error(`Payload exceeds ${MAX_BINARY_PAYLOAD_SIZE} bytes`);
        }
        const frame = new Uint8Array(4 + nameBuf.length + data.length);
        const view = new DataView(frame.buffer);
        view.setUint32(0, nameBuf.length, false);
        frame.set(nameBuf, 4);
        frame.set(data, 4 + nameBuf.length);
        this.socket.send(frame.buffer);
        return Promise.resolve();
    }

    close(): Promise<void> {
        if (this.isClosed()) {
            return Promise.resolve();
        }
        this.socket.close();
        return Promise.resolve();
    }
    isClosed(): boolean {
        return this.socket.readyState == WebSocket.CLOSED;
    }

}

type LinkRPCProviderWebsocketConfig = {
    lib?: SupportLib,
    server?: InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>,
    protocol?: Protocol,
    ssl?: {
        cert: string | Buffer,
        key: string | Buffer,
    },
}

class LinkRPCProviderWebsocket extends LinkRPCProvider {

    private defaultProtocol: Protocol = 'ws';
    private config: LinkRPCProviderWebsocketConfig;
    private sockets: Set<WebSocketClient> = new Set();
    private wsServer?: WebSocketServer;

    constructor(config?: LinkRPCProviderWebsocketConfig) {
        super();
        const defaultConfig: LinkRPCProviderWebsocketConfig = {}
        this.config = { ...defaultConfig, ...config };
        this.initLib();
        if (this.config.server) {
            this.initServer(this.config.server);
        }
    }

    private initLib() {
        if (!this.config.lib) {
            this.config.lib = {};
        }
        const protocol: Protocol = this.config.protocol || this.defaultProtocol;
        if (protocol === 'wss') {
            if (!this.config.lib.https) {
                this.config.lib.https = dynamicimport('https').catch(() => undefined);
            }
        } else {
            if (!this.config.lib.http) {
                this.config.lib.http = dynamicimport('http').catch(() => undefined);
            }
        }
        if (!this.config.lib.ws) {
            this.config.lib.ws = dynamicimport('ws').catch(() => undefined);
        }
        if (!this.config.lib.websocket) {
            if("WebSocket" in globalThis){
                this.config.lib.websocket = globalThis['WebSocket'];
            }
        }
    }

    private async createServer(): Promise<InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>> {
        const protocol: Protocol = this.config.protocol || this.defaultProtocol;
        if (protocol === 'wss') {
            const httpsSupport = await this.config.lib?.https;
            if (!httpsSupport) {
                throw new Error("https module not found, try set config.lib.https to import('https') or install https module");
            }
            if (!this.config.ssl) {
                throw new Error("WSS requires ssl.cert and ssl.key in config");
            }
            return httpsSupport.createServer({
                cert: this.config.ssl.cert,
                key: this.config.ssl.key,
            });
        }
        const httpSupport = await this.config.lib?.http;
        if (!httpSupport) {
            throw new Error("http module not found, try set config.lib.http to import('http') or install http module");
        }
        return httpSupport.createServer();
    }

    private async createWebSocketServer(server: InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>): Promise<WebSocketServer> {
        const wsSupport = await this.config.lib?.ws;
        if (!wsSupport) {
            throw new Error('ws module not found, try set config.lib.ws to import("ws") or install ws module');
        }
        const wsServer = new wsSupport.WebSocketServer({ server });
        return wsServer;
    }

    private initServer(server: InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>): void {
        this.createWebSocketServer(server).then((wsServer) => {
            this.wsServer = wsServer;
            wsServer.on('connection', (socket: WebSocketClient) => {
                this.sockets.add(socket);
                socket.on('close', () => {
                    this.sockets.delete(socket);
                });
                const connection = new LinkRPCConnectionWS(socket);
                this.emitter.emit('connection', connection);
            });
        });
    }

    async listen(params?: { hostname?: string | undefined; port?: number | undefined }): Promise<void> {
        return new Promise<void>(async (resolve) => {
            if (!this.config.server) {
                this.config.server = await this.createServer();
                this.initServer(this.config.server);
            }
            this.config.server.listen({
                port: params?.port,
                host: params?.hostname,
            }, () => {
                resolve();
            });
        });
    }

    async close(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.config.server) {
                throw new Error("close requires server");
            }
            this.sockets.forEach((socket) => {
                socket.close();
            });
            this.sockets.clear();
            if (this.wsServer) {
                this.wsServer.close(() => {
                    this.config.server?.close(() => {
                        resolve();
                    });
                });
            } else {
                this.config.server.close(() => {
                    resolve();
                });
            }
        });
    }

    async connect(params?: { hostname?: string | undefined; port?: number | undefined }): Promise<LinkRPCConnection> {
        if ("window" in globalThis) {
            return this.connectByWebsocket(params);
        } else {
            return this.connectByWS(params);
        }
    }

    async connectByWS(params?: { hostname?: string | undefined; port?: number | undefined }): Promise<LinkRPCConnection> {
        if (!params || !params.port) {
            throw new Error("connect requires port");
        }
        const wsSupport = await this.config.lib?.ws;
        if (!wsSupport) {
            throw new Error('ws module not found, try set config.lib.ws to import("ws") or install ws module');
        }
        const protocol: Protocol = this.config.protocol || this.defaultProtocol;
        const url = `${protocol}://${params.hostname || 'localhost'}:${params.port}`;
        const socket = new wsSupport.WebSocket(url);
        const connection = new LinkRPCConnectionWS(socket);
        return new Promise<LinkRPCConnection>((resolve) => {
            socket.on('open', () => {
                resolve(connection);
            });
        });
    }

    async connectByWebsocket(params?: { hostname?: string | undefined; port?: number | undefined }): Promise<LinkRPCConnection> {
        if (!params || !params.port) {
            throw new Error("connect requires port");
        }
        const websocketSupport = this.config.lib?.websocket;
        if (!websocketSupport) {
            throw new Error('websocket support not found');
        }
        const protocol: Protocol = this.config.protocol || this.defaultProtocol;
        const url = `${protocol}://${params.hostname || 'localhost'}:${params.port}`;
        const socket = new websocketSupport(url);
        const connection = new LinkRPCConnectionWebsocket(socket);
        return new Promise<LinkRPCConnection>((resolve) => {
            socket.addEventListener('open', () => {
                resolve(connection);
            })
        })
    }

}

export {
    LinkRPCProviderWebsocket
}

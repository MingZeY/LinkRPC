import { LinkRPCConnection, MAX_CHANNEL_NAME_LENGTH } from "../../connection.js";
import type { LinkRPCPacket } from "../../packet.js";
import { LinkRPCProvider } from "../../provider.js";

class LinkRPCConnectionMemory extends LinkRPCConnection{
    
    private closed = false;
    private target?:LinkRPCConnectionMemory;

    public setTarget(target:LinkRPCConnectionMemory){
        this.target = target;
    }

    send(packet: LinkRPCPacket): Promise<void> {
        if(!this.target){
            throw new Error("target is not set");
        }
        this.target.emitter.emit('receive',packet);
        return Promise.resolve();
    }

    sendBinary(channel: string, data: Uint8Array): Promise<void> {
        if (!this.target) throw new Error("target is not set");
        if (this.isClosed()) throw new Error('connection is closed');
        if (Buffer.byteLength(channel, 'utf-8') > MAX_CHANNEL_NAME_LENGTH) {
            throw new Error(`Channel name exceeds ${MAX_CHANNEL_NAME_LENGTH} bytes`);
        }
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        this.target.emitter.emit('binary', channel, payload);
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(this.closed){
            throw new Error("connection is closed");
        }
        this.closed = true;
        this.emitter.emit('closed');
        return Promise.resolve();
    }
    isClosed(): boolean {
        return this.closed;
    }
    
}

const LinkRPCProviderMemoryGlobal = new Map<number,LinkRPCProviderMemory>();

class LinkRPCProviderMemory extends LinkRPCProvider{

    private usePort?:number;

    listen(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<void> {
        if(!params || !params.port){
            throw new Error("port is required");
        }
        this.usePort = params.port;
        if(LinkRPCProviderMemoryGlobal.has(this.usePort)){
            throw new Error("port is used");
        }
        LinkRPCProviderMemoryGlobal.set(params.port,this);
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(!this.usePort){
            throw new Error("port is not set");
        }
        LinkRPCProviderMemoryGlobal.delete(this.usePort);
        return Promise.resolve();
    }

    async connect(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<LinkRPCConnection> {
        if(!params?.port){
            throw new Error("port is required");
        }
        const targetProvider = LinkRPCProviderMemoryGlobal.get(params.port);
        if(!targetProvider){
            throw new Error("connect filed port not found");
        }
        
        const connection = new LinkRPCConnectionMemory();
        await targetProvider.onConnect(connection);
        return connection;
    }

    public async onConnect(target:LinkRPCConnectionMemory){
        const connection = new LinkRPCConnectionMemory();
        connection.setTarget(target);
        target.setTarget(connection);
        this.emitter.emit('connection',connection);
    }

}

export {
    LinkRPCProviderMemory
}